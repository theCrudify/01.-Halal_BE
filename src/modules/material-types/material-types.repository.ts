import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class MaterialTypeRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'material_types', mode: 'master', uniqueColumn: 'code', resource: 'material_types' }
}
