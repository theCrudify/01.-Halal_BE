import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class ManufacturerRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'manufacturers', mode: 'soft', uniqueColumn: 'code', resource: 'manufacturers' }

  protected override base() {
    return this.db
      .selectFrom('manufacturers as t')
      .leftJoin('countries as co', 'co.id', 't.country_id')
      .selectAll('t')
      .select('co.name as country_name')
      .where('t.deleted_at', 'is', null)
  }
}
