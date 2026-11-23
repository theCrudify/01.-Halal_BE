import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'

export class FileRepository extends BaseRepository {
  async insert(row: { name: string; mime: string; size: number; data: Buffer; created_by: number }) {
    const { id } = await this.db.insertInto('files').values(row).returning('id').executeTakeFirstOrThrow()
    return id as number
  }

  findById(id: number) {
    return this.db.selectFrom('files').select(['name', 'mime', 'data']).where('id', '=', id).executeTakeFirst()
  }

  findMeta(ids: number[]) {
    return ids.length ? this.db.selectFrom('files').select(['id', 'name', 'size']).where('id', 'in', ids).execute() : Promise.resolve([])
  }

  /**
   * True when the user uploaded the file or can see a record that references it:
   * certificates (everyone), materials and reports (plant scope), requests (plant scope + own or request.view_all),
   * Manual SJPH (manual.view_all or shared with the user's department).
   */
  async isAccessible(fileId: number, u: { userId: number; plants: string[] | null; viewAllRequests: boolean; viewAllManuals: boolean; departmentId: number | null }) {
    const id = String(fileId)
    const inPlants = (col: string) => (u.plants ? sql`${sql.ref(col)} in (${sql.join([...u.plants, '-'])})` : sql`true`)
    const { rows } = await sql<{ ok: boolean }>`
      select
        exists (select 1 from files where id = ${fileId} and created_by = ${u.userId})
        or exists (select 1 from certificates where file_id = ${fileId} and deleted_at is null)
        or exists (select 1 from certificate_versions where data->>'file_id' = ${id})
        or exists (select 1 from materials m where ${fileId} in (m.packaging_file_id, m.attachment_file_id, m.certificate_file_id, m.im_file_id) and ${inPlants('m.plant')})
        or exists (select 1 from reports r where ${fileId} in (r.file_id, r.feedback_file_id) and r.deleted_at is null and ${inPlants('r.plant')})
        or exists (
          select 1 from material_requests q
          where ${id} in (q.data->>'packaging_file_id', q.data->>'attachment_file_id', q.data->>'certificate_file_id', q.data->>'im_file_id')
            and ${inPlants('q.plant')} and (${u.viewAllRequests} or q.requested_by = ${u.userId}))
        or exists (
          select 1 from manual_revisions mr
          where mr.file_id = ${fileId}
            and (${u.viewAllManuals} or exists (select 1 from manual_access a where a.manual_id = mr.manual_id and a.department_id = ${u.departmentId ?? -1})))
        as ok`.execute(this.db)
    return rows[0]?.ok === true
  }
}
