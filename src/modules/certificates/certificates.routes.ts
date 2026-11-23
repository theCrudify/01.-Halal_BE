import { Hono } from 'hono'
import { requirePermission, type Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { fileService } from '../files/files.routes.ts'
import { CertificateController } from './certificates.controller.ts'
import { CertificateRepository } from './certificates.repository.ts'
import { CertificateService } from './certificates.service.ts'

const controller = new CertificateController(new CertificateService(new CertificateRepository(db), fileService))
const editors = requirePermission('certificate.manage')

export const certificatesRoutes = new Hono<Env>()
  .get('/', controller.list)
  .get('/:id', controller.detail)
  .post('/', editors, controller.create)
  .put('/:id', editors, controller.update)
  .delete('/:id', requirePermission('admin'), controller.remove)
