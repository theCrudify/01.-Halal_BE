import { CrudService } from '../../core/crud.ts'
import type { CategoryInput } from './categories.dto.ts'
import type { CategoryRepository } from './categories.repository.ts'

export class CategoryService extends CrudService<CategoryInput> {
  constructor(repo: CategoryRepository) {
    super(repo, 'Kategori')
  }
}
