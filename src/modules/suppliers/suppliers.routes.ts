import { db } from '../../core/database.ts'
import { crudRoutes } from '../../core/crud.ts'
import { SupplierController } from './suppliers.controller.ts'
import { SupplierRepository } from './suppliers.repository.ts'
import { SupplierService } from './suppliers.service.ts'

export const suppliersRoutes = crudRoutes(new SupplierController(new SupplierService(new SupplierRepository(db))))
