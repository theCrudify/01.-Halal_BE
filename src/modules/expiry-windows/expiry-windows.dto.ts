import { z } from 'zod'
import { bool, optInt, reqStr } from '../../core/dto.ts'

/** Configuration: Rentang masa berlaku. */
export const ExpiryWindowDto = z.object({
    code: z.string({ error: 'Wajib diisi' }).trim().min(1, 'Wajib diisi').max(60).regex(/^[A-Za-z0-9_-]+$/, 'Hanya huruf, angka, - dan _'),
    name: reqStr(150),
    sort_order: z.coerce.number().int().min(0).max(9999).catch(0),
    is_active: bool(),
    days_from: optInt(),
    days_to: optInt(),
    has_date: bool(),
    include_non_expiring: bool(),
  })
  .refine((v) => v.days_from == null || v.days_to == null || v.days_from <= v.days_to, { path: ['days_to'], message: '“Sampai” harus ≥ “Dari”' })
export type ExpiryWindowInput = z.infer<typeof ExpiryWindowDto>
