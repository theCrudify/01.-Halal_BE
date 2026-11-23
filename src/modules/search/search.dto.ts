import { z } from 'zod'

export const SearchDto = z.object({ q: z.string().trim().min(2, 'Minimal 2 karakter').max(100) })
export type SearchInput = z.infer<typeof SearchDto>

export type SearchHit = { id: number; title: string; subtitle: string; badge?: string | null }
export type SearchResponse = Record<'materials' | 'requests' | 'certificates' | 'manuals', SearchHit[]>
