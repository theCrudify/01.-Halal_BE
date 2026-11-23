import { pool } from './core/database.ts'

/*
 * Idempotent schema. Design rules:
 *  - Every business option is a master row referenced by FK (codes: ON UPDATE CASCADE; in-use rows cannot be deleted).
 *  - No free-text copies of related data: suppliers, manufacturers, products, lines, departments, users are FKs.
 *  - Lists (filters, columns, sorting, search), expiry windows, numeric rules and navigation are configuration tables.
 *  - Column comments are the labels the admin UI shows.
 */

const MASTER_COLS = `
  id serial primary key,
  code varchar(60) not null unique,
  name varchar(150) not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()`
const SOFT_COLS = `
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz`
const ref = (table: string, nullable = true) => `varchar(60) ${nullable ? '' : 'not null '}references ${table}(code) on update cascade`
const fk = (table: string, nullable = true) => `int ${nullable ? '' : 'not null '}references ${table}(id)`

const schema = /* sql */ `
-- ===================================================================== business masters
create table if not exists sites (${MASTER_COLS});
create table if not exists plants (${MASTER_COLS}, site_code ${ref('sites', false)});
create table if not exists categories (${MASTER_COLS});
create table if not exists material_types (${MASTER_COLS}, requires_certificate boolean not null default true);
create table if not exists halal_bodies (${MASTER_COLS}, requires_expiry boolean not null default true, requires_registration boolean not null default false);
create table if not exists lph (${MASTER_COLS});
create table if not exists sjph_criteria (${MASTER_COLS});
create table if not exists report_types (${MASTER_COLS});
create table if not exists roles (${MASTER_COLS}, permissions text[] not null default '{}');
create table if not exists workflow_states (
  ${MASTER_COLS},
  kind varchar(10) not null check (kind in ('step', 'release', 'rejected')),
  step_no int unique,
  role_code ${ref('roles')},
  tone varchar(10) not null default 'neutral' check (tone in ('neutral', 'blue', 'amber', 'orange', 'violet', 'green', 'red', 'teal', 'rose')),
  check ((kind = 'step') = (step_no is not null and role_code is not null))
);
create unique index if not exists workflow_states_one_terminal on workflow_states (kind) where kind <> 'step';

-- ===================================================================== configuration
-- Numeric / text rules (file size, allowed types, thresholds…).
create table if not exists settings (
  id serial primary key,
  key varchar(60) not null unique,
  value text not null,
  value_type varchar(10) not null check (value_type in ('number', 'text', 'list', 'boolean')),
  description text not null,
  updated_at timestamptz not null default now()
);
-- Expiry filter windows: days relative to today; has_date=false matches rows without a date;
-- include_non_expiring also matches rows without a date whose halal body has requires_expiry=false.
create table if not exists expiry_windows (${MASTER_COLS}, days_from int, days_to int, has_date boolean not null default true, include_non_expiring boolean not null default false);
-- One row per list screen: default sort, page size, searchable columns.
create table if not exists list_resources (
  ${MASTER_COLS},
  default_sort varchar(60) not null,
  default_dir varchar(4) not null default 'asc' check (default_dir in ('asc', 'desc')),
  page_size int not null default 10,
  search_refs text[] not null default '{}'
);
-- Columns and filters of a list. column_ref is the SQL column (alias.column) of the list query.
-- filter_source by filter_type: master → master table; relation → table (id, name); expiry → halal body column;
-- values → 'value:Label|value:Label'; site / year → unused.
create table if not exists list_fields (
  id serial primary key,
  resource ${ref('list_resources', false)},
  key varchar(60) not null,
  label varchar(100) not null,
  column_ref varchar(100) not null,
  show_in_table boolean not null default true,
  sortable boolean not null default true,
  filter_type varchar(20) check (filter_type in ('master', 'relation', 'site', 'expiry', 'values', 'year')),
  filter_source varchar(100),
  null_label varchar(60),
  filter_primary boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource, key)
);
-- Navigation. permission null = everyone; badge 'tasks' shows the task count; expand_shortcuts adds site × category links.
create table if not exists menus (
  ${MASTER_COLS},
  group_name varchar(60),
  path varchar(200) not null,
  icon varchar(60) not null default 'circle',
  permission varchar(60),
  badge varchar(20) check (badge in ('tasks')),
  expand_shortcuts boolean not null default false
);

-- ===================================================================== reference data
create table if not exists departments (id serial primary key, code varchar(30) not null unique, name varchar(150) not null, section varchar(150), ${SOFT_COLS});
create table if not exists users (
  id serial primary key,
  employee_code varchar(30) not null unique,
  name varchar(150) not null,
  email varchar(150),
  password_hash text not null,
  role ${ref('roles', false)},
  department_id ${fk('departments')},
  site ${ref('sites')},
  is_active boolean not null default true,
  ${SOFT_COLS}
);
create table if not exists countries (id serial primary key, code varchar(3) not null unique, name varchar(100) not null, ${SOFT_COLS});
create table if not exists suppliers (id serial primary key, code varchar(30) not null unique, name varchar(150) not null, country_id ${fk('countries')}, ${SOFT_COLS});
create table if not exists manufacturers (id serial primary key, code varchar(30) not null unique, name varchar(150) not null, country_id ${fk('countries')}, ${SOFT_COLS});
create table if not exists lines (id serial primary key, code varchar(30) not null unique, name varchar(100) not null, plant ${ref('plants', false)}, ${SOFT_COLS});
create table if not exists products (id serial primary key, code varchar(30) not null unique, name varchar(150) not null, category ${ref('categories', false)}, plant ${ref('plants', false)}, ${SOFT_COLS});

create table if not exists files (
  id serial primary key,
  name varchar(255) not null,
  mime varchar(100) not null,
  size int not null,
  data bytea not null,
  created_by ${fk('users')},
  created_at timestamptz not null default now()
);

-- ===================================================================== transactions
create table if not exists materials (
  id serial primary key,
  plant ${ref('plants', false)},
  material_code varchar(30) not null,
  material_desc varchar(255) not null,
  category ${ref('categories')},
  material_type ${ref('material_types', false)},
  supplier_id ${fk('suppliers')},
  manufacturer_id ${fk('manufacturers')},
  halal_body ${ref('halal_bodies')},
  lph ${ref('lph')},
  cert_number varchar(100),
  bpjph_reg_number varchar(100),
  expired_date date,
  release_until date,
  product_id ${fk('products')},
  line_id ${fk('lines')},
  status ${ref('workflow_states', false)},
  is_active boolean not null default true,
  note text,
  packaging_file_id ${fk('files')},
  attachment_file_id ${fk('files')},
  certificate_file_id ${fk('files')},
  im_file_id ${fk('files')},
  search_text text, -- maintained by trigger (includes supplier / manufacturer / product names)
  created_by ${fk('users')},
  ${SOFT_COLS}
);
create unique index if not exists materials_identity on materials (plant, material_code, coalesce(supplier_id, 0), coalesce(manufacturer_id, 0)) where deleted_at is null;
create index if not exists materials_filter on materials (plant, category, status) where deleted_at is null;
create index if not exists materials_expired on materials (expired_date) where deleted_at is null;
create table if not exists material_distributions (
  material_id ${fk('materials', false)},
  department_id ${fk('departments', false)},
  primary key (material_id, department_id)
);

create table if not exists material_requests (
  id serial primary key,
  material_id ${fk('materials', false)},
  version int not null,
  request_type varchar(10) not null check (request_type in ('New', 'Change')),
  plant ${ref('plants', false)},
  data jsonb not null, -- proposed material data (ids / codes), applied on release
  status ${ref('workflow_states', false)},
  current_step int not null default 1,
  requested_by ${fk('users', false)},
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, version)
);
create index if not exists material_requests_task on material_requests (status, plant);

create table if not exists approval_histories (
  id serial primary key,
  request_id ${fk('material_requests', false)},
  material_id ${fk('materials', false)},
  action varchar(20) not null,
  from_status ${ref('workflow_states')},
  to_status ${ref('workflow_states', false)},
  user_id ${fk('users', false)},
  role ${ref('roles', false)}, -- role of the actor at that moment
  note text,
  created_at timestamptz not null default now()
);
create index if not exists approval_histories_request on approval_histories (request_id);

create table if not exists certificates (
  id serial primary key,
  certificate_number varchar(100) not null unique,
  scope_note text,
  category ${ref('categories', false)},
  site ${ref('sites', false)},
  halal_body ${ref('halal_bodies', false)},
  lph ${ref('lph')},
  fatwa_number varchar(100),
  issue_date date not null,
  valid_until date,
  version int not null default 1,
  file_id ${fk('files')},
  search_text text, -- maintained by trigger (includes product names)
  created_by ${fk('users')},
  ${SOFT_COLS}
);
create table if not exists certificate_products (
  certificate_id ${fk('certificates', false)},
  product_id ${fk('products', false)},
  primary key (certificate_id, product_id)
);
create table if not exists certificate_versions (
  id serial primary key,
  certificate_id ${fk('certificates', false)},
  version int not null,
  data jsonb not null,
  created_by ${fk('users')},
  created_at timestamptz not null default now()
);

create table if not exists manuals (
  id serial primary key,
  doc_number varchar(50) not null unique,
  title varchar(255) not null,
  criteria ${ref('sjph_criteria', false)},
  department_id ${fk('departments')},
  revision int not null default 0,
  file_id ${fk('files')},
  remarks text,
  created_by ${fk('users')},
  ${SOFT_COLS}
);
create table if not exists manual_revisions (
  id serial primary key,
  manual_id ${fk('manuals', false)},
  revision int not null,
  file_id ${fk('files')},
  remarks text,
  created_by ${fk('users')},
  created_at timestamptz not null default now()
);
create table if not exists manual_access (
  manual_id ${fk('manuals', false)},
  department_id ${fk('departments', false)},
  primary key (manual_id, department_id)
);

create table if not exists reports (
  id serial primary key,
  report_type ${ref('report_types', false)},
  plant ${ref('plants', false)},
  period_start date not null,
  period_end date not null,
  auditor_name varchar(150) not null, -- may be an external LPH / BPJPH auditor
  auditee_department_id ${fk('departments')},
  findings int not null default 0,
  summary text,
  file_id ${fk('files')},
  feedback_file_id ${fk('files')},
  feedback_note text,
  created_by ${fk('users')},
  ${SOFT_COLS}
);
`

// ------------------------------------------------------------------ search
// Single-table search documents: generated columns. Cross-table ones (materials, certificates): triggers.
const SEARCH: Record<string, string[]> = {
  manuals: ['doc_number', 'title'],
  reports: ['auditor_name', 'summary'],
  users: ['employee_code', 'name', 'email'],
  suppliers: ['code', 'name'],
  manufacturers: ['code', 'name'],
}
const searchColumn = (t: string, cols: string[]) =>
  `alter table ${t} add column if not exists search_text text generated always as (${cols.map((c) => `coalesce(${c}, '')`).join(` || ' ' || `)}) stored`

const triggers = /* sql */ `
create or replace function materials_search_text() returns trigger language plpgsql as $$
begin
  new.search_text := concat_ws(' ', new.material_code, new.material_desc, new.cert_number, new.bpjph_reg_number,
    (select s.code || ' ' || s.name from suppliers s where s.id = new.supplier_id),
    (select m.name || ' ' || coalesce(c.name, '') from manufacturers m left join countries c on c.id = m.country_id where m.id = new.manufacturer_id),
    (select p.name from products p where p.id = new.product_id));
  return new;
end $$;
create or replace trigger materials_search before insert or update on materials for each row execute function materials_search_text();

create or replace function certificates_search_text() returns trigger language plpgsql as $$
begin
  new.search_text := concat_ws(' ', new.certificate_number, new.fatwa_number, new.scope_note,
    (select string_agg(p.code || ' ' || p.name, ' ') from certificate_products cp join products p on p.id = cp.product_id where cp.certificate_id = new.id));
  return new;
end $$;
create or replace trigger certificates_search before insert or update on certificates for each row execute function certificates_search_text();

-- Renaming a related row refreshes the search documents that include it.
create or replace function refresh_search_documents() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'suppliers' then update materials set search_text = null where supplier_id = new.id;
  elsif tg_table_name = 'manufacturers' then update materials set search_text = null where manufacturer_id = new.id;
  elsif tg_table_name = 'countries' then update materials set search_text = null where manufacturer_id in (select id from manufacturers where country_id = new.id);
  elsif tg_table_name = 'products' then
    update materials set search_text = null where product_id = new.id;
    update certificates set search_text = null where id in (select certificate_id from certificate_products where product_id = new.id);
  end if;
  return null;
end $$;
create or replace trigger suppliers_refresh after update of code, name on suppliers for each row execute function refresh_search_documents();
create or replace trigger manufacturers_refresh after update of name, country_id on manufacturers for each row execute function refresh_search_documents();
create or replace trigger countries_refresh after update of name on countries for each row execute function refresh_search_documents();
create or replace trigger products_refresh after update of code, name on products for each row execute function refresh_search_documents();
`

const BTREE: [string, string][] = [
  ['materials', 'updated_at desc'],
  ['materials', 'supplier_id'],
  ['materials', 'manufacturer_id'],
  ['material_requests', 'updated_at desc'],
  ['material_requests', 'requested_by, updated_at desc'],
  ['material_requests', 'material_id, status'],
  ['approval_histories', 'created_at desc'],
  ['certificates', 'issue_date desc'],
  ['reports', 'period_start desc'],
  ['list_fields', 'resource, sort_order'],
]

// ------------------------------------------------------------------ labels (column comments → admin UI)
const LABELS: Record<string, Record<string, string>> = {
  _master: { code: 'Kode', name: 'Nama', sort_order: 'Urutan', is_active: 'Aktif' },
  plants: { site_code: 'Site' },
  material_types: { requires_certificate: 'Wajib sertifikat halal' },
  halal_bodies: { requires_expiry: 'Sertifikat punya masa berlaku', requires_registration: 'Wajib registrasi BPJPH' },
  roles: { permissions: 'Hak akses' },
  workflow_states: { kind: 'Jenis status', step_no: 'Urutan tahap', role_code: 'Role penanggung jawab', tone: 'Warna' },
  expiry_windows: { days_from: 'Dari (hari, relatif hari ini)', days_to: 'Sampai (hari)', has_date: 'Harus punya tanggal', include_non_expiring: 'Termasuk sertifikat tanpa masa berlaku' },
  list_resources: { default_sort: 'Urutan default (key)', default_dir: 'Arah urutan', page_size: 'Baris per halaman', search_refs: 'Kolom pencarian' },
  menus: { group_name: 'Grup menu', path: 'Alamat halaman', icon: 'Ikon (lucide)', permission: 'Hak akses yang dibutuhkan', badge: 'Badge', expand_shortcuts: 'Tampilkan pintasan site × kategori' },
  settings: { key: 'Kunci', value: 'Nilai', value_type: 'Tipe', description: 'Keterangan' },
  list_fields: {
    resource: 'Daftar',
    key: 'Kunci',
    label: 'Label',
    column_ref: 'Kolom SQL',
    show_in_table: 'Tampil di tabel',
    sortable: 'Bisa diurutkan',
    filter_type: 'Jenis filter',
    filter_source: 'Sumber opsi filter',
    null_label: 'Label untuk nilai kosong',
    filter_primary: 'Filter utama',
    sort_order: 'Urutan',
    is_active: 'Aktif',
  },
  departments: { code: 'Kode', name: 'Nama', section: 'Section' },
  countries: { code: 'Kode ISO', name: 'Nama' },
  suppliers: { code: 'Kode vendor', name: 'Nama', country_id: 'Negara' },
  manufacturers: { code: 'Kode', name: 'Nama produsen', country_id: 'Negara' },
  lines: { code: 'Kode', name: 'Nama line', plant: 'Plant' },
  products: { code: 'Kode produk', name: 'Nama produk', category: 'Kategori', plant: 'Plant' },
}
const MASTER_TABLES = ['sites', 'plants', 'categories', 'material_types', 'halal_bodies', 'lph', 'sjph_criteria', 'report_types', 'roles', 'workflow_states', 'expiry_windows', 'list_resources', 'menus']
const comments = () => {
  const out: string[] = []
  const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
  for (const t of MASTER_TABLES) for (const [c, l] of Object.entries({ ...LABELS._master, ...(LABELS[t] ?? {}) })) out.push(`comment on column ${t}.${c} is ${lit(l)}`)
  for (const [t, cols] of Object.entries(LABELS)) if (!t.startsWith('_') && !MASTER_TABLES.includes(t)) for (const [c, l] of Object.entries(cols)) out.push(`comment on column ${t}.${c} is ${lit(l)}`)
  return out
}

const indexes = () => [
  'create extension if not exists pg_trgm',
  ...Object.entries(SEARCH).flatMap(([t, cols]) => [searchColumn(t, cols), `create index if not exists ${t}_search_trgm on ${t} using gin (search_text gin_trgm_ops)`]),
  'create index if not exists materials_search_trgm on materials using gin (search_text gin_trgm_ops)',
  'create index if not exists certificates_search_trgm on certificates using gin (search_text gin_trgm_ops)',
  ...BTREE.map(([t, cols]) => `create index if not exists ${t}_${cols.replace(/\W+/g, '_').replace(/_+$/, '')}_idx on ${t} (${cols})`),
]

export async function migrate() {
  await pool.query(schema)
  await pool.query(triggers)
  for (const q of [...indexes(), ...comments()]) await pool.query(q)
}

/** Development only: drops every table so the schema above is recreated from scratch. */
export async function resetSchema() {
  await pool.query('drop schema public cascade; create schema public;')
}

if (import.meta.main) {
  if (process.argv.includes('--reset')) {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database')
    await resetSchema()
  }
  await migrate()
  console.log('Migration done')
  await pool.end()
}
