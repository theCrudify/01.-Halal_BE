// Response shape of GET /api/dashboard.
export type DashboardSummary = {
  materials: { plant: string; status: string; total: number }[]
  expiry: { expired: number; expiring_30: number; expiring_90: number }
  pipeline: { plant: string; current_step: number; total: number }[]
  myTasks: number
  releasedThisMonth: number
  certificates: { total: number; valid: number; expiring: number }
  recent: Record<string, unknown>[]
  windowCodes: Record<'expired' | 'soon' | 'upcoming' | 'valid' | 'certificates', string | null>
  thresholds: { soon: number; upcoming: number }
}
