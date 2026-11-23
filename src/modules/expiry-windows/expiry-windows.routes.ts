import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { ExpiryWindowController } from './expiry-windows.controller.ts'
import { ExpiryWindowRepository } from './expiry-windows.repository.ts'
import { ExpiryWindowService } from './expiry-windows.service.ts'

export const expiryWindowsRoutes = crudRoutes(new ExpiryWindowController(new ExpiryWindowService(new ExpiryWindowRepository(db))))
