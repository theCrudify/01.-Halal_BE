import { z } from 'zod'
import { master, reqStr } from '../../core/dto.ts'

export const LineDto = z.object({
  code: reqStr(30),
  name: reqStr(100),
  plant: master('plants'),
})
export type LineInput = z.infer<typeof LineDto>
