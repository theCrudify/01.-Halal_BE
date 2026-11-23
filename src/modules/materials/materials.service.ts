import { assertPlantAccess, scopedPlants, type User } from '../../core/auth.ts'
import { conflict, notFound } from '../../core/http.ts'
import type { MaterialPatchInput } from './materials.dto.ts'
import type { MaterialRepository } from './materials.repository.ts'

/** CSV cell, protected against Excel formula injection. */
export const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export class MaterialService {
  constructor(private readonly repo: MaterialRepository) {}

  list(user: User, query: Record<string, string | undefined>) {
    return this.repo.list(scopedPlants(user), query)
  }

  /** Columns and headers come from the list configuration of 'materials'. BOM so Excel reads UTF-8. */
  async exportCsv(user: User, query: Record<string, string | undefined>) {
    const { fields, rows } = await this.repo.exportRows(scopedPlants(user), query)
    const lines = [fields.map((f) => csvCell(f.label)).join(','), ...rows.map((r) => fields.map((f) => csvCell(r[f.key])).join(','))]
    return '\uFEFF' + lines.join('\n')
  }

  async detail(user: User, id: number) {
    const material = await this.repo.findById(id)
    if (!material) throw notFound('Material')
    assertPlantAccess(user, material.plant)
    const [requests, histories] = await Promise.all([this.repo.findRequests(id), this.repo.findHistories(id)])
    return { ...material, requests, histories }
  }

  async patch(user: User, id: number, input: MaterialPatchInput) {
    const material = await this.repo.findById(id)
    if (!material) throw notFound('Material')
    assertPlantAccess(user, material.plant)
    await this.repo.update(id, input)
    return { ok: true }
  }

  async remove(id: number) {
    const open = await this.repo.findOpenRequest(id)
    if (open) throw conflict('Material masih memiliki request yang sedang diproses')
    if (!(await this.repo.softDelete(id))) throw notFound('Material')
    return { ok: true }
  }
}
