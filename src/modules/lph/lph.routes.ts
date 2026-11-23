import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { LphController } from './lph.controller.ts'
import { LphRepository } from './lph.repository.ts'
import { LphService } from './lph.service.ts'

export const lphRoutes = crudRoutes(new LphController(new LphService(new LphRepository(db))))
