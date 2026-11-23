import { CrudController } from '../../core/crud.ts'
import { SupplierDto, type SupplierInput } from './suppliers.dto.ts'
import type { SupplierService } from './suppliers.service.ts'

export class SupplierController extends CrudController<SupplierInput> {
  constructor(service: SupplierService) {
    super(service, SupplierDto)
  }
}
