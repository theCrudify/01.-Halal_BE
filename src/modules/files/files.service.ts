import { can, scopedPlants, type User } from '../../core/auth.ts'
import { forbidden, notFound, unprocessable } from '../../core/http.ts'
import { masters } from '../../core/masters.ts'
import { ALLOWED_MIME, MAX_FILE_BYTES } from './files.dto.ts'
import type { FileRepository } from './files.repository.ts'

// Files are stored in Postgres (bytea) because free hosts have no persistent disk.
export class FileService {
  constructor(private readonly repo: FileRepository) {}

  /** Stores an upload and returns its id, or null when the field is empty. */
  async save(value: unknown, createdBy: number, required = false): Promise<number | null> {
    if (!(value instanceof File) || value.size === 0) {
      if (required) throw unprocessable('File wajib diunggah')
      return null
    }
    // Allowed types and size are settings (database); the constants are fallbacks only.
    const allowed = masters.list('file_allowed_types', ALLOWED_MIME)
    const maxMb = masters.number('file_max_mb', MAX_FILE_BYTES / 1024 / 1024)
    if (!allowed.includes(value.type)) throw unprocessable(`Tipe file tidak diizinkan (${allowed.join(', ')})`)
    if (value.size > maxMb * 1024 * 1024) throw unprocessable(`Ukuran file maksimal ${maxMb} MB`)
    return this.repo.insert({ name: value.name.slice(0, 255), mime: value.type, size: value.size, data: Buffer.from(await value.arrayBuffer()), created_by: createdBy })
  }

  meta(ids: (number | null | undefined)[]) {
    return this.repo.findMeta(ids.filter((id): id is number => !!id))
  }

  /** A file is readable only through a record the user may see (same rules as that record's detail endpoint). */
  async download(id: number, user: User) {
    const allowed =
      can(user, 'admin') ||
      (await this.repo.isAccessible(id, {
        userId: user.id,
        plants: scopedPlants(user),
        viewAllRequests: can(user, 'request.view_all'),
        viewAllManuals: can(user, 'manual.view_all'),
        departmentId: user.department_id,
      }))
    if (!allowed) throw forbidden('Anda tidak memiliki akses ke dokumen ini')
    return (await this.repo.findById(id)) ?? Promise.reject(notFound('File'))
  }
}
