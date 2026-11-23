import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class CategoryRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'categories', mode: 'master', uniqueColumn: 'code', resource: 'categories' }
}
