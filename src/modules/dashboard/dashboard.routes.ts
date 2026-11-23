import { Hono } from 'hono'
import type { Env } from '../../core/auth.ts'
import { db } from '../../core/database.ts'
import { DashboardController } from './dashboard.controller.ts'
import { DashboardRepository } from './dashboard.repository.ts'
import { DashboardService } from './dashboard.service.ts'

const controller = new DashboardController(new DashboardService(new DashboardRepository(db)))

export const dashboardRoutes = new Hono<Env>().get('/', controller.summary)
