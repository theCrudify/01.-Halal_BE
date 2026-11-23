import { z } from 'zod'
import { intList, master, optInt, reqStr, str, upload } from '../../core/dto.ts'

// Manual / dokumen SJPH per 5 kriteria SJPH (Kepkaban BPJPH No. 20/2023).
// `access` = departemen yang boleh melihat (pengganti "manual auth matrix" sistem lama).
export const ManualDto = z.object({
  doc_number: reqStr(50),
  title: reqStr(255),
  criteria: master('sjph_criteria'),
  department_id: optInt(),
  remarks: str(1000),
  access: intList(),
})
export type ManualInput = z.infer<typeof ManualDto>

export const CreateManualDto = ManualDto.extend({ file: upload() })
export type CreateManualInput = z.infer<typeof CreateManualDto>

export const RevisionDto = z.object({
  remarks: z.string().trim().min(3, 'Uraian perubahan wajib diisi').max(1000),
  file: upload(),
})
export type RevisionInput = z.infer<typeof RevisionDto>

