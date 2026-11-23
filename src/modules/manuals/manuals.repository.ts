import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'
import { paginateResource } from '../../core/list.ts'

export class ManualRepository extends BaseRepository {
  /** `departmentId` set = only manuals shared with that department. */
  private visible(departmentId?: number | null) {
    let qb = this.db
      .selectFrom('manuals as t')
      .leftJoin('departments as d', 'd.id', 't.department_id')
      .selectAll('t')
      .select('d.name as department_name')
      .where('t.deleted_at', 'is', null)
    if (departmentId !== undefined)
      qb = qb.where((eb) => eb.exists(eb.selectFrom('manual_access as a').select('a.manual_id').whereRef('a.manual_id', '=', 't.id').where('a.department_id', '=', departmentId ?? -1)))
    return qb
  }

  /** Filters, search, sort and paging: list configuration 'manuals' (database). */
  list(departmentId: number | null | undefined, query: Record<string, string | undefined>) {
    return paginateResource(this.visible(departmentId), query, 'manuals', 't.id')
  }

  findById(id: number, departmentId?: number | null) {
    return this.visible(departmentId).where('t.id', '=', id).executeTakeFirst()
  }

  lockById(id: number) {
    return this.db.selectFrom('manuals').select('revision').where('id', '=', id).where('deleted_at', 'is', null).forUpdate().executeTakeFirst()
  }

  findRevisions(id: number) {
    return this.db
      .selectFrom('manual_revisions as r')
      .leftJoin('users as u', 'u.id', 'r.created_by')
      .selectAll('r')
      .select('u.name as created_by_name')
      .where('r.manual_id', '=', id)
      .orderBy('r.revision', 'desc')
      .execute()
  }

  findAccess(id: number) {
    return this.db.selectFrom('manual_access as a').innerJoin('departments as d', 'd.id', 'a.department_id').select(['d.id', 'd.name']).where('a.manual_id', '=', id).orderBy('d.name').execute()
  }

  async insert(data: Record<string, unknown>) {
    const { id } = await this.db.insertInto('manuals').values(data).returning('id').executeTakeFirstOrThrow()
    return id as number
  }

  update(id: number, data: Record<string, unknown>) {
    return this.db.updateTable('manuals').set({ ...data, updated_at: sql`now()` }).where('id', '=', id).where('deleted_at', 'is', null).returning('id').executeTakeFirst()
  }

  insertRevision(row: Record<string, unknown>) {
    return this.db.insertInto('manual_revisions').values(row).execute()
  }

  async replaceAccess(id: number, departmentIds: number[]) {
    await this.db.deleteFrom('manual_access').where('manual_id', '=', id).execute()
    if (departmentIds.length) await this.db.insertInto('manual_access').values(departmentIds.map((department_id) => ({ manual_id: id, department_id }))).execute()
  }

  softDelete(id: number) {
    return this.db
      .updateTable('manuals')
      .set({ deleted_at: sql`now()`, doc_number: sql`doc_number || '#deleted-' || id` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst()
  }
}
