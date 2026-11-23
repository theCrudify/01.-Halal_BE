import { CrudController } from '../../core/crud.ts'
import { ExpiryWindowDto, type ExpiryWindowInput } from './expiry-windows.dto.ts'
import type { ExpiryWindowService } from './expiry-windows.service.ts'

export class ExpiryWindowController extends CrudController<ExpiryWindowInput> {
  constructor(service: ExpiryWindowService) {
    super(service, ExpiryWindowDto)
  }
}
