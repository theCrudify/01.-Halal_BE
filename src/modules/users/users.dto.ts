import { z } from 'zod'
import { bool, master, optInt, optMaster, reqStr, str } from '../../core/dto.ts'

const fields = {
  employee_code: reqStr(30),
  name: reqStr(150),
  email: str(150).pipe(z.email('Email tidak valid').nullable()),
  role: master('roles'),
  department_id: optInt(),
  site: optMaster('sites'), // empty = all sites
  is_active: bool(),
}
const password = z.string().min(8, 'Minimal 8 karakter').max(200)

export const CreateUserDto = z.object({ ...fields, password })
export type CreateUserInput = z.infer<typeof CreateUserDto>

/** Password optional on update: empty keeps the current one. */
export const UpdateUserDto = z.object({ ...fields, password: z.preprocess((v) => v || undefined, password.optional()) })
export type UpdateUserInput = z.infer<typeof UpdateUserDto>
