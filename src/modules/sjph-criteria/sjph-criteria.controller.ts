import { CrudController } from '../../core/crud.ts'
import { SjphCriterionDto, type SjphCriterionInput } from './sjph-criteria.dto.ts'
import type { SjphCriterionService } from './sjph-criteria.service.ts'

export class SjphCriterionController extends CrudController<SjphCriterionInput> {
  constructor(service: SjphCriterionService) {
    super(service, SjphCriterionDto)
  }
}
