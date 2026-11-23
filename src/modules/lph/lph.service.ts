import { CrudService } from '../../core/crud.ts'
import type { LphInput } from './lph.dto.ts'
import type { LphRepository } from './lph.repository.ts'

export class LphService extends CrudService<LphInput> {
  constructor(repo: LphRepository) {
    super(repo, 'LPH')
  }
}
