import { Hono } from 'hono'
import type { Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { fileService } from '../files/files.routes.ts'
import { MaterialRepository } from '../materials/materials.repository.ts'
import { RequestController } from './requests.controller.ts'
import { RequestRepository } from './requests.repository.ts'
import { RequestService } from './requests.service.ts'

const controller = new RequestController(new RequestService(new RequestRepository(db), new MaterialRepository(db), fileService))

// Role checks per step live in RequestService.
export const requestsRoutes = new Hono<Env>()
  .get('/', controller.list)
  .post('/', controller.create)
  .get('/:id', controller.detail)
  .post('/:id/approve', controller.approve)
  .post('/:id/reject', controller.reject)
  .post('/:id/resubmit', controller.resubmit)
