import { CrudService } from '../../core/crud.ts'
import type { ReportTypeInput } from './report-types.dto.ts'
import type { ReportTypeRepository } from './report-types.repository.ts'

export class ReportTypeService extends CrudService<ReportTypeInput> {
  constructor(repo: ReportTypeRepository) {
    super(repo, 'Jenis laporan')
  }
}
