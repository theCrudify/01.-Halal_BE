import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import { requireAuth, type Env } from './core/auth.ts'
import { authRoutes } from './modules/auth/auth.routes.ts'
import { certificatesRoutes } from './modules/certificates/certificates.routes.ts'
import { countriesRoutes } from './modules/countries/countries.routes.ts'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.ts'
import { departmentsRoutes } from './modules/departments/departments.routes.ts'
import { filesRoutes } from './modules/files/files.routes.ts'
import { linesRoutes } from './modules/lines/lines.routes.ts'
import { manualsRoutes } from './modules/manuals/manuals.routes.ts'
import { materialsRoutes } from './modules/materials/materials.routes.ts'
import { metaRoutes } from './modules/meta/meta.routes.ts'
import { productsRoutes } from './modules/products/products.routes.ts'
import { reportsRoutes } from './modules/reports/reports.routes.ts'
import { requestsRoutes } from './modules/requests/requests.routes.ts'
import { searchRoutes } from './modules/search/search.routes.ts'
import { suppliersRoutes } from './modules/suppliers/suppliers.routes.ts'
import { usersRoutes } from './modules/users/users.routes.ts'
import { manufacturersRoutes } from './modules/manufacturers/manufacturers.routes.ts'
import { expiryWindowsRoutes } from './modules/expiry-windows/expiry-windows.routes.ts'
import { listResourcesRoutes } from './modules/list-resources/list-resources.routes.ts'
import { listFieldsRoutes } from './modules/list-fields/list-fields.routes.ts'
import { menusRoutes } from './modules/menus/menus.routes.ts'
import { settingsRoutes } from './modules/settings/settings.routes.ts'
import { sitesRoutes } from './modules/sites/sites.routes.ts'
import { plantsRoutes } from './modules/plants/plants.routes.ts'
import { categoriesRoutes } from './modules/categories/categories.routes.ts'
import { materialTypesRoutes } from './modules/material-types/material-types.routes.ts'
import { halalBodiesRoutes } from './modules/halal-bodies/halal-bodies.routes.ts'
import { lphRoutes } from './modules/lph/lph.routes.ts'
import { sjphCriteriaRoutes } from './modules/sjph-criteria/sjph-criteria.routes.ts'
import { reportTypesRoutes } from './modules/report-types/report-types.routes.ts'
import { rolesRoutes } from './modules/roles/roles.routes.ts'
import { workflowStatesRoutes } from './modules/workflow-states/workflow-states.routes.ts'

export const app = new Hono<Env>()

app.use(logger())
app.use(secureHeaders())
app.use('/api/*', cors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true }))
app.use('/api/*', bodyLimit({ maxSize: 20 * 1024 * 1024 })) // up to 3 files of 5 MB + fields

app.get('/', (c) => c.json({ name: 'SJH Halal API', status: 'ok' }))
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/auth', authRoutes)

const api = new Hono<Env>()
api.use(requireAuth)
api.route('/meta', metaRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/search', searchRoutes)
api.route('/materials', materialsRoutes)
api.route('/requests', requestsRoutes)
api.route('/certificates', certificatesRoutes)
api.route('/manuals', manualsRoutes)
api.route('/reports', reportsRoutes)
api.route('/files', filesRoutes)
api.route('/users', usersRoutes)
api.route('/departments', departmentsRoutes)
api.route('/countries', countriesRoutes)
api.route('/suppliers', suppliersRoutes)
api.route('/lines', linesRoutes)
api.route('/products', productsRoutes)
// business option masters & configuration
api.route('/manufacturers', manufacturersRoutes)
api.route('/expiry-windows', expiryWindowsRoutes)
api.route('/list-resources', listResourcesRoutes)
api.route('/list-fields', listFieldsRoutes)
api.route('/menus', menusRoutes)
api.route('/settings', settingsRoutes)
api.route('/sites', sitesRoutes)
api.route('/plants', plantsRoutes)
api.route('/categories', categoriesRoutes)
api.route('/material-types', materialTypesRoutes)
api.route('/halal-bodies', halalBodiesRoutes)
api.route('/lph', lphRoutes)
api.route('/sjph-criteria', sjphCriteriaRoutes)
api.route('/report-types', reportTypesRoutes)
api.route('/roles', rolesRoutes)
api.route('/workflow-states', workflowStatesRoutes)
app.route('/api', api)

app.notFound((c) => c.json({ message: 'Endpoint tidak ditemukan' }, 404))

app.onError((err, c) => {
  if (err instanceof z.ZodError) {
    const { fieldErrors, formErrors } = z.flattenError(err)
    return c.json({ message: formErrors[0] ?? 'Data tidak valid, periksa kembali isian', errors: fieldErrors }, 422)
  }
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status)
  const code = (err as { code?: string }).code
  if (code === '23505') return c.json({ message: 'Data dengan kode / nomor tersebut sudah ada' }, 409)
  if (code === '23503') return c.json({ message: 'Data terkait tidak ditemukan atau masih dipakai' }, 409)
  // A list configuration (list_fields.column_ref / list_resources.search_refs) points to an unknown column.
  if (code === '42703' || code === '42P01') return c.json({ message: 'Konfigurasi daftar tidak valid: kolom tidak dikenal. Periksa List fields / List resources.' }, 422)
  console.error(err)
  return c.json({ message: 'Terjadi kesalahan pada server' }, 500)
})
