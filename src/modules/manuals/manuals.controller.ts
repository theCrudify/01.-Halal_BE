import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import { bodyDto, idParam } from '../../core/http.ts'
import { CreateManualDto, ManualDto, RevisionDto } from './manuals.dto.ts'
import type { ManualService } from './manuals.service.ts'

export class ManualController {
  constructor(private readonly service: ManualService) {}

  list = async (c: Context<Env>) => c.json(await this.service.list(c.get('user'), c.req.query()))
  detail = async (c: Context<Env>) => c.json(await this.service.detail(c.get('user'), idParam(c)))
  create = async (c: Context<Env>) => c.json(await this.service.create(c.get('user'), await bodyDto(c, CreateManualDto)), 201)
  update = async (c: Context<Env>) => c.json(await this.service.update(idParam(c), await bodyDto(c, ManualDto)))
  addRevision = async (c: Context<Env>) => c.json(await this.service.addRevision(c.get('user'), idParam(c), await bodyDto(c, RevisionDto)), 201)
  remove = async (c: Context<Env>) => c.json(await this.service.remove(idParam(c)))
}
