import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'
import { paginateResource } from '../../core/list.ts'
import type { RequestFilter } from './requests.dto.ts'

export class RequestRepository extends BaseRepository {
  /** `openStatuses`/`steps` restrict to requests waiting at the given steps (task list). */
  list(opts: { plants: string[] | null; requestedBy?: number; notRequestedBy?: number; steps?: number[]; openStatuses?: string[] },f: RequestFilter, query: Record<string, string | undefined>) {
    let qb = this.db
      .selectFrom('material_requests as r')
      .innerJoin('materials as m', 'm.id', 'r.material_id')
      .innerJoin('users as u', 'u.id', 'r.requested_by')
      .select(['r.id', 'r.material_id', 'r.version', 'r.request_type', 'r.plant', 'r.status', 'r.current_step', 'r.created_at', 'r.updated_at', 'u.name as requested_by_name'])
      .select([
        sql<string>`r.data->>'material_code'`.as('material_code'),
        sql<string>`r.data->>'material_desc'`.as('material_desc'),
        sql<string>`r.data->>'category'`.as('category'),
        sql<string>`r.data->>'vendor_name'`.as('vendor_name'),
      ])
    if (opts.plants) qb = qb.where('r.plant', 'in', opts.plants)
    if (opts.requestedBy) qb = qb.where('r.requested_by', '=', opts.requestedBy)
    if (opts.steps) qb = qb.where('r.status', 'in', opts.openStatuses!).where('r.current_step', 'in', opts.steps.length ? opts.steps : [0])
    if (opts.notRequestedBy) qb = qb.where('r.requested_by', '!=', opts.notRequestedBy)
    // Filters, search, sort and paging: list configuration 'requests' (database).
    return paginateResource(qb, query, 'requests', 'r.id')
  }

  findById(id: number) {
    return this.db
      .selectFrom('material_requests as r')
      .innerJoin('users as u', 'u.id', 'r.requested_by')
      .selectAll('r')
      .select('u.name as requested_by_name')
      .where('r.id', '=', id)
      .executeTakeFirst()
  }

  /** Row lock so two approvers cannot act on the same step at once. */
  lockById(id: number) {
    return this.db.selectFrom('material_requests').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()
  }

  async nextVersion(materialId: number) {
    const { max } = await this.db.selectFrom('material_requests').select((eb) => eb.fn.max<number>('version').as('max')).where('material_id', '=', materialId).executeTakeFirstOrThrow()
    return (max ?? 0) + 1
  }

  insert(row: Record<string, unknown>) {
    return this.db.insertInto('material_requests').values(row).returningAll().executeTakeFirstOrThrow()
  }

  update(id: number, data: Record<string, unknown>) {
    return this.db.updateTable('material_requests').set({ ...data, updated_at: sql`now()` }).where('id', '=', id).execute()
  }

  /** Every action adds one history row, so the count is a monotonic revision of the request. */
  async revision(requestId: number) {
    const { n } = await this.db.selectFrom('approval_histories').select((eb) => eb.fn.countAll<string>().as('n')).where('request_id', '=', requestId).executeTakeFirstOrThrow()
    return Number(n)
  }

  insertHistory(row: Record<string, unknown>) {
    return this.db.insertInto('approval_histories').values(row).execute()
  }

  findHistories(requestId: number) {
    return this.db
      .selectFrom('approval_histories as h')
      .innerJoin('users as u', 'u.id', 'h.user_id')
      .leftJoin('roles as ro', 'ro.code', 'h.role')
      .selectAll('h')
      .select(['u.name as user_name', 'ro.name as role_name'])
      .where('h.request_id', '=', requestId)
      .orderBy('h.created_at')
      .orderBy('h.id')
      .execute()
  }
}
