# SJH Halal — Backend (Hono + Kysely + Neon Postgres)

API for the Sistem Jaminan Produk Halal: master list halal (bahan), request & approval workflow,
halal certificates, Manual SJPH, periodic reports, and master data.

## Quick start

```bash
cp .env.example .env          # fill DATABASE_URL (Neon) and JWT_SECRET
npm install
npm run db:migrate            # creates tables (idempotent, safe on every deploy)
npm run db:seed               # WIPES and loads demo data (refuses when NODE_ENV=production unless --force)
npm run dev                   # http://localhost:4000
npm test                      # integration tests (need a seeded DB)
```

Demo login: NIK `admin` (Admin), or `10001` Halal Team, `10003` Penyelia Halal, `10004` Koordinator Penyelia,
`10005` Quality Assurance, `10006` User (Sukabumi), `200xx` Kejayan, `30001` HCD. Password for all: `Halal@2026`.

### Neon
1. Create a project at neon.tech (free tier), copy the **pooled** connection string.
2. Put it in `DATABASE_URL` (keep `?sslmode=require`).
3. `npm run db:migrate && npm run db:seed`.

Attachments are stored in Postgres (`files` table, max 5 MB each) because free hosts have no persistent disk.

### Deploy (free)
Render / Railway / Koyeb as a Node web service: build `npm ci`, start `npm run db:migrate && npm start`,
env `DATABASE_URL`, `JWT_SECRET` (long random), `CORS_ORIGIN` (frontend URL), `NODE_ENV=production`.

## Structure (OOP, one folder per API)

```
src/
  core/                 shared building blocks
    database.ts         Kysely + pg pool (Neon)
    auth.ts             JWT, password hashing (scrypt), requireAuth / requireRole, plant scope
    http.ts             HTTP errors, body parsing
    dto.ts              zod field builders used by all DTOs
    list.ts             pagination / sorting / search (one contract for every list)
    base.repository.ts  BaseRepository (withTx, transaction)
    crud.ts             CrudRepository / CrudService / CrudController / crudRoutes for simple master tables
  modules/<name>/
    <name>.dto.ts         zod schemas + types (input validation, filters)
    <name>.repository.ts  all SQL for the module
    <name>.service.ts     business rules, transactions, authorization by data
    <name>.controller.ts  HTTP in/out only
    <name>.routes.ts      wiring (repository -> service -> controller) + role guards
  domain.ts             constants: roles, plants, steps, categories, SJPH criteria (copied to the FE)
  migrate.ts, seed.ts, app.ts, index.ts
```

Modules: `auth, users, departments, countries, suppliers, lines, products, materials, requests, certificates,
manuals, reports, dashboard, files, meta` (`meta` serves static constants, so it has no repository).

## Everything configurable lives in the database

| What | Table(s) | Admin page |
|---|---|---|
| Business options (site, plant, category, material type, halal body, LPH, SJPH criteria, report type) | one master table each | `/admin/<table>` |
| Halal rules | flags: `material_types.requires_certificate`, `halal_bodies.requires_expiry`, `halal_bodies.requires_registration` | same |
| Approval workflow (number of steps, order, owner role, labels, colours) | `workflow_states` (`kind` step / release / rejected) | `/admin/workflow_states` |
| Roles & permissions | `roles.permissions` (capability keys listed in `core/masters.ts → PERMISSIONS`) | `/admin/roles` |
| List columns, sort columns, filters, search columns, default sort, page size | `list_resources`, `list_fields` | `/admin/list_resources`, `/admin/list_fields` |
| Expiry filter windows (expired / ≤30 / ≤90 / valid …) | `expiry_windows` | `/admin/expiry_windows` |
| Numeric / text rules (upload size & types, dashboard thresholds, search words, max page size, task order) | `settings` | `/admin/settings` |
| Navigation (groups, order, icons, permission, badges) | `menus` | `/admin/menus` |

Relations: materials → suppliers / manufacturers (→ countries) / products / lines (FK ids), distribution → `material_distributions`,
certificate scope → `certificate_products`, report auditee → departments, every `created_by` / requester / approver → users.
Master codes are FKs with `ON UPDATE CASCADE`; a row still referenced cannot be deleted (409) — deactivate it (`is_active`).
Admin forms are generated from the schema: `GET /api/<resource>/schema` (types, required, FK targets, CHECK choices,
column comments as labels).

Code keeps only what must be code: authorization (site scoping, permission keys), the workflow state machine (`kind`),
and the API contract.

## List contract (all list endpoints)

`GET /api/<resource>?page=&pageSize=&search=&sortBy=&sortDir=&<filter keys from list_fields>`

```json
{ "data": [...], "meta": { "page": 1, "pageSize": 25, "total": 129, "totalPages": 6, "search": "", "sortBy": "material_code", "sortDir": "asc" } }
```

- Search: every word must match one of `list_resources.search_refs`; while searching, results rank by relevance (trigram).
  Materials and certificates use a trigger-maintained `search_text` (includes supplier / manufacturer / product names) with a GIN trigram index.
- Sort keys / filter keys: `list_fields`. Unknown keys are ignored. Ties break by id; nulls last.
- Filter types: `master` (code), `relation` (id), `site`, `expiry` (expiry_windows code), `values` (`value:Label|…`), `year`. `__none` = empty (when `null_label` is set).
