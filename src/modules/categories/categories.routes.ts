import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { CategoryController } from './categories.controller.ts'
import { CategoryRepository } from './categories.repository.ts'
import { CategoryService } from './categories.service.ts'

export const categoriesRoutes = crudRoutes(new CategoryController(new CategoryService(new CategoryRepository(db))))
