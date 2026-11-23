import { db } from '../../core/database.ts'
import { crudRoutes } from '../../core/crud.ts'
import { LineController } from './lines.controller.ts'
import { LineRepository } from './lines.repository.ts'
import { LineService } from './lines.service.ts'

export const linesRoutes = crudRoutes(new LineController(new LineService(new LineRepository(db))))
