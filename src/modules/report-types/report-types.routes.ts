import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { ReportTypeController } from './report-types.controller.ts'
import { ReportTypeRepository } from './report-types.repository.ts'
import { ReportTypeService } from './report-types.service.ts'

export const reportTypesRoutes = crudRoutes(new ReportTypeController(new ReportTypeService(new ReportTypeRepository(db))))
