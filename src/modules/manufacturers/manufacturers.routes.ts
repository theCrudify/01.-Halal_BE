import { db } from '../../core/database.ts'
import { crudRoutes } from '../../core/crud.ts'
import { ManufacturerController } from './manufacturers.controller.ts'
import { ManufacturerRepository } from './manufacturers.repository.ts'
import { ManufacturerService } from './manufacturers.service.ts'

export const manufacturersRoutes = crudRoutes(new ManufacturerController(new ManufacturerService(new ManufacturerRepository(db))))
