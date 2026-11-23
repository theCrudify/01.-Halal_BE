import { CrudController } from '../../core/crud.ts'
import { MaterialTypeDto, type MaterialTypeInput } from './material-types.dto.ts'
import type { MaterialTypeService } from './material-types.service.ts'

export class MaterialTypeController extends CrudController<MaterialTypeInput> {
  constructor(service: MaterialTypeService) {
    super(service, MaterialTypeDto)
  }
}
