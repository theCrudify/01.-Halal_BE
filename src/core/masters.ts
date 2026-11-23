import { db } from './database.ts'

/** Every business option lives in one of these tables (see migrate.ts). */
export const MASTER_TABLES = ['sites', 'plants', 'categories', 'material_types', 'halal_bodies', 'lph', 'sjph_criteria', 'report_types', 'roles', 'workflow_states', 'expiry_windows', 'list_resources', 'menus'] as const
export type MasterTable = (typeof MASTER_TABLES)[number]
export type MasterRow = { id: number; code: string; name: string; sort_order: number; is_active: boolean } & Record<string, any>

/**
 * Capability keys the API checks. Which role has which capability is data (roles.permissions); only the
 * list of capabilities is code, because code enforces them.
 */
export const PERMISSIONS: Record<string, string> = {
  admin: 'Administrator: semua akses termasuk master data & user',
  'request.view_all': 'Melihat semua request (bukan hanya milik sendiri)',
  'material.manage': 'Mengubah status aktif & catatan bahan',
  'certificate.manage': 'Menambah & memperbarui sertifikat halal produk',
  'manual.manage': 'Menambah & merevisi Manual SJPH',
  'manual.view_all': 'Melihat semua Manual SJPH (tanpa batas departemen)',
  'report.manage': 'Menambah & mengubah laporan berkala',
}

const TTL_MS = 30_000

/**
 * In-memory snapshot of all master tables. Refreshed every 30 s and immediately after any master write.
 * shortcut: with several API instances another instance sees a master change after at most 30 s; use LISTEN/NOTIFY if that matters.
 */
export type ListField = { id: number; resource: string; key: string; label: string; column_ref: string; show_in_table: boolean; sortable: boolean; filter_type: string | null; filter_source: string | null; null_label: string | null; filter_primary: boolean; sort_order: number; is_active: boolean }
export type Setting = { key: string; value: string; value_type: 'number' | 'text' | 'list' | 'boolean'; description: string }

class MasterRegistry {
  private data = {} as Record<MasterTable, MasterRow[]>
  private fields: ListField[] = []
  private settingRows: Setting[] = []
  private loadedAt = 0
  private loading: Promise<void> | null = null

  async load(force = false) {
    if (!force && Date.now() - this.loadedAt < TTL_MS) return
    this.loading ??= (async () => {
      const [rows, fields, settings] = await Promise.all([
        Promise.all(MASTER_TABLES.map((t) => db.selectFrom(t).selectAll().orderBy('sort_order').orderBy('name').execute())),
        db.selectFrom('list_fields').selectAll().orderBy('resource').orderBy('sort_order').execute(),
        db.selectFrom('settings').selectAll().execute(),
      ])
      this.data = Object.fromEntries(MASTER_TABLES.map((t, i) => [t, rows[i]])) as Record<MasterTable, MasterRow[]>
      this.fields = fields as ListField[]
      this.settingRows = settings as Setting[]
      this.loadedAt = Date.now()
    })().finally(() => (this.loading = null))
    return this.loading
  }

  invalidate() {
    this.loadedAt = 0
  }

  all(t: MasterTable) {
    return this.data[t] ?? []
  }
  active(t: MasterTable) {
    return this.all(t).filter((r) => r.is_active)
  }
  get(t: MasterTable, code?: string | null) {
    return code ? this.all(t).find((r) => r.code === code) : undefined
  }
  /** Valid for new data: exists and active. */
  has(t: MasterTable, code?: string | null) {
    return !!this.get(t, code)?.is_active
  }
  name(t: MasterTable, code?: string | null) {
    return this.get(t, code)?.name ?? code ?? ''
  }

  // ---- workflow
  steps() {
    return this.active('workflow_states')
      .filter((s) => s.kind === 'step')
      .sort((a, b) => a.step_no - b.step_no)
  }
  /** Includes inactive steps, so requests already waiting at a deactivated step can still be approved / rejected. */
  stepAt(stepNo: number) {
    return this.all('workflow_states').find((s) => s.kind === 'step' && s.step_no === stepNo)
  }
  /** Step after `stepNo`, or undefined when `stepNo` is the last one. */
  nextStep(stepNo: number) {
    return this.steps().find((s) => s.step_no > stepNo)
  }
  prevStep(stepNo: number) {
    return this.steps().filter((s) => s.step_no < stepNo).at(-1)
  }
  terminal(kind: 'release' | 'rejected') {
    const s = this.all('workflow_states').find((x) => x.kind === kind)
    if (!s) throw new Error(`Master workflow_states has no '${kind}' state`)
    return s
  }
  openStatuses() {
    return this.all('workflow_states').filter((s) => s.kind === 'step').map((s) => s.code)
  }

  // ---- configuration
  /** All rows of a table that the registry knows, for the meta endpoint. */
  listFields(resource?: string) {
    return this.fields.filter((f) => f.is_active && (!resource || f.resource === resource))
  }
  resource(code: string) {
    const r = this.get('list_resources', code)
    if (!r) throw new Error(`list_resources has no '${code}' row`)
    return r
  }
  settings() {
    return this.settingRows
  }
  /** Typed setting with a fallback used only when the row is missing. */
  number(key: string, fallback: number) {
    const v = Number(this.settingRows.find((s) => s.key === key)?.value)
    return Number.isFinite(v) ? v : fallback
  }
  list(key: string, fallback: string[]) {
    const v = this.settingRows.find((s) => s.key === key)?.value
    return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : fallback
  }

  // ---- sites & roles
  plantsOfSite(site: string) {
    return this.all('plants').filter((p) => p.site_code === site).map((p) => p.code)
  }
  permissions(role: string): string[] {
    return this.get('roles', role)?.permissions ?? []
  }
}

export const masters = new MasterRegistry()
