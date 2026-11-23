import { assertPlantAccess, scopedPlants, type User } from '../../core/auth.ts'
import { notFound } from '../../core/http.ts'
import type { FileService } from '../files/files.service.ts'
import type { ReportInput } from './reports.dto.ts'
import type { ReportRepository } from './reports.repository.ts'

export class ReportService {
  constructor(private readonly repo: ReportRepository, private readonly files: FileService) {}

  list(user: User, query: Record<string, string | undefined>) {
    return this.repo.list(scopedPlants(user), query)
  }

  async detail(user: User, id: number) {
    const row = await this.repo.findById(id)
    if (!row) throw notFound('Laporan')
    assertPlantAccess(user, row.plant)
    return row
  }

  async create(user: User, { file, feedback_file, ...data }: ReportInput) {
    assertPlantAccess(user, data.plant)
    const file_id = await this.files.save(file, user.id, true)
    const feedback_file_id = await this.files.save(feedback_file, user.id)
    return this.repo.insert({ ...data, file_id, feedback_file_id, created_by: user.id })
  }

  async update(user: User, id: number, { file, feedback_file, ...data }: ReportInput) {
    assertPlantAccess(user, data.plant)
    const cur = await this.detail(user, id)
    const file_id = (await this.files.save(file, user.id)) ?? cur.file_id
    const feedback_file_id = (await this.files.save(feedback_file, user.id)) ?? cur.feedback_file_id
    await this.repo.update(id, { ...data, file_id, feedback_file_id })
    return { ok: true }
  }

  async remove(id: number) {
    if (!(await this.repo.softDelete(id))) throw notFound('Laporan')
    return { ok: true }
  }
}
