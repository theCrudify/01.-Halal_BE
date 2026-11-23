import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'
import { paginateResource } from '../../core/list.ts'

export class CertificateRepository extends BaseRepository {
  private base() {
    return this.db
      .selectFrom('certificates as t')
      .selectAll('t')
      .select((eb) =>
        eb
          .selectFrom('certificate_products as cp')
          .innerJoin('products as p', 'p.id', 'cp.product_id')
          .select(sql<string>`string_agg(p.name, ', ' order by p.name)`.as('x'))
          .whereRef('cp.certificate_id', '=', 't.id')
          .as('product_names'),
      )
      .where('t.deleted_at', 'is', null)
  }

  /** Filters, search, sort and paging: list configuration 'certificates' (database). */
  list(query: Record<string, string | undefined>) {
    return paginateResource(this.base(), query, 'certificates', 't.id')
  }

  async findById(id: number): Promise<Record<string, any> | undefined> {
    const row = await this.base().where('t.id', '=', id).executeTakeFirst()
    if (!row) return undefined
    const products = await this.db
      .selectFrom('certificate_products as cp')
      .innerJoin('products as p', 'p.id', 'cp.product_id')
      .select(['p.id', 'p.code', 'p.name'])
      .where('cp.certificate_id', '=', id)
      .orderBy('p.name')
      .execute()
    return { ...row, products, product_ids: products.map((p) => p.id) }
  }

  lockById(id: number) {
    return this.db.selectFrom('certificates').select(['version', 'file_id']).where('id', '=', id).where('deleted_at', 'is', null).forUpdate().executeTakeFirst()
  }

  findVersions(id: number) {
    return this.db
      .selectFrom('certificate_versions as v')
      .leftJoin('users as u', 'u.id', 'v.created_by')
      .selectAll('v')
      .select('u.name as created_by_name')
      .where('v.certificate_id', '=', id)
      .orderBy('v.version', 'desc')
      .execute()
  }

  async insert(data: Record<string, unknown>) {
    const { id } = await this.db.insertInto('certificates').values(data).returning('id').executeTakeFirstOrThrow()
    return id as number
  }

  update(id: number, data: Record<string, unknown>) {
    return this.db.updateTable('certificates').set({ ...data, updated_at: sql`now()` }).where('id', '=', id).execute()
  }

  /** Replaces the product scope; touching the row makes the trigger rebuild search_text with the product names. */
  async replaceProducts(id: number, productIds: number[]) {
    await this.db.deleteFrom('certificate_products').where('certificate_id', '=', id).execute()
    if (productIds.length) await this.db.insertInto('certificate_products').values(productIds.map((product_id) => ({ certificate_id: id, product_id }))).execute()
    await this.db.updateTable('certificates').set({ search_text: null }).where('id', '=', id).execute()
  }

  insertVersion(row: Record<string, unknown>) {
    return this.db.insertInto('certificate_versions').values(row).execute()
  }

  softDelete(id: number) {
    return this.db
      .updateTable('certificates')
      .set({ deleted_at: sql`now()`, certificate_number: sql`certificate_number || '#deleted-' || id` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst()
  }
}
