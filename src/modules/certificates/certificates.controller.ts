import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import { bodyDto, idParam } from '../../core/http.ts'
import { CertificateDto } from './certificates.dto.ts'
import type { CertificateService } from './certificates.service.ts'

export class CertificateController {
  constructor(private readonly service: CertificateService) {}

  list = async (c: Context<Env>) => c.json(await this.service.list(c.req.query()))
  detail = async (c: Context<Env>) => c.json(await this.service.detail(idParam(c)))
  create = async (c: Context<Env>) => c.json(await this.service.create(c.get('user'), await bodyDto(c, CertificateDto)), 201)
  update = async (c: Context<Env>) => c.json(await this.service.update(c.get('user'), idParam(c), await bodyDto(c, CertificateDto)))
  remove = async (c: Context<Env>) => c.json(await this.service.remove(idParam(c)))
}
