import { can, scopedPlants, type User } from '../../core/auth.ts'
import type { CertificateRepository } from '../certificates/certificates.repository.ts'
import type { ManualRepository } from '../manuals/manuals.repository.ts'
import type { MaterialRepository } from '../materials/materials.repository.ts'
import type { RequestRepository } from '../requests/requests.repository.ts'
import type { SearchInput, SearchResponse } from './search.dto.ts'

const LIMIT = '5'

/** Global quick search (⌘K). Reuses each module's repository, so scoping, indexes and relevance ranking are identical. */
export class SearchService {
  constructor(
    private readonly materials: MaterialRepository,
    private readonly requests: RequestRepository,
    private readonly certificates: CertificateRepository,
    private readonly manuals: ManualRepository,
  ) {}

  async search(user: User, { q }: SearchInput): Promise<SearchResponse> {
    const query = { search: q, pageSize: LIMIT }
    const plants = scopedPlants(user)
    const [m, r, c, d] = await Promise.all([
      this.materials.list(plants, query),
      this.requests.list({ plants, requestedBy: can(user, 'request.view_all') ? undefined : user.id }, { scope: 'all' }, query),
      this.certificates.list(query),
      this.manuals.list(can(user, 'manual.view_all') ? undefined : user.department_id, query),
    ])
    return {
      materials: m.data.map((x) => ({ id: x.id, title: x.material_desc, subtitle: `${x.material_code} · ${x.plant} · ${x.supplier_name ?? '-'}`, badge: x.status })),
      requests: r.data.map((x) => ({ id: x.id, title: `#${x.id} ${x.material_desc}`, subtitle: `${x.material_code} · ${x.request_type === 'New' ? 'Bahan baru' : 'Perubahan'} · ${x.requested_by_name}`, badge: x.status })),
      certificates: c.data.map((x) => ({ id: x.id, title: x.certificate_number, subtitle: x.scope_note ?? x.category, badge: x.halal_body })),
      manuals: d.data.map((x) => ({ id: x.id, title: x.title, subtitle: `${x.doc_number} · ${x.criteria}`, badge: `Rev. ${x.revision}` })),
    }
  }
}
