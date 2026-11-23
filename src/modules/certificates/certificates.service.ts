import type { User } from '../../core/auth.ts'
import { notFound } from '../../core/http.ts'
import type { FileService } from '../files/files.service.ts'
import type { CertificateInput } from './certificates.dto.ts'
import type { CertificateRepository } from './certificates.repository.ts'

/** Every edit creates a new version; previous values stay in certificate_versions. */
export class CertificateService {
  constructor(private readonly repo: CertificateRepository, private readonly files: FileService) {}

  list(query: Record<string, string | undefined>) {
    return this.repo.list(query)
  }

  async detail(id: number) {
    const row = await this.repo.findById(id)
    if (!row) throw notFound('Sertifikat')
    return { ...row, versions: await this.repo.findVersions(id) }
  }

  async create(user: User, { note, file, product_ids, ...data }: CertificateInput) {
    const file_id = await this.files.save(file, user.id, true)
    return this.repo.transaction(async (trx) => {
      const repo = this.repo.withTx(trx)
      const id = await repo.insert({ ...data, file_id, created_by: user.id })
      await repo.replaceProducts(id, product_ids)
      await repo.insertVersion({ certificate_id: id, version: 1, data: JSON.stringify({ ...data, product_ids, file_id, note }), created_by: user.id })
      return { id }
    })
  }

  async update(user: User, id: number, { note, file, product_ids, ...data }: CertificateInput) {
    const newFile = await this.files.save(file, user.id)
    return this.repo.transaction(async (trx) => {
      const repo = this.repo.withTx(trx)
      const cur = await repo.lockById(id)
      if (!cur) throw notFound('Sertifikat')
      const version = cur.version + 1
      const file_id = newFile ?? cur.file_id
      await repo.update(id, { ...data, file_id, version })
      await repo.replaceProducts(id, product_ids)
      await repo.insertVersion({ certificate_id: id, version, data: JSON.stringify({ ...data, product_ids, file_id, note }), created_by: user.id })
      return { ok: true, version }
    })
  }

  async remove(id: number) {
    if (!(await this.repo.softDelete(id))) throw notFound('Sertifikat')
    return { ok: true }
  }
}
