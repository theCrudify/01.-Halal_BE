// Default configuration rows. Everything here can be changed later from the admin screens (it lives in the database).

const row = (i: number, r: Record<string, unknown>) => ({ id: i + 1, sort_order: (i + 1) * 10, is_active: true, ...r })

export const settings = [
  ['file_max_mb', '5', 'number', 'Ukuran maksimal satu file lampiran (MB)'],
  ['file_allowed_types', 'application/pdf,image/png,image/jpeg', 'list', 'Tipe file lampiran yang diizinkan (MIME, pisahkan koma)'],
  ['list_max_page_size', '100', 'number', 'Batas maksimal baris per halaman pada semua daftar'],
  ['search_max_terms', '5', 'number', 'Jumlah kata maksimal yang dipakai pencarian'],
  ['dashboard_expiring_soon_days', '30', 'number', 'Dashboard: sertifikat bahan dianggap “segera habis” (hari)'],
  ['dashboard_expiring_days', '90', 'number', 'Dashboard: jendela pemantauan sertifikat bahan (hari)'],
  ['certificate_expiring_days', '180', 'number', 'Dashboard: sertifikat produk dianggap “akan habis” (hari)'],
  ['task_queue_oldest_first', 'true', 'boolean', 'Task List diurutkan dari request yang paling lama menunggu'],
].map(([key, value, value_type, description], i) => ({ id: i + 1, key, value, value_type, description }))

export const expiryWindows = [
  ['EXPIRED', 'Sudah kedaluwarsa', null, -1, true, false],
  ['SOON_30', 'Habis ≤ 30 hari', 0, 30, true, false],
  ['SOON_90', 'Habis ≤ 90 hari', 0, 90, true, false],
  ['SOON_180', 'Habis ≤ 180 hari', 0, 180, true, false],
  ['VALID', 'Masih berlaku', 0, null, true, true],
  ['NO_DATE', 'Tanpa tanggal', null, null, false, false],
].map(([code, name, days_from, days_to, has_date, include_non_expiring], i) => row(i, { code, name, days_from, days_to, has_date, include_non_expiring }))

// ------------------------------------------------------------------ lists
type F = [key: string, label: string, column: string, opts?: { show?: boolean; sort?: boolean; filter?: string; source?: string; nullLabel?: string; primary?: boolean }]
type R = { code: string; name: string; sort: string; dir: 'asc' | 'desc'; search: string[]; fields: F[] }

const ACTIVE: F = ['is_active', 'Aktif', 't.is_active', { filter: 'values', source: 'true:Aktif|false:Nonaktif' }]
const master = (code: string, name: string, extra: F[] = []): R => ({
  code,
  name,
  sort: 'sort_order',
  dir: 'asc',
  search: ['t.code', 't.name'],
  fields: [['code', 'Kode', 't.code'], ['name', 'Nama', 't.name'], ...extra, ['sort_order', 'Urutan', 't.sort_order'], ACTIVE, ['updated_at', 'Diperbarui', 't.updated_at', { show: false }]],
})
const soft = (code: string, name: string, extra: F[] = [], search = ['t.code', 't.name']): R => ({
  code,
  name,
  sort: 'name',
  dir: 'asc',
  search,
  fields: [['code', 'Kode', 't.code'], ['name', 'Nama', 't.name'], ...extra, ['updated_at', 'Diperbarui', 't.updated_at']],
})

const RESOURCES: R[] = [
  {
    code: 'materials',
    name: 'Master list halal',
    sort: 'material_code',
    dir: 'asc',
    search: ['m.search_text'],
    fields: [
      ['material_code', 'Bahan', 'm.material_code'],
      ['plant', 'Plant', 'm.plant', { filter: 'master', source: 'plants' }],
      ['material_type', 'Jenis', 'm.material_type', { filter: 'master', source: 'material_types' }],
      ['supplier', 'Supplier · produsen', 's.name'],
      ['halal_body', 'Sertifikat halal', 'm.halal_body', { filter: 'master', source: 'halal_bodies' }],
      ['expired_date', 'Berlaku s/d', 'm.expired_date'],
      ['status', 'Status', 'm.status', { filter: 'master', source: 'workflow_states', primary: true }],
      ['expiry', 'Masa berlaku SH', 'm.expired_date', { show: false, sort: false, filter: 'expiry', source: 'm.halal_body', primary: true }],
      ['category', 'Kategori', 'm.category', { show: false, filter: 'master', source: 'categories', nullLabel: 'Uncategorized', primary: true }],
      ['site', 'Site', 'm.plant', { show: false, sort: false, filter: 'site' }],
      ['supplier_id', 'Supplier', 'm.supplier_id', { show: false, sort: false, filter: 'relation', source: 'suppliers' }],
      ['manufacturer_id', 'Produsen', 'm.manufacturer_id', { show: false, sort: false, filter: 'relation', source: 'manufacturers' }],
      ['country_id', 'Negara asal', 'mf.country_id', { show: false, sort: false, filter: 'relation', source: 'countries' }],
      ['is_active', 'Aktif', 'm.is_active', { show: false, filter: 'values', source: 'true:Aktif|false:Nonaktif' }],
      ['manufacturer', 'Produsen', 'mf.name', { show: false }],
      ['cert_number', 'No. sertifikat', 'm.cert_number', { show: false }],
      ['product', 'Produk', 'pr.name', { show: false }],
      ['updated_at', 'Diperbarui', 'm.updated_at', { show: false }],
    ],
  },
  {
    code: 'requests',
    name: 'Request & approval',
    sort: 'updated_at',
    dir: 'desc',
    search: ['m.search_text', 'u.name'],
    fields: [
      ['material_code', 'Bahan', 'm.material_code'],
      ['request_type', 'Jenis', 'r.request_type', { filter: 'values', source: 'New:Bahan baru|Change:Perubahan', primary: true }],
      ['plant', 'Plant', 'r.plant', { filter: 'master', source: 'plants', primary: true }],
      ['status', 'Status', 'r.status', { filter: 'master', source: 'workflow_states', primary: true }],
      ['current_step', 'Posisi', 'r.current_step'],
      ['requested_by_name', 'Pengaju', 'u.name'],
      ['updated_at', 'Menunggu sejak', 'r.updated_at'],
      ['category', 'Kategori', 'm.category', { show: false, sort: false, filter: 'master', source: 'categories', primary: true }],
      ['created_at', 'Diajukan', 'r.created_at', { show: false }],
    ],
  },
  {
    code: 'certificates',
    name: 'Sertifikat halal produk',
    sort: 'issue_date',
    dir: 'desc',
    search: ['t.search_text'],
    fields: [
      ['certificate_number', 'No. sertifikat', 't.certificate_number'],
      ['products', 'Produk', 't.scope_note', { sort: false }],
      ['category', 'Kategori', 't.category', { filter: 'master', source: 'categories', primary: true }],
      ['site', 'Site', 't.site', { filter: 'master', source: 'sites', primary: true }],
      ['halal_body', 'Penerbit', 't.halal_body', { filter: 'master', source: 'halal_bodies' }],
      ['issue_date', 'Terbit', 't.issue_date'],
      ['valid_until', 'Berlaku s/d', 't.valid_until'],
      ['version', 'Versi', 't.version'],
      ['validity', 'Masa berlaku', 't.valid_until', { show: false, sort: false, filter: 'expiry', source: 't.halal_body', primary: true }],
      ['year', 'Tahun terbit', 't.issue_date', { show: false, sort: false, filter: 'year' }],
    ],
  },
  {
    code: 'manuals',
    name: 'Manual SJPH',
    sort: 'doc_number',
    dir: 'asc',
    search: ['t.search_text', 'd.name'],
    fields: [
      ['doc_number', 'No. dokumen', 't.doc_number'],
      ['title', 'Judul', 't.title'],
      ['criteria', 'Kriteria SJPH', 't.criteria', { filter: 'master', source: 'sjph_criteria', primary: true }],
      ['department', 'Pemilik', 'd.name'],
      ['revision', 'Rev.', 't.revision'],
      ['updated_at', 'Diperbarui', 't.updated_at'],
      ['department_id', 'Pemilik', 't.department_id', { show: false, sort: false, filter: 'relation', source: 'departments', primary: true }],
    ],
  },
  {
    code: 'reports',
    name: 'Laporan berkala',
    sort: 'period_start',
    dir: 'desc',
    search: ['t.search_text', 'd.name'],
    fields: [
      ['report_type', 'Jenis', 't.report_type', { filter: 'master', source: 'report_types', primary: true }],
      ['plant', 'Plant', 't.plant', { filter: 'master', source: 'plants', primary: true }],
      ['period_start', 'Periode', 't.period_start'],
      ['auditor_name', 'Auditor · auditee', 't.auditor_name'],
      ['findings', 'Temuan', 't.findings'],
      ['year', 'Tahun', 't.period_start', { show: false, sort: false, filter: 'year', primary: true }],
      ['updated_at', 'Diperbarui', 't.updated_at', { show: false }],
    ],
  },
  {
    code: 'users',
    name: 'Users & role',
    sort: 'name',
    dir: 'asc',
    search: ['t.search_text', 'd.name'],
    fields: [
      ['employee_code', 'NIK', 't.employee_code'],
      ['name', 'Nama', 't.name'],
      ['role', 'Role', 't.role', { filter: 'master', source: 'roles', primary: true }],
      ['department', 'Departemen', 'd.name'],
      ['site', 'Site', 't.site', { filter: 'master', source: 'sites', nullLabel: 'Semua site', primary: true }],
      ['is_active', 'Status', 't.is_active', { filter: 'values', source: 'true:Aktif|false:Nonaktif', primary: true }],
      ['department_id', 'Departemen', 't.department_id', { show: false, sort: false, filter: 'relation', source: 'departments' }],
    ],
  },
  // ---- reference data
  soft('departments', 'Departemen', [['section', 'Section', 't.section']], ['t.code', 't.name', 't.section']),
  soft('countries', 'Negara'),
  soft('suppliers', 'Supplier', [['country', 'Negara', 'co.name'], ['country_id', 'Negara', 't.country_id', { show: false, sort: false, filter: 'relation', source: 'countries', primary: true }]], ['t.search_text', 'co.name']),
  soft('manufacturers', 'Produsen', [['country', 'Negara', 'co.name'], ['country_id', 'Negara', 't.country_id', { show: false, sort: false, filter: 'relation', source: 'countries', primary: true }]], ['t.search_text', 'co.name']),
  soft('lines', 'Line produksi', [['plant', 'Plant', 't.plant', { filter: 'master', source: 'plants', primary: true }]]),
  soft('products', 'Produk', [['category', 'Kategori', 't.category', { filter: 'master', source: 'categories', primary: true }], ['plant', 'Plant', 't.plant', { filter: 'master', source: 'plants', primary: true }]]),
  // ---- business masters
  master('sites', 'Site'),
  master('plants', 'Plant', [['site_code', 'Site', 't.site_code', { filter: 'master', source: 'sites', primary: true }]]),
  master('categories', 'Kategori'),
  master('material_types', 'Jenis bahan', [['requires_certificate', 'Wajib sertifikat', 't.requires_certificate']]),
  master('halal_bodies', 'Lembaga penerbit sertifikat', [['requires_expiry', 'Punya masa berlaku', 't.requires_expiry'], ['requires_registration', 'Wajib registrasi', 't.requires_registration']]),
  master('lph', 'Lembaga Pemeriksa Halal'),
  master('sjph_criteria', 'Kriteria SJPH'),
  master('report_types', 'Jenis laporan'),
  master('roles', 'Role & hak akses'),
  master('workflow_states', 'Alur approval', [
    ['kind', 'Jenis', 't.kind', { filter: 'values', source: 'step:Tahap|release:Release|rejected:Ditolak', primary: true }],
    ['step_no', 'Urutan tahap', 't.step_no'],
    ['role_code', 'Role', 't.role_code', { filter: 'master', source: 'roles' }],
  ]),
  // ---- configuration
  master('expiry_windows', 'Rentang masa berlaku', [['days_from', 'Dari (hari)', 't.days_from'], ['days_to', 'Sampai (hari)', 't.days_to']]),
  master('list_resources', 'Daftar (list)', [['default_sort', 'Urutan default', 't.default_sort'], ['page_size', 'Baris', 't.page_size']]),
  master('menus', 'Menu navigasi', [['group_name', 'Grup', 't.group_name'], ['path', 'Alamat', 't.path'], ['permission', 'Hak akses', 't.permission']]),
  {
    code: 'list_fields',
    name: 'Kolom & filter daftar',
    sort: 'resource',
    dir: 'asc',
    search: ['t.key', 't.label', 't.column_ref'],
    fields: [
      ['resource', 'Daftar', 't.resource', { filter: 'master', source: 'list_resources', primary: true }],
      ['key', 'Kunci', 't.key'],
      ['label', 'Label', 't.label'],
      ['column_ref', 'Kolom SQL', 't.column_ref'],
      ['filter_type', 'Filter', 't.filter_type', { filter: 'values', source: 'master:Master|relation:Relasi|site:Site|expiry:Masa berlaku|values:Nilai tetap|year:Tahun', primary: true }],
      ['sort_order', 'Urutan', 't.sort_order'],
      ['is_active', 'Aktif', 't.is_active', { filter: 'values', source: 'true:Aktif|false:Nonaktif' }],
    ],
  },
  {
    code: 'settings',
    name: 'Pengaturan',
    sort: 'key',
    dir: 'asc',
    search: ['t.key', 't.description'],
    fields: [
      ['key', 'Kunci', 't.key'],
      ['value', 'Nilai', 't.value'],
      ['value_type', 'Tipe', 't.value_type', { filter: 'values', source: 'number:Angka|text:Teks|list:Daftar|boolean:Ya/Tidak' }],
      ['description', 'Keterangan', 't.description', { sort: false }],
    ],
  },
]

export const listResources = RESOURCES.map((r, i) =>
  row(i, { code: r.code, name: r.name, default_sort: r.sort, default_dir: r.dir, page_size: r.code === 'materials' || r.code === 'requests' ? 25 : 10, search_refs: r.search }),
)
export const listFields = RESOURCES.flatMap((r) =>
  r.fields.map(([key, label, column_ref, o = {}], i) => ({
    resource: r.code,
    key,
    label,
    column_ref,
    show_in_table: o.show ?? true,
    sortable: o.sort ?? true,
    filter_type: o.filter ?? null,
    filter_source: o.source ?? null,
    null_label: o.nullLabel ?? null,
    filter_primary: o.primary ?? false,
    sort_order: (i + 1) * 10,
    is_active: true,
  })),
).map((f, i) => ({ id: i + 1, ...f }))

// ------------------------------------------------------------------ navigation
const ADMIN_PAGES: [string, string, string][] = [
  ['departments', 'Departemen', 'building-2'],
  ['suppliers', 'Supplier', 'truck'],
  ['manufacturers', 'Produsen', 'factory'],
  ['countries', 'Negara', 'flag'],
  ['lines', 'Line produksi', 'workflow'],
  ['products', 'Produk', 'package-check'],
  ['sites', 'Site', 'map-pin'],
  ['plants', 'Plant', 'warehouse'],
  ['categories', 'Kategori', 'tags'],
  ['material_types', 'Jenis bahan', 'flask-conical'],
  ['halal_bodies', 'Lembaga penerbit', 'stamp'],
  ['lph', 'LPH', 'microscope'],
  ['sjph_criteria', 'Kriteria SJPH', 'list-tree'],
  ['report_types', 'Jenis laporan', 'file-type'],
]
const CONFIG_PAGES: [string, string, string][] = [
  ['roles', 'Role & hak akses', 'shield-check'],
  ['workflow_states', 'Alur approval', 'git-branch'],
  ['expiry_windows', 'Rentang masa berlaku', 'calendar-range'],
  ['list_resources', 'Daftar', 'table-2'],
  ['list_fields', 'Kolom & filter', 'columns-3'],
  ['menus', 'Menu', 'panel-left'],
  ['settings', 'Pengaturan', 'settings-2'],
]
type M = [code: string, name: string, group: string | null, path: string, icon: string, permission?: string | null, badge?: string | null, expand?: boolean]
const MENUS: M[] = [
  ['home', 'Ringkasan', null, '/', 'layout-grid'],
  ['tasks', 'Task List', null, '/requests?scope=tasks', 'inbox', 'request.view_all', 'tasks'],
  ['my_requests', 'Request saya', null, '/requests?scope=mine', 'send'],
  ['all_requests', 'Semua request', null, '/requests?scope=all', 'list-checks', 'request.view_all'],
  ['materials', 'Semua bahan', 'Master list halal', '/materials', 'package', null, null, true],
  ['uncategorized', 'Uncategorized', 'Master list halal', '/materials?category=__none', 'boxes'],
  ['manuals', 'Manual SJPH', 'Dokumen SJPH', '/manuals', 'book-open'],
  ['certificates', 'Sertifikat produk', 'Dokumen SJPH', '/certificates', 'file-badge'],
  ['reports', 'Laporan berkala', 'Dokumen SJPH', '/reports', 'file-clock'],
  ['users', 'Users', 'Master data', '/users', 'users', 'admin'],
  ...ADMIN_PAGES.map(([code, name, icon]): M => [`admin_${code}`, name, 'Master data', `/admin/${code}`, icon, 'admin']),
  ...CONFIG_PAGES.map(([code, name, icon]): M => [`admin_${code}`, name, 'Konfigurasi', `/admin/${code}`, icon, 'admin']),
]
export const menus = MENUS.map(([code, name, group_name, path, icon, permission = null, badge = null, expand_shortcuts = false], i) =>
  row(i, { code, name, group_name, path, icon, permission, badge, expand_shortcuts }),
)
