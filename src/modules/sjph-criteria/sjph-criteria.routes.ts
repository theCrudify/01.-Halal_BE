import { crudRoutes } from '../../core/crud.ts'
import { db } from '../../core/database.ts'
import { SjphCriterionController } from './sjph-criteria.controller.ts'
import { SjphCriterionRepository } from './sjph-criteria.repository.ts'
import { SjphCriterionService } from './sjph-criteria.service.ts'

export const sjphCriteriaRoutes = crudRoutes(new SjphCriterionController(new SjphCriterionService(new SjphCriterionRepository(db))))
