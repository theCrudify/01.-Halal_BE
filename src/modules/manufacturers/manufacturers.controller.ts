import { CrudController } from '../../core/crud.ts'
import { ManufacturerDto, type ManufacturerInput } from './manufacturers.dto.ts'
import type { ManufacturerService } from './manufacturers.service.ts'

export class ManufacturerController extends CrudController<ManufacturerInput> {
  constructor(service: ManufacturerService) {
    super(service, ManufacturerDto)
  }
}
