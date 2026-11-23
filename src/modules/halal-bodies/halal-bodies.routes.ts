import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { HalalBodyController } from './halal-bodies.controller.ts'
import { HalalBodyRepository } from './halal-bodies.repository.ts'
import { HalalBodyService } from './halal-bodies.service.ts'

export const halalBodiesRoutes = crudRoutes(new HalalBodyController(new HalalBodyService(new HalalBodyRepository(db))))
