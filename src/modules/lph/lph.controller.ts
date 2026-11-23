import { CrudController } from '../../core/crud.ts'
import { LphDto, type LphInput } from './lph.dto.ts'
import type { LphService } from './lph.service.ts'

export class LphController extends CrudController<LphInput> {
  constructor(service: LphService) {
    super(service, LphDto)
  }
}
