import { CrudService } from '../../core/crud.ts'
import type { LineInput } from './lines.dto.ts'
import type { LineRepository } from './lines.repository.ts'

export class LineService extends CrudService<LineInput> {
  constructor(repo: LineRepository) {
    super(repo, 'Line')
  }
}
