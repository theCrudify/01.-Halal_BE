import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import { bodyDto, idParam } from '../../core/http.ts'
import { MaterialPatchDto } from './materials.dto.ts'
import type { MaterialService } from './materials.service.ts'

export class MaterialController {
  constructor(private readonly service: MaterialService) {}

  list = async (c: Context<Env>) => c.json(await this.service.list(c.get('user'), c.req.query()))

  export = async (c: Context<Env>) => {
    const csv = await this.service.exportCsv(c.get('user'), c.req.query())
    return c.body(csv, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="master-list-halal-${new Date().toISOString().slice(0, 10)}.csv"`,
    })
  }

  detail = async (c: Context<Env>) => c.json(await this.service.detail(c.get('user'), idParam(c)))
  patch = async (c: Context<Env>) => c.json(await this.service.patch(c.get('user'), idParam(c), await bodyDto(c, MaterialPatchDto)))
  remove = async (c: Context<Env>) => c.json(await this.service.remove(idParam(c)))
}
