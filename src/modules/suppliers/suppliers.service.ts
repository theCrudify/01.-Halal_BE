import { CrudService } from '../../core/crud.ts'
import type { SupplierInput } from './suppliers.dto.ts'
import type { SupplierRepository } from './suppliers.repository.ts'

export class SupplierService extends CrudService<SupplierInput> {
  constructor(repo: SupplierRepository) {
    super(repo, 'Supplier')
  }
}
