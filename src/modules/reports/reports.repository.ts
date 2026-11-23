import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'
import { paginateResource } from '../../core/list.ts'

export class ReportRepository extends BaseRepository {
  private base() {
    return this.db
      .selectFrom('reports as t')
      .leftJoin('departments as d', 'd.id', 't.auditee_department_id')
      .leftJoin('users as u', 'u.id', 't.created_by')
      .selectAll('t')
      .select(['d.name as auditee_name', 'u.name as created_by_name'])
      .where('t.deleted_at', 'is', null)
  }

  /** Filters, search, sort and paging: list configuration 'reports' (database). */
  list(plants: string[] | null, query: Record<string, string | undefined>) {
    let qb = this.base()
    if (plants) qb = qb.where('t.plant', 'in', plants)
    return paginateResource(qb, query, 'reports', 't.id')
  }

  findById(id: number): Promise<Record<string, any> | undefined> {
    return this.base().where('t.id', '=', id).executeTakeFirst()
  }

  insert(data: Record<string, unknown>) {
    return this.db.insertInto('reports').values(data).returning('id').executeTakeFirstOrThrow()
  }

  update(id: number, data: Record<string, unknown>) {
    return this.db.updateTable('reports').set({ ...data, updated_at: sql`now()` }).where('id', '=', id).execute()
  }

  softDelete(id: number) {
    return this.db.updateTable('reports').set({ deleted_at: sql`now()` }).where('id', '=', id).where('deleted_at', 'is', null).returning('id').executeTakeFirst()
  }
}
