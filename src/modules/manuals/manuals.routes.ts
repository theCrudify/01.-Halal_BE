import { Hono } from 'hono'
import { requirePermission, type Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { fileService } from '../files/files.routes.ts'
import { ManualController } from './manuals.controller.ts'
import { ManualRepository } from './manuals.repository.ts'
import { ManualService } from './manuals.service.ts'

const controller = new ManualController(new ManualService(new ManualRepository(db), fileService))
const editors = requirePermission('manual.manage')

export const manualsRoutes = new Hono<Env>()
  .get('/', controller.list)
  .get('/:id', controller.detail)
  .post('/', editors, controller.create)
  .put('/:id', editors, controller.update)
  .post('/:id/revisions', editors, controller.addRevision)
  .delete('/:id', requirePermission('admin'), controller.remove)
