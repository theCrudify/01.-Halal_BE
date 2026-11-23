import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import { idParam, readBody } from '../../core/http.ts'
import { MaterialDto } from '../materials/materials.dto.ts'
import { ApproveDto, CreateRequestDto, RejectDto, RequestFilesDto, RequestFilterDto } from './requests.dto.ts'
import type { RequestService } from './requests.service.ts'

export class RequestController {
  constructor(private readonly service: RequestService) {}

  list = async (c: Context<Env>) => {
    const q = c.req.query()
    return c.json(await this.service.list(c.get('user'), RequestFilterDto.parse(q), q))
  }

  detail = async (c: Context<Env>) => c.json(await this.service.detail(c.get('user'), idParam(c)))

  create = async (c: Context<Env>) => {
    const body = await readBody(c)
    return c.json(await this.service.create(c.get('user'), CreateRequestDto.parse(body), MaterialDto.parse(body)), 201)
  }

  approve = async (c: Context<Env>) => c.json(await this.service.approve(c.get('user'), idParam(c), ApproveDto.parse(await readBody(c))))
  reject = async (c: Context<Env>) => c.json(await this.service.reject(c.get('user'), idParam(c), RejectDto.parse(await readBody(c))))

  resubmit = async (c: Context<Env>) => {
    const body = await readBody(c)
    return c.json(await this.service.resubmit(c.get('user'), idParam(c), RequestFilesDto.parse(body), MaterialDto.parse(body)))
  }
}
