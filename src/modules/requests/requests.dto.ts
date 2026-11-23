import { z } from 'zod'
import { oneOf, optInt, str, upload } from '../../core/dto.ts'

// The material fields of a request are validated with MaterialDto (materials.dto.ts).

export const RequestFilesDto = z.object({
  packaging_file: upload(),
  attachment_file: upload(),
  certificate_file: upload(),
  note: str(1000),
})
export type RequestFilesInput = z.infer<typeof RequestFilesDto>

export const CreateRequestDto = RequestFilesDto.extend({
  request_type: oneOf(['New', 'Change']),
  material_id: optInt(),
})
export type CreateRequestInput = z.infer<typeof CreateRequestDto>

/** `revision` (from the detail response) makes approve/reject idempotent: a retry or double submit hits 409 instead of acting on the next step. */
const revision = z.coerce.number({ error: 'Muat ulang halaman lalu coba lagi' }).int().min(0)

export const ApproveDto = z.object({ note: str(1000), im_file: upload(), revision })
export type ApproveInput = z.infer<typeof ApproveDto>

export const RejectDto = z.object({ note: z.string().trim().min(5, 'Alasan penolakan minimal 5 karakter').max(1000), revision })
export type RejectInput = z.infer<typeof RejectDto>

/** Only the scope is code (it is authorization); every other filter is list configuration. */
export const RequestFilterDto = z.object({ scope: z.enum(['mine', 'tasks', 'all']).catch('mine') })
export type RequestFilter = z.infer<typeof RequestFilterDto>

export const FILE_FIELDS = ['packaging_file', 'attachment_file', 'certificate_file'] as const
