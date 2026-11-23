import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class HalalBodyRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'halal_bodies', mode: 'master', uniqueColumn: 'code', resource: 'halal_bodies' }
}
