import { CrudService } from '../../core/crud.ts'
import type { ExpiryWindowInput } from './expiry-windows.dto.ts'
import type { ExpiryWindowRepository } from './expiry-windows.repository.ts'

export class ExpiryWindowService extends CrudService<ExpiryWindowInput> {
  constructor(repo: ExpiryWindowRepository) {
    super(repo, 'Rentang masa berlaku')
  }
}
