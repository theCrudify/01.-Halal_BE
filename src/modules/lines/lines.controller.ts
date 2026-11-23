import { CrudController } from '../../core/crud.ts'
import { LineDto, type LineInput } from './lines.dto.ts'
import type { LineService } from './lines.service.ts'

export class LineController extends CrudController<LineInput> {
  constructor(service: LineService) {
    super(service, LineDto)
  }
}
