import { CrudService } from '../../core/crud.ts'
import type { SjphCriterionInput } from './sjph-criteria.dto.ts'
import type { SjphCriterionRepository } from './sjph-criteria.repository.ts'

export class SjphCriterionService extends CrudService<SjphCriterionInput> {
  constructor(repo: SjphCriterionRepository) {
    super(repo, 'Kriteria SJPH')
  }
}
