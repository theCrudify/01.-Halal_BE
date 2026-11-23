import { z } from 'zod'
import { bool, oneOf, optInt, optMaster, reqStr } from '../../core/dto.ts'

/** Master: Status workflow. */
export const WorkflowStateDto = z
  .object({
    code: z.string({ error: 'Wajib diisi' }).trim().min(1, 'Wajib diisi').max(30).regex(/^[A-Za-z0-9_-]+$/, 'Hanya huruf, angka, - dan _'),
    name: reqStr(150),
    sort_order: z.coerce.number().int().min(0).max(9999).catch(0),
    is_active: bool(),
    kind: oneOf(['step', 'release', 'rejected']),
    step_no: optInt(),
    role_code: optMaster('roles'),
    tone: oneOf(['neutral', 'blue', 'amber', 'orange', 'violet', 'green', 'red', 'teal', 'rose']),
  })
  .superRefine((v, ctx) => {
    // Steps need an order and an owner role; terminal states (release / rejected) must not have them.
    if (v.kind === 'step' && !v.step_no) ctx.addIssue({ code: 'custom', path: ['step_no'], message: 'Urutan tahap wajib diisi' })
    if (v.kind === 'step' && !v.role_code) ctx.addIssue({ code: 'custom', path: ['role_code'], message: 'Role penanggung jawab wajib dipilih' })
  })
  // Terminal states (release / rejected) never carry a step order or owner role.
  .transform((v) => (v.kind === 'step' ? v : { ...v, step_no: null, role_code: null }))
export type WorkflowStateInput = z.infer<typeof WorkflowStateDto>
