import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class SupplierRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'suppliers', mode: 'soft', uniqueColumn: 'code', resource: 'suppliers' }

  protected override base() {
    return this.db
      .selectFrom('suppliers as t')
      .leftJoin('countries as co', 'co.id', 't.country_id')
      .selectAll('t')
      .select('co.name as country_name')
      .where('t.deleted_at', 'is', null)
  }
}
