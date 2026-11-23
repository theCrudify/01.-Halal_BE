import { z } from 'zod'
import { master, reqStr } from '../../core/dto.ts'

export const ProductDto = z.object({
  code: reqStr(30),
  name: reqStr(150),
  category: master('categories'),
  plant: master('plants'),
})
export type ProductInput = z.infer<typeof ProductDto>
