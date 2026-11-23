import { z } from 'zod'
import { optInt, reqStr } from '../../core/dto.ts'

export const ManufacturerDto = z.object({
  code: reqStr(30),
  name: reqStr(150),
  country_id: optInt(),
})
export type ManufacturerInput = z.infer<typeof ManufacturerDto>
