import { Hono } from 'hono'
import { requirePermission, type Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { fileService } from '../files/files.routes.ts'
import { ReportController } from './reports.controller.ts'
import { ReportRepository } from './reports.repository.ts'
import { ReportService } from './reports.service.ts'

const controller = new ReportController(new ReportService(new ReportRepository(db), fileService))
const editors = requirePermission('report.manage')

export const reportsRoutes = new Hono<Env>()
  .get('/', controller.list)
  .get('/:id', controller.detail)
  .post('/', editors, controller.create)
  .put('/:id', editors, controller.update)
  .delete('/:id', requirePermission('admin'), controller.remove)
