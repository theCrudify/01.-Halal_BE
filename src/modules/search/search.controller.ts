import type { Context } from 'hono'
import type { Env } from '../../core/auth.ts'
import { SearchDto } from './search.dto.ts'
import type { SearchService } from './search.service.ts'

export class SearchController {
  constructor(private readonly service: SearchService) {}

  search = async (c: Context<Env>) => c.json(await this.service.search(c.get('user'), SearchDto.parse(c.req.query())))
}
