import { z } from 'zod'
import { optInt, reqStr } from '../../core/dto.ts'

export const SupplierDto = z.object({
  code: reqStr(30),
  name: reqStr(150),
  country_id: optInt(),
})
export type SupplierInput = z.infer<typeof SupplierDto>
