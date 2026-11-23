import { CrudService } from '../../core/crud.ts'
import type { MaterialTypeInput } from './material-types.dto.ts'
import type { MaterialTypeRepository } from './material-types.repository.ts'

export class MaterialTypeService extends CrudService<MaterialTypeInput> {
  constructor(repo: MaterialTypeRepository) {
    super(repo, 'Jenis bahan')
  }
}
