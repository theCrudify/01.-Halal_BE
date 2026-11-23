import { CrudRepository, type CrudConfig } from '../../core/crud.ts'

export class SjphCriterionRepository extends CrudRepository {
  protected readonly config: CrudConfig = { table: 'sjph_criteria', mode: 'master', uniqueColumn: 'code', resource: 'sjph_criteria' }
}
