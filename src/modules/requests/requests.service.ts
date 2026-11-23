import type { Transaction } from 'kysely'
import { assertPlantAccess, can, canActOnStep, scopedPlants, type User } from '../../core/auth.ts'
import { conflict, forbidden, notFound, unprocessable } from '../../core/http.ts'
import { masters } from '../../core/masters.ts'
import type { FileService } from '../files/files.service.ts'
import type { MaterialInput } from '../materials/materials.dto.ts'
import type { MaterialRepository } from '../materials/materials.repository.ts'
import { FILE_FIELDS, type ApproveInput, type CreateRequestInput, type RejectInput, type RequestFilesInput, type RequestFilter } from './requests.dto.ts'
import type { RequestRepository } from './requests.repository.ts'

// The workflow is data (workflow_states master): ordered 'step' states, each owned by a role, then 'release'.
const first = () => {
  const s = masters.steps()[0]
  if (!s) throw unprocessable('Master workflow belum memiliki tahap approval')
  return s
}

/**
 * Material request workflow, driven by the workflow_states master.
 * Approve moves to the next step (after the last step: release). Reject moves one step back; at the first step the
 * request goes to the 'rejected' state and the requester may resubmit.
 */
export class RequestService {
  constructor(
    private readonly requests: RequestRepository,
    private readonly materials: MaterialRepository,
    private readonly files: FileService,
  ) {}

  list(user: User, f: RequestFilter, query: Record<string, string | undefined>) {
    const plants = scopedPlants(user)
    if (f.scope === 'tasks') {
      const steps = masters.steps().filter((s) => canActOnStep(user, s)).map((s) => s.step_no)
      return this.requests.list({ plants, steps, openStatuses: masters.openStatuses(), notRequestedBy: user.id }, f, query)
    }
    // Without request.view_all a user only sees their own requests.
    const requestedBy = f.scope === 'all' && can(user, 'request.view_all') ? undefined : user.id
    return this.requests.list({ plants, requestedBy }, f, query)
  }

  async detail(user: User, id: number) {
    const r = await this.requests.findById(id)
    if (!r) throw notFound('Request')
    assertPlantAccess(user, r.plant)
    if (!can(user, 'request.view_all') && r.requested_by !== user.id) throw forbidden()
    const [material, histories, files, labels] = await Promise.all([
      this.materials.findById(r.material_id),
      this.requests.findHistories(r.id),
      this.files.meta([...FILE_FIELDS.map((f) => r.data[`${f}_id`]), r.data.im_file_id]),
      this.materials.labels(r.data),
    ])
    const step = masters.stepAt(r.current_step)
    const isOpen = masters.openStatuses().includes(r.status)
    return {
      ...r,
      material,
      histories,
      files,
      labels, // names for the ids in data (supplier, manufacturer, product, line, departments)
      revision: histories.length, // send back with approve/reject

      can_approve: isOpen && canActOnStep(user, step) && r.requested_by !== user.id,
      can_resubmit: r.status === masters.terminal('rejected').code && (r.requested_by === user.id || can(user, 'admin')),
    }
  }

  /** Material data + stored uploads; keeps previous file ids when nothing new is uploaded. */
  private async withFiles(user: User, data: MaterialInput, uploads: RequestFilesInput, previous: Record<string, any> = {}) {
    assertPlantAccess(user, data.plant)
    const out: Record<string, any> = { ...data }
    for (const f of FILE_FIELDS) out[`${f}_id`] = (await this.files.save(uploads[f], user.id)) ?? previous[`${f}_id`] ?? null
    const type = masters.get('material_types', data.material_type)
    if (type?.requires_certificate && !out.certificate_file_id) throw unprocessable(`${type.name}: file sertifikat halal wajib dilampirkan`)
    return out
  }

  private history(trx: Transaction<any>, r: Record<string, any>, user: User, action: string, from: string | null, to: string, note: string | null) {
    return this.requests.withTx(trx).insertHistory({ request_id: r.id, material_id: r.material_id, action, from_status: from, to_status: to, user_id: user.id, role: user.role, note })
  }

  async create(user: User, input: CreateRequestInput, data: MaterialInput) {
    let previous: Record<string, any> = {}
    if (input.request_type === 'Change') {
      if (!input.material_id) throw unprocessable('Material wajib dipilih untuk request perubahan')
      const found = await this.materials.findById(input.material_id)
      if (!found) throw notFound('Material')
      assertPlantAccess(user, found.plant)
      previous = found
    }
    const payload = await this.withFiles(user, data, input, previous)
    const start = first()

    return this.requests.transaction(async (trx) => {
      const materials = this.materials.withTx(trx)
      const requests = this.requests.withTx(trx)
      let materialId = input.material_id!
      if (input.request_type === 'New') {
        // A new material stays inactive until released.
        materialId = await materials.insert({ ...payload, status: start.code, is_active: false, created_by: user.id })
      } else {
        await materials.lockById(materialId)
        const open = await materials.findOpenRequest(materialId)
        if (open) throw conflict(`Material ini masih memiliki request #${open.id} yang sedang diproses`)
        await materials.update(materialId, { status: start.code })
      }
      const r = await requests.insert({
        material_id: materialId,
        version: await requests.nextVersion(materialId),
        request_type: input.request_type,
        plant: payload.plant,
        data: JSON.stringify(payload),
        status: start.code,
        current_step: start.step_no,
        requested_by: user.id,
      })
      await this.history(trx, r, user, 'Submit', null, start.code, input.note)
      return { id: r.id as number }
    })
  }

  /** Locks the request, checks that `user` may act on its current step and that nothing happened since they loaded it. */
  private async lockOpen(trx: Transaction<any>, id: number, user: User, revision: number) {
    const r = await this.requests.withTx(trx).lockById(id)
    if (!r) throw notFound('Request')
    assertPlantAccess(user, r.plant)
    const step = masters.stepAt(r.current_step)
    if (!masters.openStatuses().includes(r.status) || !step) throw conflict('Request ini sudah tidak dalam proses persetujuan')
    if (!canActOnStep(user, step)) throw forbidden(`Tahap ini hanya bisa diproses oleh ${masters.name('roles', step.role_code)}`)
    // Segregation of duties: nobody approves or rejects their own request, admins included.
    if (r.requested_by === user.id) throw forbidden('Request yang Anda ajukan sendiri harus diproses oleh orang lain')
    if ((await this.requests.withTx(trx).revision(id)) !== revision) throw conflict('Request ini sudah diproses sejak halaman dibuka. Muat ulang halaman untuk melihat status terbaru.')
    return r
  }

  async approve(user: User, id: number, input: ApproveInput) {
    const imFileId = await this.files.save(input.im_file, user.id)
    return this.requests.transaction(async (trx) => {
      const r = await this.lockOpen(trx, id, user, input.revision)
      const data = { ...r.data, ...(imFileId && { im_file_id: imFileId }) }
      const nextStep = masters.nextStep(r.current_step)
      const isLast = !nextStep
      const next = nextStep?.code ?? masters.terminal('release').code

      await this.requests.withTx(trx).update(r.id, { status: next, current_step: nextStep?.step_no ?? r.current_step, data: JSON.stringify(data) })
      if (isLast) {
        // Release: the proposed data becomes the live master data.
        const { im_file_id, ...fields } = data
        await this.materials.withTx(trx).update(r.material_id, { ...fields, im_file_id: im_file_id ?? null, status: next, is_active: true })
      } else {
        await this.materials.withTx(trx).update(r.material_id, { status: next })
      }
      await this.history(trx, r, user, isLast ? 'Release' : 'Approve', r.status, next, input.note)
      return { status: next }
    })
  }

  async reject(user: User, id: number, input: RejectInput) {
    return this.requests.transaction(async (trx) => {
      const r = await this.lockOpen(trx, id, user, input.revision)
      const back = masters.prevStep(r.current_step)
      const rejected = masters.terminal('rejected').code
      const next = back?.code ?? rejected
      await this.requests.withTx(trx).update(r.id, { status: next, current_step: back?.step_no ?? first().step_no })
      // A rejected change keeps the material's released data live.
      await this.materials.withTx(trx).update(r.material_id, { status: next === rejected && r.request_type === 'Change' ? masters.terminal('release').code : next })
      await this.history(trx, r, user, 'Reject', r.status, next, input.note)
      return { status: next }
    })
  }

  async resubmit(user: User, id: number, uploads: RequestFilesInput, data: MaterialInput) {
    const current = await this.requests.findById(id)
    if (!current) throw notFound('Request')
    if (current.requested_by !== user.id && !can(user, 'admin')) throw forbidden('Hanya pembuat request yang bisa mengajukan ulang')
    const payload = await this.withFiles(user, data, uploads, current.data)
    const start = first()
    const rejected = masters.terminal('rejected').code

    return this.requests.transaction(async (trx) => {
      const r = await this.requests.withTx(trx).lockById(id)
      if (r!.status !== rejected) throw conflict('Hanya request yang ditolak yang bisa diajukan ulang')
      if (r!.request_type === 'Change') {
        const open = await this.materials.withTx(trx).findOpenRequest(r!.material_id)
        if (open) throw conflict(`Material ini sudah memiliki request #${open.id} yang sedang diproses`)
      }
      await this.requests.withTx(trx).update(id, { data: JSON.stringify(payload), plant: payload.plant, status: start.code, current_step: start.step_no })
      await this.materials.withTx(trx).update(r!.material_id, r!.request_type === 'New' ? { ...payload, status: start.code } : { status: start.code })
      await this.history(trx, r!, user, 'Resubmit', rejected, start.code, uploads.note)
      return { status: start.code }
    })
  }
}
