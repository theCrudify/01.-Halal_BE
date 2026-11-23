import { Hono } from 'hono'
import { requirePermission, type Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { MaterialController } from './materials.controller.ts'
import { MaterialRepository } from './materials.repository.ts'
import { MaterialService } from './materials.service.ts'

const controller = new MaterialController(new MaterialService(new MaterialRepository(db)))


export const materialsRoutes = new Hono<Env>()
  .get('/', controller.list)
  .get('/export', controller.export)
  .get('/:id', controller.detail)
  .patch('/:id', requirePermission('material.manage'), controller.patch)
  .delete('/:id', requirePermission('admin'), controller.remove)
