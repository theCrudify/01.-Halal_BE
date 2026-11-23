import { CrudController } from '../../core/crud.ts'
import { CategoryDto, type CategoryInput } from './categories.dto.ts'
import type { CategoryService } from './categories.service.ts'

export class CategoryController extends CrudController<CategoryInput> {
  constructor(service: CategoryService) {
    super(service, CategoryDto)
  }
}
