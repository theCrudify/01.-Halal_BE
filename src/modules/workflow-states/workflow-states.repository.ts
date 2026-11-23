import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class WorkflowStateRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'workflow_states', mode: 'master', uniqueColumn: 'code', resource: 'workflow_states' }

  protected override base() {
    return this.db
      .selectFrom('workflow_states as t')
      .leftJoin('roles as r', 'r.code', 't.role_code').selectAll('t').select('r.name as role_name')
  }
}
