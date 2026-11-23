import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { MaterialTypeController } from './material-types.controller.ts'
import { MaterialTypeRepository } from './material-types.repository.ts'
import { MaterialTypeService } from './material-types.service.ts'

export const materialTypesRoutes = crudRoutes(new MaterialTypeController(new MaterialTypeService(new MaterialTypeRepository(db))))
