import { z } from 'zod'
import { intList, isoDate, master, optDate, optMaster, reqStr, str, upload } from '../../core/dto.ts'
import { masters } from '../../core/masters.ts'

// Sertifikat halal produk perusahaan. Wajib/tidaknya masa berlaku mengikuti flag halal_bodies.requires_expiry
// (BPJPH: berlaku selama tidak ada perubahan komposisi bahan / PPH, PP 42/2024).
export const CertificateDto = z
  .object({
    certificate_number: reqStr(100),
    product_ids: intList().refine((v) => v.length > 0, 'Pilih minimal satu produk'), // certificate_products
    scope_note: str(2000),
    category: master('categories'),
    site: master('sites'),
    halal_body: master('halal_bodies'),
    lph: optMaster('lph'),
    fatwa_number: str(100),
    issue_date: isoDate(),
    valid_until: optDate(),
    note: str(1000),
    file: upload(),
  })
  .superRefine((v, ctx) => {
    const body = masters.get('halal_bodies', v.halal_body)
    if (body?.requires_expiry && !v.valid_until) ctx.addIssue({ code: 'custom', path: ['valid_until'], message: `Sertifikat ${body.name} wajib memiliki masa berlaku` })
    if (v.valid_until && v.valid_until <= v.issue_date) ctx.addIssue({ code: 'custom', path: ['valid_until'], message: 'Masa berlaku harus setelah tanggal terbit' })
  })
export type CertificateInput = z.infer<typeof CertificateDto>

