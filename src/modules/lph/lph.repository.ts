import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class LphRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'lph', mode: 'master', uniqueColumn: 'code', resource: 'lph' }
}
