import { Hono, type Context } from 'hono'
import { sql } from 'kysely'
import type { z } from 'zod'
import { requirePermission, type Env } from './auth.ts'
import { BaseRepository } from './base.repository.ts'
import { bodyDto, idParam, notFound } from './http.ts'
import { paginateResource } from './list.ts'
import { masters } from './masters.ts'

/*
 * Generic CRUD building blocks (alias "t").
 *  - 'soft'  : reference data (departments, suppliers…) deleted via deleted_at; the unique code is freed on delete.
 *  - 'master': business options referenced by code (categories, roles, workflow…). Delete is a real delete that the
 *              foreign keys block while the row is in use (→ 409); deactivate with is_active instead.
 */
export type CrudConfig = {
  table: string
  mode: 'soft' | 'master'
  uniqueColumn: string
  resource: string // list_resources.code: search / sort / filters come from the database
}

export abstract class CrudRepository extends BaseRepository {
  protected abstract readonly config: CrudConfig

  /** Override to add joins / extra columns. */
  protected base() {
    const qb = this.db.selectFrom(`${this.config.table} as t`).selectAll('t')
    return this.config.mode === 'soft' ? qb.where('t.deleted_at', 'is', null) : qb
  }

  /**
   * Form schema of the table, read from the database itself (types, required, FK targets, column comments as labels),
   * so the admin UI needs no per-table code.
   */
  async schema() {
    const { rows } = await sql<{ name: string; type: string; nullable: boolean; has_default: boolean; label: string | null; ref_table: string | null; ref_column: string | null }>`
      select c.column_name as name, c.data_type as type, c.is_nullable = 'YES' as nullable, c.column_default is not null as has_default,
             col_description(${this.config.table}::regclass, c.ordinal_position) as label,
             ccu.table_name as ref_table, ccu.column_name as ref_column
      from information_schema.columns c
      left join information_schema.key_column_usage k on k.table_name = c.table_name and k.column_name = c.column_name
      left join information_schema.table_constraints tc on tc.constraint_name = k.constraint_name and tc.constraint_type = 'FOREIGN KEY'
      left join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where c.table_schema = 'public' and c.table_name = ${this.config.table}
        and c.column_name not in ('id', 'created_at', 'updated_at', 'deleted_at', 'search_text', 'password_hash')
      order by c.ordinal_position`.execute(this.db)
    // Allowed values of CHECK (col IN (...)) constraints become select options in the admin form.
    const checks = await sql<{ def: string }>`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = ${this.config.table}::regclass and contype = 'c'`.execute(this.db)
    const choices: Record<string, string[]> = {}
    for (const { def } of checks.rows) {
      const m = def.match(/\(\(?([a-z_]+)\)?(?:::text)? = ANY \(\(?ARRAY\[(.*?)\]/)
      if (m) choices[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1])
    }
    return rows.map((r) => ({
      name: r.name,
      choices: choices[r.name] ?? null,
      label: r.label ?? r.name,
      type: r.type === 'boolean' ? 'boolean' : r.type === 'ARRAY' ? 'array' : r.type === 'date' ? 'date' : ['integer', 'numeric', 'bigint'].includes(r.type) ? 'number' : r.type === 'text' ? 'textarea' : 'text',
      required: !r.nullable && !r.has_default,
      ref: r.ref_table && r.ref_table !== this.config.table ? { table: r.ref_table, column: r.ref_column } : null,
    }))
  }

  get isMaster() {
    return this.config.mode === 'master'
  }

  list(query: Record<string, string | undefined>) {
    return paginateResource(this.base(), query, this.config.resource, 't.id')
  }

  /** Lightweight list for dropdowns (active rows only for masters). */
  options() {
    let qb = this.db.selectFrom(this.config.table).select(['id', 'code', 'name'])
    qb = this.isMaster ? qb.where('is_active', '=', true).orderBy('sort_order') : qb.where('deleted_at', 'is', null)
    return qb.orderBy('name').execute()
  }

  findById(id: number) {
    return this.base().where('t.id', '=', id).executeTakeFirst()
  }

  create(data: Record<string, unknown>) {
    return this.db.insertInto(this.config.table).values(data).returningAll().executeTakeFirstOrThrow()
  }

  update(id: number, data: Record<string, unknown>) {
    let qb = this.db.updateTable(this.config.table).set({ ...data, updated_at: sql`now()` }).where('id', '=', id)
    if (!this.isMaster) qb = qb.where('deleted_at', 'is', null)
    return qb.returningAll().executeTakeFirst()
  }

  remove(id: number) {
    if (this.isMaster) return this.db.deleteFrom(this.config.table).where('id', '=', id).returning('id').executeTakeFirst()
    const col = this.config.uniqueColumn
    return this.db
      .updateTable(this.config.table)
      .set({ deleted_at: sql`now()`, [col]: sql`${sql.ref(col)} || '#deleted-' || id` })
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .returning('id')
      .executeTakeFirst()
  }
}

export class CrudService<TInput extends Record<string, unknown>> {
  constructor(protected readonly repo: CrudRepository, protected readonly label = 'Data') {}

  /** Master changes must be visible to validation / workflow immediately. */
  private touched<T>(result: T) {
    if (this.repo.isMaster) masters.invalidate()
    return result
  }

  list(query: Record<string, string | undefined>) {
    return this.repo.list(query)
  }
  schema() {
    return this.repo.schema()
  }
  options() {
    return this.repo.options()
  }
  async get(id: number) {
    return (await this.repo.findById(id)) ?? Promise.reject(notFound(this.label))
  }
  async create(input: TInput) {
    return this.touched(await this.repo.create(input))
  }
  async update(id: number, input: TInput) {
    return this.touched((await this.repo.update(id, input)) ?? (await Promise.reject(notFound(this.label))))
  }
  async remove(id: number) {
    if (!(await this.repo.remove(id))) throw notFound(this.label)
    return this.touched({ ok: true })
  }
}

export class CrudController<TInput extends Record<string, unknown>> {
  constructor(protected readonly service: CrudService<TInput>, protected readonly dto: z.ZodType<TInput>) {}

  list = async (c: Context) => c.json(await this.service.list(c.req.query()))
  options = async (c: Context) => c.json(await this.service.options())
  schema = async (c: Context) => c.json(await this.service.schema())
  get = async (c: Context) => c.json(await this.service.get(idParam(c)))
  create = async (c: Context) => c.json(await this.service.create(await bodyDto(c, this.dto)), 201)
  update = async (c: Context) => c.json(await this.service.update(idParam(c), await bodyDto(c, this.dto)))
  remove = async (c: Context) => c.json(await this.service.remove(idParam(c)))
}

/** Read for every logged-in user, write for admins only. */
export function crudRoutes(controller: CrudController<any>) {
  const admin = requirePermission('admin')
  return new Hono<Env>()
    .get('/', controller.list)
    .get('/options', controller.options)
    .get('/schema', controller.schema)
    .get('/:id', controller.get)
    .post('/', admin, controller.create)
    .put('/:id', admin, controller.update)
    .delete('/:id', admin, controller.remove)
}
