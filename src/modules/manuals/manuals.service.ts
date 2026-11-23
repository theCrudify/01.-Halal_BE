import { can, type User } from '../../core/auth.ts'
import { notFound } from '../../core/http.ts'
import type { FileService } from '../files/files.service.ts'
import type { CreateManualInput, ManualInput, RevisionInput } from './manuals.dto.ts'
import type { ManualRepository } from './manuals.repository.ts'

export class ManualService {
  constructor(private readonly repo: ManualRepository, private readonly files: FileService) {}

  /** Without manual.view_all a user only sees manuals shared with their department. */
  private scope = (user: User) => (can(user, 'manual.view_all') ? undefined : user.department_id)

  list(user: User, query: Record<string, string | undefined>) {
    return this.repo.list(this.scope(user), query)
  }

  async detail(user: User, id: number) {
    const row = await this.repo.findById(id, this.scope(user))
    if (!row) throw notFound('Manual')
    const [revisions, access] = await Promise.all([this.repo.findRevisions(id), this.repo.findAccess(id)])
    return { ...row, revisions, access }
  }

  async create(user: User, { access, file, ...data }: CreateManualInput) {
    const file_id = await this.files.save(file, user.id, true)
    return this.repo.transaction(async (trx) => {
      const repo = this.repo.withTx(trx)
      const id = await repo.insert({ ...data, file_id, revision: 0, created_by: user.id })
      await repo.insertRevision({ manual_id: id, revision: 0, file_id, remarks: data.remarks ?? 'Terbitan awal', created_by: user.id })
      await repo.replaceAccess(id, access)
      return { id }
    })
  }

  /** Metadata + access only; a new file goes through addRevision. */
  async update(id: number, { access, ...data }: ManualInput) {
    return this.repo.transaction(async (trx) => {
      const repo = this.repo.withTx(trx)
      if (!(await repo.update(id, data))) throw notFound('Manual')
      await repo.replaceAccess(id, access)
      return { ok: true }
    })
  }

  async addRevision(user: User, id: number, { remarks, file }: RevisionInput) {
    const file_id = await this.files.save(file, user.id, true)
    return this.repo.transaction(async (trx) => {
      const repo = this.repo.withTx(trx)
      const cur = await repo.lockById(id)
      if (!cur) throw notFound('Manual')
      const revision = cur.revision + 1
      await repo.update(id, { revision, file_id })
      await repo.insertRevision({ manual_id: id, revision, file_id, remarks, created_by: user.id })
      return { revision }
    })
  }

  async remove(id: number) {
    if (!(await this.repo.softDelete(id))) throw notFound('Manual')
    return { ok: true }
  }
}
