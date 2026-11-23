import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class LineRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'lines', mode: 'soft', uniqueColumn: 'code', resource: 'lines' }
}
