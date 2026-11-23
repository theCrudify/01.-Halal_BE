import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import { bodyDto, idParam } from '../../core/http.ts'
import { ReportDto } from './reports.dto.ts'
import type { ReportService } from './reports.service.ts'

export class ReportController {
  constructor(private readonly service: ReportService) {}

  list = async (c: Context<Env>) => c.json(await this.service.list(c.get('user'), c.req.query()))
  detail = async (c: Context<Env>) => c.json(await this.service.detail(c.get('user'), idParam(c)))
  create = async (c: Context<Env>) => c.json(await this.service.create(c.get('user'), await bodyDto(c, ReportDto)), 201)
  update = async (c: Context<Env>) => c.json(await this.service.update(c.get('user'), idParam(c), await bodyDto(c, ReportDto)))
  remove = async (c: Context<Env>) => c.json(await this.service.remove(idParam(c)))
}
