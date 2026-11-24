import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'

// Which of id / name / deleted_at a table has. The schema only changes with a deploy, so it is looked up once.
const tableColumns = new Map<string, string[]>()

export class MetaRepository extends BaseRepository {
  /** Site × category combinations that actually have materials (sidebar shortcuts). */
  shortcuts(plants: string[] | null) {
    let qb = this.db
      .selectFrom('materials as m')
      .innerJoin('plants as p', 'p.code', 'm.plant')
      .select(['p.site_code as site', 'm.category'])
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('m.deleted_at', 'is', null)
      .where('m.category', 'is not', null)
      .groupBy(['p.site_code', 'm.category'])
    if (plants) qb = qb.where('m.plant', 'in', plants)
    return qb.execute()
  }

  /**
   * id/name options of a table used as a 'relation' filter source. The table name comes from configuration, so it is
   * checked against the real schema first (must exist and have id + name).
   */
  async relationOptions(table: string) {
    let cols = tableColumns.get(table)
    if (!cols) {
      const { rows } = await sql<{ name: string }>`
        select column_name as name from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name in ('id', 'name', 'deleted_at')`.execute(this.db)
      tableColumns.set(table, (cols = rows.map((r) => r.name)))
    }
    if (!cols.includes('id') || !cols.includes('name')) return []
    let qb = this.db.selectFrom(table).select(['id', 'name']).orderBy('name')
    if (cols.includes('deleted_at')) qb = qb.where('deleted_at', 'is', null)
    const out = await qb.execute()
    return out.map((r) => ({ value: String(r.id), label: r.name as string }))
  }
}
