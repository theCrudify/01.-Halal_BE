import { z } from 'zod'
import { isoDate, master, optInt, reqStr, str, upload } from '../../core/dto.ts'

// Laporan berkala SJPH: audit internal (min. 1x/tahun), kaji ulang manajemen, laporan pelaksanaan SJPH, audit LPH/BPJPH.

export const ReportDto = z
  .object({
    report_type: master('report_types'),
    plant: master('plants'),
    period_start: isoDate(),
    period_end: isoDate(),
    auditor_name: reqStr(150),
    auditee_department_id: optInt(),
    findings: z.coerce.number().int().min(0).max(999),
    summary: str(4000),
    feedback_note: str(4000),
    file: upload(),
    feedback_file: upload(),
  })
  .refine((v) => v.period_end >= v.period_start, { path: ['period_end'], message: 'Akhir periode harus setelah awal periode' })
export type ReportInput = z.infer<typeof ReportDto>

