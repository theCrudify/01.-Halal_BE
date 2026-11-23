import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class ExpiryWindowRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'expiry_windows', mode: 'master', uniqueColumn: 'code', resource: 'expiry_windows' }
}
