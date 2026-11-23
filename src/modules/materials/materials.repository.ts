import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'
import { applyFilters, paginateResource } from '../../core/list.ts'
import { masters } from '../../core/masters.ts'

const RELATED = ['supplier_id', 'manufacturer_id', 'product_id', 'line_id'] as const

export class MaterialRepository extends BaseRepository {
  /** Materials with the names of every related row. Aliases are what list_fields.column_ref refers to. */
  private base(plants: string[] | null) {
    let qb = this.db
      .selectFrom('materials as m')
      .leftJoin('suppliers as s', 's.id', 'm.supplier_id')
      .leftJoin('manufacturers as mf', 'mf.id', 'm.manufacturer_id')
      .leftJoin('countries as co', 'co.id', 'mf.country_id')
      .leftJoin('products as pr', 'pr.id', 'm.product_id')
      .leftJoin('lines as ln', 'ln.id', 'm.line_id')
      .selectAll('m')
      .select(['s.code as supplier_code', 's.name as supplier_name', 'mf.name as manufacturer_name', 'co.name as country_name', 'pr.name as product_name', 'ln.name as line_name'])
      .where('m.deleted_at', 'is', null)
    if (plants) qb = qb.where('m.plant', 'in', plants)
    return qb
  }

  list(plants: string[] | null, query: Record<string, string | undefined>) {
    return paginateResource(this.base(plants), query, 'materials', 'm.id')
  }

  /** CSV export: the columns are the list_fields of the 'materials' list (label = header, column_ref = value). */
  async exportRows(plants: string[] | null, query: Record<string, string | undefined>, limit = 10000) {
    const fields = masters.listFields('materials').filter((f) => f.sortable) // display columns, not filter-only id columns
    const cfgSort = masters.listFields('materials').find((f) => f.key === query.sortBy && f.sortable)?.column_ref ?? 'm.material_code'
    const rows = await applyFilters(this.base(plants), 'materials', query)
      .clearSelect()
      .select(fields.map((f) => sql.ref(f.column_ref).as(f.key)))
      .orderBy(sql`${sql.ref(cfgSort)} ${sql.raw(query.sortDir === 'desc' ? 'desc' : 'asc')} nulls last`)
      .orderBy('m.id')
      .limit(limit)
      .execute()
    return { fields, rows }
  }

  async findById(id: number): Promise<Record<string, any> | undefined> {
    const m = await this.base(null).where('m.id', '=', id).executeTakeFirst()
    if (!m) return undefined
    const distributed_to = await this.db
      .selectFrom('material_distributions as md')
      .innerJoin('departments as d', 'd.id', 'md.department_id')
      .select(['d.id', 'd.name'])
      .where('md.material_id', '=', id)
      .orderBy('d.name')
      .execute()
    return { ...m, distributed_to }
  }

  lockById(id: number) {
    return this.db.selectFrom('materials').select('id').where('id', '=', id).forUpdate().executeTakeFirst()
  }

  findRequests(materialId: number) {
    return this.db
      .selectFrom('material_requests as r')
      .innerJoin('users as u', 'u.id', 'r.requested_by')
      .select(['r.id', 'r.version', 'r.request_type', 'r.status', 'r.current_step', 'r.created_at', 'r.updated_at', 'u.name as requested_by_name'])
      .where('r.material_id', '=', materialId)
      .orderBy('r.version', 'desc')
      .execute()
  }

  findHistories(materialId: number) {
    return this.db
      .selectFrom('approval_histories as h')
      .innerJoin('users as u', 'u.id', 'h.user_id')
      .leftJoin('roles as ro', 'ro.code', 'h.role')
      .selectAll('h')
      .select(['u.name as user_name', 'ro.name as role_name'])
      .where('h.material_id', '=', materialId)
      .orderBy('h.created_at', 'desc')
      .orderBy('h.id', 'desc')
      .execute()
  }

  /** Writes material columns and, when given, the distribution list (department ids). */
  async insert({ distributed_to, ...data }: Record<string, any>) {
    const { id } = await this.db.insertInto('materials').values(data).returning('id').executeTakeFirstOrThrow()
    if (distributed_to) await this.replaceDistributions(id, distributed_to)
    return id as number
  }

  async update(id: number, { distributed_to, ...data }: Record<string, any>) {
    await this.db.updateTable('materials').set({ ...data, updated_at: sql`now()` }).where('id', '=', id).execute()
    if (distributed_to) await this.replaceDistributions(id, distributed_to)
  }

  private async replaceDistributions(id: number, departmentIds: number[]) {
    await this.db.deleteFrom('material_distributions').where('material_id', '=', id).execute()
    if (departmentIds.length) await this.db.insertInto('material_distributions').values(departmentIds.map((department_id) => ({ material_id: id, department_id }))).execute()
  }

  softDelete(id: number) {
    return this.db.updateTable('materials').set({ deleted_at: sql`now()` }).where('id', '=', id).where('deleted_at', 'is', null).returning('id').executeTakeFirst()
  }

  findOpenRequest(materialId: number) {
    return this.db.selectFrom('material_requests').select('id').where('material_id', '=', materialId).where('status', 'in', masters.openStatuses()).executeTakeFirst()
  }

  /** Names for the ids inside a request payload, so proposed data can be shown without the client resolving ids. */
  async labels(data: Record<string, any>) {
    const one = (table: string, id?: number | null) =>
      id ? this.db.selectFrom(table).select(['name']).where('id', '=', id).executeTakeFirst().then((r) => r?.name ?? null) : Promise.resolve(null)
    const [supplier, manufacturer, product, line, departments] = await Promise.all([
      one('suppliers', data.supplier_id),
      one('manufacturers', data.manufacturer_id),
      one('products', data.product_id),
      one('lines', data.line_id),
      data.distributed_to?.length ? this.db.selectFrom('departments').select('name').where('id', 'in', data.distributed_to).orderBy('name').execute() : [],
    ])
    return { supplier_id: supplier, manufacturer_id: manufacturer, product_id: product, line_id: line, distributed_to: departments.map((d) => d.name).join(', ') || null }
  }

  static readonly RELATED = RELATED
}
