import { canActOnStep, scopedPlants, type User } from '../../core/auth.ts'
import { masters } from '../../core/masters.ts'
import type { DashboardSummary } from './dashboard.dto.ts'
import type { DashboardRepository } from './dashboard.repository.ts'

export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async summary(user: User): Promise<DashboardSummary> {
    const plants = scopedPlants(user) ?? masters.all('plants').map((p) => p.code)
    const open = masters.openStatuses()
    const mySteps = masters.steps().filter((s) => canActOnStep(user, s)).map((s) => s.step_no)
    const [materials, expiry, pipeline, myTasks, releasedThisMonth, certificates, recent] = await Promise.all([
      this.repo.materialsByStatus(plants),
      this.repo.expiry(plants),
      this.repo.pipeline(plants, open),
      this.repo.countTasks(plants, open, mySteps, user.id),
      this.repo.countReleasedThisMonth(plants, masters.terminal('release').code),
      this.repo.certificates(),
      this.repo.recentActivity(plants),
    ])
    // Expiry windows (configuration) that match the dashboard thresholds, so the UI can link to the same filter.
    const soon = masters.number('dashboard_expiring_soon_days', 30)
    const upcoming = masters.number('dashboard_expiring_days', 90)
    const windows = masters.active('expiry_windows')
    const windowCodes = {
      expired: windows.find((w) => w.has_date && w.days_to != null && w.days_to < 0)?.code ?? null,
      soon: windows.find((w) => w.has_date && w.days_from === 0 && w.days_to === soon)?.code ?? null,
      upcoming: windows.find((w) => w.has_date && w.days_from === 0 && w.days_to === upcoming)?.code ?? null,
      valid: windows.find((w) => w.include_non_expiring)?.code ?? null,
      certificates: windows.find((w) => w.has_date && w.days_from === 0 && w.days_to === masters.number('certificate_expiring_days', 180))?.code ?? null,
    }
    return { materials, expiry, pipeline, myTasks, releasedThisMonth, certificates, recent, windowCodes, thresholds: { soon, upcoming } }
  }
}
