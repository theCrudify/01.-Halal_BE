import { CrudController } from '../../core/crud.ts'
import { HalalBodyDto, type HalalBodyInput } from './halal-bodies.dto.ts'
import type { HalalBodyService } from './halal-bodies.service.ts'

export class HalalBodyController extends CrudController<HalalBodyInput> {
  constructor(service: HalalBodyService) {
    super(service, HalalBodyDto)
  }
}
