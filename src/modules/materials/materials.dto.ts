import { z } from 'zod'
import { bool, intList, master, optDate, optInt, optMaster, reqStr, str } from '../../core/dto.ts'
import { masters } from '../../core/masters.ts'

/**
 * Material data (master list halal). The halal rules are driven by master flags, not by names:
 * - material_types.requires_certificate  → lembaga penerbit, nomor & produsen wajib (bahan kritis, Kepkaban BPJPH 20/2023)
 * - halal_bodies.requires_expiry         → tanggal kedaluwarsa wajib (sertifikat BPJPH berlaku tanpa batas, PP 42/2024)
 * - halal_bodies.requires_registration   → nomor registrasi BPJPH wajib (sertifikat halal luar negeri)
 */
export const MaterialDto = z
  .object({
    plant: master('plants'),
    material_code: reqStr(30),
    material_desc: reqStr(255),
    category: optMaster('categories'),
    material_type: master('material_types'),
    supplier_id: optInt(),
    manufacturer_id: optInt(),
    halal_body: optMaster('halal_bodies'),
    lph: optMaster('lph'),
    cert_number: str(100),
    bpjph_reg_number: str(100),
    expired_date: optDate(),
    release_until: optDate(),
    product_id: optInt(),
    line_id: optInt(),
    distributed_to: intList(), // department ids
  })
  .superRefine((m, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    const type = masters.get('material_types', m.material_type)
    const body = masters.get('halal_bodies', m.halal_body)
    if (type?.requires_certificate) {
      if (!m.halal_body) issue('halal_body', `${type.name}: wajib memiliki sertifikat halal (pilih lembaga penerbit)`)
      if (!m.cert_number) issue('cert_number', `${type.name}: nomor sertifikat halal wajib diisi`)
      if (!m.manufacturer_id) issue('manufacturer_id', `${type.name}: produsen wajib dipilih`)
    }
    if (body?.requires_expiry && !m.expired_date) issue('expired_date', `Sertifikat ${body.name} wajib memiliki tanggal kedaluwarsa`)
    if (body?.requires_registration && !m.bpjph_reg_number) issue('bpjph_reg_number', `Sertifikat ${body.name} wajib diregistrasi di BPJPH`)
    if (m.release_until && m.expired_date && m.release_until > m.expired_date) issue('release_until', 'Release until tidak boleh melewati tanggal kedaluwarsa sertifikat')
  })
export type MaterialInput = z.infer<typeof MaterialDto>

export const MaterialPatchDto = z.object({ is_active: bool().optional(), note: str(1000).optional() })
export type MaterialPatchInput = z.infer<typeof MaterialPatchDto>

