// Integration test against a seeded database: npm run db:seed && npm test
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { app } from './app.ts'
import { pool } from './core/database.ts'
import { escapeLike, resolveSort } from './core/list.ts'

after(() => pool.end())

const login = async (employee_code: string) => {
  const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employee_code, password: 'Halal@2026' }) })
  assert.equal(res.status, 200)
  return (await res.json()).token as string
}
const call = async (token: string, path: string, init: RequestInit = {}) => {
  const res = await app.request(path, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } })
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }
}
// Approve/reject with the revision the user saw on the detail page (idempotency token).
const act = async (token: string, id: number, op: "approve" | "reject", fields: Record<string, string | Blob>) => {
  const revision = String((await call(token, `/api/requests/${id}`)).body.revision ?? 0)
  return call(token, `/api/requests/${id}/${op}`, { method: "POST", body: form({ revision, ...fields }) })
}
const form = (o: Record<string, string | Blob>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.append(k, v)
  return f
}

test('list helpers', () => {
  assert.equal(escapeLike('50%_a\\'), '50\\%\\_a\\\\')
  const cfg = { searchable: [], sortable: { name: 't.name' }, defaultSort: ['name', 'desc'] as [string, 'desc'] }
  assert.deepEqual(resolveSort(cfg, 'drop table', 'asc'), { sortBy: 'name', sortDir: 'desc' }) // unknown column is ignored
  assert.deepEqual(resolveSort(cfg, 'name', undefined), { sortBy: 'name', sortDir: 'asc' })
})

test('auth rejects bad credentials and missing token', async () => {
  const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employee_code: 'admin', password: 'wrong' }) })
  assert.equal(res.status, 401)
  assert.equal((await app.request('/api/materials')).status, 401)
})

test('login locks an account after 5 wrong passwords, even for the right password', async () => {
  const attempt = (password: string) => app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employee_code: '20006', password }) })
  for (let i = 0; i < 5; i++) assert.equal((await attempt('salah')).status, 401)
  assert.equal((await attempt('Halal@2026')).status, 429)
})

test('material list: pagination, sorting, search, filters, site scope', async () => {
  const admin = await login('admin')
  const page1 = await call(admin, '/api/materials?pageSize=10&sortBy=material_code&sortDir=asc')
  assert.equal(page1.status, 200)
  assert.equal(page1.body.data.length, 10)
  const codes = page1.body.data.map((m: any) => m.material_code)
  assert.deepEqual(codes, [...codes].sort())
  const page2 = await call(admin, '/api/materials?pageSize=10&page=2&sortBy=material_code&sortDir=asc')
  const ids1 = new Set(page1.body.data.map((m: any) => m.id))
  assert.ok(page2.body.data.every((m: any) => !ids1.has(m.id)), 'pages must not overlap')

  const search = await call(admin, '/api/materials?search=kedelai')
  assert.ok(search.body.meta.total > 0)
  assert.ok(search.body.data.every((m: any) => /kedelai/i.test(Object.values(m).join(' '))))

  const filtered = await call(admin, '/api/materials?plant=1203&category=SNB&pageSize=100')
  assert.ok(filtered.body.data.every((m: any) => m.plant === '1203' && m.category === 'SNB'))
  const none = await call(admin, '/api/materials?category=__none&pageSize=100')
  assert.ok(none.body.data.length > 0 && none.body.data.every((m: any) => m.category === null))
  const expired = await call(admin, '/api/materials?expiry=EXPIRED&pageSize=100')
  const today = new Date().toISOString().slice(0, 10)
  assert.ok(expired.body.data.every((m: any) => m.expired_date < today))

  const kejayan = await login('20001')
  const scoped = await call(kejayan, '/api/materials?pageSize=100')
  assert.ok(scoped.body.data.every((m: any) => m.plant === '1203'), 'Kejayan user only sees plant 1203')
})

test('request workflow: submit -> 4 approvals -> release; wrong role is blocked; reject goes back', async () => {
  const requester = await login('10006') // User, Sukabumi
  const pdf = new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' })
  const code = `TEST-${Date.now()}`
  const base = { request_type: 'New', plant: '1202', material_code: code, material_desc: 'Bahan Uji', category: 'BEV', material_type: 'KRITIS', manufacturer_id: '1', halal_body: 'BPJPH', lph: 'LPPOM', cert_number: 'ID3211000012345', certificate_file: new File([pdf], 'sh.pdf', { type: 'application/pdf' }) }

  // Policy rule: foreign certificate without BPJPH registration is refused.
  const bad = await call(requester, '/api/requests', { method: 'POST', body: form({ ...base, halal_body: 'LHLN', expired_date: '2030-01-01' }) })
  assert.equal(bad.status, 422)
  assert.ok(bad.body.errors.bpjph_reg_number)

  const created = await call(requester, '/api/requests', { method: 'POST', body: form(base) })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const id = created.body.id

  // A QA user cannot approve step 1 (Halal Team).
  const qa = await login('10005')
  assert.equal((await act(qa, id, "approve", {})).status, 403)

  const halal = await login('10001')
  const penyelia = await login('10003')
  const koordinator = await login('10004')
  assert.equal((await act(halal, id, "approve", { note: 'ok' })).body.status, 'REVIEW_PENYELIA')
  assert.equal((await act(penyelia, id, "approve", {})).body.status, 'REVIEW_KOORDINATOR')

  // Reject at step 3 goes back to step 2.
  assert.equal((await act(koordinator, id, "reject", { note: 'Lampiran kurang lengkap' })).body.status, 'REVIEW_PENYELIA')
  assert.equal((await act(penyelia, id, "approve", {})).body.status, 'REVIEW_KOORDINATOR')
  assert.equal((await act(koordinator, id, "approve", {})).body.status, 'REVIEW_QA')
  assert.equal((await act(qa, id, "approve", {})).body.status, 'RELEASE')

  const detail = await call(requester, `/api/requests/${id}`)
  assert.equal(detail.body.material.status, 'RELEASE')
  assert.equal(detail.body.material.is_active, true)
  assert.deepEqual(detail.body.histories.map((h: any) => h.action), ['Submit', 'Approve', 'Approve', 'Reject', 'Approve', 'Approve', 'Release'])

  // Released request can no longer be approved.
  assert.equal((await act(qa, id, "approve", {})).status, 409)

  // Kejayan approver cannot touch a Sukabumi request.
  const kjy = await login('20001')
  assert.equal((await call(kjy, `/api/requests/${id}`)).status, 403)
})

test('dashboard and master lists respond', async () => {
  const admin = await login('admin')
  const d = await call(admin, '/api/dashboard')
  assert.equal(d.status, 200)
  assert.ok(Array.isArray(d.body.pipeline))
  for (const p of ['users', 'departments', 'countries', 'suppliers', 'lines', 'products', 'certificates', 'manuals', 'reports', 'requests?scope=all']) {
    const r = await call(admin, `/api/${p}${p.includes('?') ? '&' : '?'}sortBy=updated_at&sortDir=desc&search=a`)
    assert.equal(r.status, 200, p)
    assert.ok('meta' in r.body, p)
  }
  // Plain users only see manuals shared with their department.
  const hcd = await login('30001')
  const m = await call(hcd, '/api/manuals?pageSize=100')
  assert.ok(m.body.meta.total > 0 && m.body.meta.total < 20)
})

test('master CRUD (generic classes): admin writes, others blocked, duplicate code 409, soft delete frees code', async () => {
  const admin = await login('admin')
  const user = await login('10006')
  const code = `T${Date.now() % 100000}`
  const body = () => form({ code, name: 'Dept Uji', section: 'Test' })

  assert.equal((await call(user, '/api/departments', { method: 'POST', body: body() })).status, 403)
  const created = await call(admin, '/api/departments', { method: 'POST', body: body() })
  assert.equal(created.status, 201)
  assert.equal((await call(admin, '/api/departments', { method: 'POST', body: body() })).status, 409)

  const id = created.body.id
  const updated = await call(admin, `/api/departments/${id}`, { method: 'PUT', body: form({ code, name: 'Dept Uji 2', section: '' }) })
  assert.equal(updated.body.name, 'Dept Uji 2')
  assert.equal(updated.body.section, null)
  const missing = await call(admin, '/api/departments', { method: 'POST', body: form({ code: '', name: '' }) })
  assert.equal(missing.status, 422)
  assert.ok(missing.body.errors.code && missing.body.errors.name)

  assert.equal((await call(admin, `/api/departments/${id}`, { method: 'DELETE' })).status, 200)
  assert.equal((await call(admin, `/api/departments/${id}`)).status, 404)
  assert.equal((await call(admin, '/api/departments', { method: 'POST', body: body() })).status, 201, 'code reusable after delete')
})

test('certificate edit creates a new version; non-BPJPH needs validity', async () => {
  const halal = await login('10001')
  const file = new File(['%PDF-1.4\n%%EOF'], 'sh.pdf', { type: 'application/pdf' })
  const base = { certificate_number: `ID-TEST-${Date.now()}`, product_ids: '1', category: 'BEV', site: 'SKB', halal_body: 'BPJPH', issue_date: '2026-01-10' }

  const noValidity = await call(halal, '/api/certificates', { method: 'POST', body: form({ ...base, halal_body: 'LHLN', file }) })
  assert.equal(noValidity.status, 422)
  assert.ok(noValidity.body.errors.valid_until)

  const created = await call(halal, '/api/certificates', { method: 'POST', body: form({ ...base, file }) })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const updated = await call(halal, `/api/certificates/${created.body.id}`, { method: 'PUT', body: form({ ...base, product_ids: '1,2', scope_note: 'Tambah varian', note: 'Pengembangan produk' }) })
  assert.equal(updated.body.version, 2)
  const detail = await call(halal, `/api/certificates/${created.body.id}`)
  assert.deepEqual(detail.body.versions.map((v: any) => v.version), [2, 1])
  assert.ok(detail.body.file_id, 'file kept when no new upload')
})

test('search: every word must match, relevance order by default, global search is scoped', async () => {
  const admin = await login('admin')
  const both = await call(admin, '/api/materials?search=asam%20sitrat&pageSize=100')
  assert.ok(both.body.meta.total > 0)
  assert.equal(both.body.meta.sortBy, 'relevance')
  assert.ok(both.body.data.every((m: any) => /asam/i.test(JSON.stringify(m)) && /sitrat/i.test(JSON.stringify(m))))
  assert.ok(!('search_text' in both.body.data[0]), 'internal column hidden')
  const none = await call(admin, '/api/materials?search=sitrat%20zzzqqq')
  assert.equal(none.body.meta.total, 0)
  const sorted = await call(admin, '/api/materials?search=sitrat&sortBy=material_code&sortDir=desc')
  assert.equal(sorted.body.meta.sortBy, 'material_code', 'explicit sort wins over relevance')

  const kjy = await login('20001')
  const g = await call(kjy, '/api/search?q=sitrat')
  assert.equal(g.status, 200)
  assert.ok(g.body.materials.every((h: any) => h.subtitle.includes('1203')), 'Kejayan user only gets plant 1203')
  assert.equal((await call(kjy, '/api/search?q=a')).status, 422)
})

test('masters drive everything: dynamic workflow step, inactive option, FK-protected delete, permissions', async () => {
  const admin = await login('admin')
  const pdf = () => new File(['%PDF-1.4\n%%EOF'], 'sh.pdf', { type: 'application/pdf' })

  // Add an extra approval step (owned by QA) after the existing ones — no code change. Unique per run.
  const n = Date.now() % 100000
  const stepFields = { code: `FINAL_${n}`, name: 'Final check', kind: 'step', step_no: String(100 + (n % 800)), role_code: 'QA', tone: 'teal', sort_order: '45' }
  const step = await call(admin, '/api/workflow-states', { method: 'POST', body: form({ ...stepFields, is_active: 'true' }) })
  assert.equal(step.status, 201, JSON.stringify(step.body))
  try {
    const user = await login('10006')
    const r = await call(user, '/api/requests', { method: 'POST', body: form({ request_type: 'New', plant: '1202', material_code: `DYN-${Date.now()}`, material_desc: 'Uji workflow dinamis', material_type: 'POSITIVE' }) })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const approvers = ['10001', '10003', '10004', '10005']
    for (const nik of approvers) assert.equal((await act(await login(nik), r.body.id, "approve", {})).status, 200)
    const qa = await login('10005')
    const atFinal = await call(qa, `/api/requests/${r.body.id}`)
    assert.equal(atFinal.body.status, stepFields.code, 'request waits at the new step')
    assert.equal((await act(qa, r.body.id, "approve", {})).body.status, 'RELEASE')
  } finally {
    // In use by histories now, so it cannot be deleted: deactivate instead.
    const del = await call(admin, `/api/workflow-states/${step.body.id}`, { method: 'DELETE' })
    assert.equal(del.status, 409, 'workflow state in use is FK-protected')
    await call(admin, `/api/workflow-states/${step.body.id}`, { method: 'PUT', body: form(stepFields) })
  }

  // Deactivated category is refused for new data, with a field error.
  const cats = await call(admin, '/api/categories?search=SNB')
  const snb = cats.body.data[0]
  await call(admin, `/api/categories/${snb.id}`, { method: 'PUT', body: form({ code: 'SNB', name: snb.name, sort_order: String(snb.sort_order) }) })
  try {
    const halal = await login('20001')
    const bad = await call(halal, '/api/requests', { method: 'POST', body: form({ request_type: 'New', plant: '1203', category: 'SNB', material_code: 'X', material_desc: 'X', material_type: 'POSITIVE' }) })
    assert.equal(bad.status, 422)
    assert.match(bad.body.errors.category[0], /nonaktif/)
  } finally {
    await call(admin, `/api/categories/${snb.id}`, { method: 'PUT', body: form({ code: 'SNB', name: snb.name, sort_order: String(snb.sort_order), is_active: 'true' }) })
  }

  // Permissions come from the roles master: plain user cannot manage certificates, QA can.
  const user = await login('10006')
  assert.equal((await call(user, '/api/certificates', { method: 'POST', body: form({ certificate_number: 'X', product_ids: '1', category: 'BEV', site: 'SKB', halal_body: 'BPJPH', issue_date: '2026-01-01', file: pdf() }) })).status, 403)
  const meta = await call(user, '/api/meta')
  assert.deepEqual(meta.body.me.permissions, [])
  assert.ok(meta.body.masters.workflow_states.length >= 6 && meta.body.menu.length > 0)
})

test('lists, filters and rules are configuration: changes in the database change behaviour', async () => {
  const admin = await login('admin')
  // A configured filter works…
  const scoped = await call(admin, '/api/materials?plant=1203&pageSize=100')
  assert.ok(scoped.body.data.every((m: any) => m.plant === '1203'))
  // …and deactivating its list_fields row makes the API ignore it.
  const fields = await call(admin, '/api/list-fields?resource=materials&search=plant&pageSize=100')
  const plantField = fields.body.data.find((f: any) => f.key === 'plant')
  const body = (active: boolean) => form({ ...Object.fromEntries(Object.entries(plantField).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => [k, String(v)])), is_active: String(active) })
  assert.equal((await call(admin, `/api/list-fields/${plantField.id}`, { method: 'PUT', body: body(false) })).status, 200)
  try {
    const ignored = await call(admin, '/api/materials?plant=1203&pageSize=100')
    assert.ok(ignored.body.meta.total > scoped.body.meta.total, 'filter no longer applied')
  } finally {
    await call(admin, `/api/list-fields/${plantField.id}`, { method: 'PUT', body: body(true) })
  }

  // Relational search: the supplier name lives in suppliers, yet material search finds it (trigger-maintained document).
  const bySupplier = await call(admin, '/api/materials?search=shandong&pageSize=5')
  assert.ok(bySupplier.body.meta.total > 0 && bySupplier.body.data.every((m: any) => /shandong/i.test(m.supplier_name)))

  // Rules from settings: max upload size.
  const settings = await call(admin, '/api/settings?search=file_max_mb')
  const s = settings.body.data[0]
  await call(admin, `/api/settings/${s.id}`, { method: 'PUT', body: form({ key: s.key, value: '0.00001', value_type: 'number', description: s.description }) })
  try {
    const halal = await login('10001')
    const big = new File([new Uint8Array(2048)], 'a.pdf', { type: 'application/pdf' })
    const res = await call(halal, '/api/certificates', { method: 'POST', body: form({ certificate_number: `S-${Date.now()}`, product_ids: '1', category: 'BEV', site: 'SKB', halal_body: 'BPJPH', issue_date: '2026-01-01', file: big }) })
    assert.equal(res.status, 422)
    assert.match(res.body.message, /maksimal/)
  } finally {
    await call(admin, `/api/settings/${s.id}`, { method: 'PUT', body: form({ key: s.key, value: '5', value_type: 'number', description: s.description }) })
  }

  // Admin forms are generated from the database schema (labels = column comments, FK targets).
  const schema = await call(admin, '/api/plants/schema')
  const site = schema.body.find((c: any) => c.name === 'site_code')
  assert.equal(site.label, 'Site')
  assert.equal(site.ref.table, 'sites')
})

test('security: file IDOR, self-approval and stale tokens are blocked', async () => {
  const pdf = () => new File(['%PDF-1.4\n%%EOF'], 'sh.pdf', { type: 'application/pdf' })
  const base = { request_type: 'New', plant: '1202', material_desc: 'Uji keamanan', category: 'BEV', material_type: 'KRITIS', manufacturer_id: '1', halal_body: 'BPJPH', lph: 'LPPOM', cert_number: 'ID3211000012345' }

  // A Sukabumi attachment follows material access: readable within Sukabumi, not from Kejayan.
  const owner = await login('10006')
  const created = await call(owner, '/api/requests', { method: 'POST', body: form({ ...base, material_code: `SEC-${Date.now()}`, certificate_file: pdf() }) })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const fileId = (await call(owner, `/api/requests/${created.body.id}`)).body.data.certificate_file_id
  assert.ok(fileId)
  assert.equal((await call(owner, `/api/files/${fileId}`)).status, 200)
  assert.equal((await call(await login('10001'), `/api/files/${fileId}`)).status, 200)
  assert.equal((await call(await login('20005'), `/api/files/${fileId}`)).status, 403)
  assert.equal((await call(await login('20001'), `/api/files/${fileId}`)).status, 403)
  // Ids not referenced by anything the user may see (e.g. someone else's unused upload) are refused too.
  const { rows } = await pool.query(`insert into files (name, mime, size, data, created_by) values ('x.pdf', 'application/pdf', 1, '\\x00', (select id from users where employee_code = '10006')) returning id`)
  assert.equal((await call(await login('10007'), `/api/files/${rows[0].id}`)).status, 403)

  // A Halal Team member cannot approve or reject their own request; a colleague with the same role can.
  const halal = await login('10001')
  const own = await call(halal, '/api/requests', { method: 'POST', body: form({ ...base, material_code: `SEC2-${Date.now()}`, certificate_file: pdf() }) })
  assert.equal(own.status, 201, JSON.stringify(own.body))
  assert.equal((await call(halal, `/api/requests/${own.body.id}`)).body.can_approve, false)
  assert.equal((await act(halal, own.body.id, "approve", {})).status, 403)
  assert.equal((await act(halal, own.body.id, "reject", { note: 'tolak sendiri' })).status, 403)
  const tasks = await call(halal, '/api/requests?scope=tasks&pageSize=100')
  assert.ok(tasks.body.data.every((r: any) => r.id !== own.body.id))
  assert.equal((await act(await login('10002'), own.body.id, "approve", {})).status, 200)

  // A token stops working as soon as the user is deactivated, and a role change applies immediately.
  const token = await login('10007')
  await pool.query(`update users set is_active = false where employee_code = '10007'`)
  try {
    assert.equal((await call(token, '/api/dashboard')).status, 401)
  } finally {
    await pool.query(`update users set is_active = true where employee_code = '10007'`)
  }
  const qa = await login('10005')
  await pool.query(`update users set role = 'USER' where employee_code = '10005'`)
  try {
    assert.equal((await call(qa, '/api/users')).status, 403)
    assert.equal((await call(qa, '/api/dashboard')).body.myTasks, 0)
  } finally {
    await pool.query(`update users set role = 'QA' where employee_code = '10005'`)
  }
})

test('idempotency: a repeated or stale approve/reject is refused instead of acting on the next step', async () => {
  const owner = await login('10006')
  const created = await call(owner, '/api/requests', { method: 'POST', body: form({ request_type: 'New', plant: '1202', material_code: `IDEM-${Date.now()}`, material_desc: 'Uji idempotensi', material_type: 'POSITIVE' }) })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const id = created.body.id

  // Admin may act on every step: a double submit with the same revision must advance only one step.
  const admin = await login('admin')
  const revision = String((await call(admin, `/api/requests/${id}`)).body.revision)
  const post = (op: string, extra: Record<string, string> = {}) => call(admin, `/api/requests/${id}/${op}`, { method: 'POST', body: form({ revision, ...extra }) })
  const [a, b] = await Promise.all([post('approve'), post('approve')])
  assert.deepEqual([a.status, b.status].sort(), [200, 409])
  assert.equal((await call(admin, `/api/requests/${id}`)).body.status, 'REVIEW_PENYELIA')
  // A stale page (old revision) cannot reject either, and a missing revision is a validation error.
  assert.equal((await post('reject', { note: 'halaman lama' })).status, 409)
  assert.equal((await call(admin, `/api/requests/${id}/approve`, { method: 'POST', body: form({}) })).status, 422)

  // Creating the same new material twice is refused by the material identity index.
  const dup = { request_type: 'New', plant: '1202', material_code: `IDEM2-${Date.now()}`, material_desc: 'Uji duplikat', material_type: 'POSITIVE' }
  const [c1, c2] = await Promise.all([call(owner, '/api/requests', { method: 'POST', body: form(dup) }), call(owner, '/api/requests', { method: 'POST', body: form(dup) })])
  assert.deepEqual([c1.status, c2.status].sort(), [201, 409])
})
