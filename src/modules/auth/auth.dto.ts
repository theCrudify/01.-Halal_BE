import { z } from 'zod'
import { reqStr } from '../../core/dto.ts'

export const LoginDto = z.object({ employee_code: reqStr(30), password: reqStr(200) })
export type LoginInput = z.infer<typeof LoginDto>

export const ChangePasswordDto = z.object({
  current_password: reqStr(200),
  new_password: z.string().min(8, 'Minimal 8 karakter').max(200),
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordDto>
