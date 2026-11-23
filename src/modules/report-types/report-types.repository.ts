import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class ReportTypeRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'report_types', mode: 'master', uniqueColumn: 'code', resource: 'report_types' }
}
