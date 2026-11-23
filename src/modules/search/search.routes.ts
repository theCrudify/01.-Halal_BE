import { Hono } from 'hono'
import type { Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { CertificateRepository } from '../certificates/certificates.repository.ts'
import { ManualRepository } from '../manuals/manuals.repository.ts'
import { MaterialRepository } from '../materials/materials.repository.ts'
import { RequestRepository } from '../requests/requests.repository.ts'
import { SearchController } from './search.controller.ts'
import { SearchService } from './search.service.ts'

// Read-only module: it composes other modules' repositories, so it has none of its own.
const controller = new SearchController(new SearchService(new MaterialRepository(db), new RequestRepository(db), new CertificateRepository(db), new ManualRepository(db)))

export const searchRoutes = new Hono<Env>().get('/', controller.search)
