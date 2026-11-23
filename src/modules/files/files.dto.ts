// Fallbacks only: the live values are settings file_allowed_types / file_max_mb (database).
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg']
export const MAX_FILE_BYTES = 5 * 1024 * 1024

export type FileMeta = { id: number; name: string; size: number }
