import { CrudService } from '../../core/crud.ts'
import type { HalalBodyInput } from './halal-bodies.dto.ts'
import type { HalalBodyRepository } from './halal-bodies.repository.ts'

export class HalalBodyService extends CrudService<HalalBodyInput> {
  constructor(repo: HalalBodyRepository) {
    super(repo, 'Lembaga penerbit')
  }
}
