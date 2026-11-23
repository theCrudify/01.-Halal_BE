import { CrudController } from '../../core/crud.ts'
import { ReportTypeDto, type ReportTypeInput } from './report-types.dto.ts'
import type { ReportTypeService } from './report-types.service.ts'

export class ReportTypeController extends CrudController<ReportTypeInput> {
  constructor(service: ReportTypeService) {
    super(service, ReportTypeDto)
  }
}
