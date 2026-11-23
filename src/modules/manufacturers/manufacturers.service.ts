import { CrudService } from '../../core/crud.ts'
import type { ManufacturerInput } from './manufacturers.dto.ts'
import type { ManufacturerRepository } from './manufacturers.repository.ts'

export class ManufacturerService extends CrudService<ManufacturerInput> {
  constructor(repo: ManufacturerRepository) {
    super(repo, 'Manufacturer')
  }
}
