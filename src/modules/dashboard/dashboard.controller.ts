import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import type { DashboardService } from './dashboard.service.ts'

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  summary = async (c: Context<Env>) => c.json(await this.service.summary(c.get('user')))
}
