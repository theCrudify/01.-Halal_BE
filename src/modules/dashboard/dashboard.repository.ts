import { sql } from 'kysely'
import { BaseRepository } from '../../core/base.repository.ts'
import { masters } from '../../core/masters.ts'

export class DashboardRepository extends BaseRepository {
  private live(plants: string[]) {
    return this.db.selectFrom('materials as m').where('m.deleted_at', 'is', null).where('m.plant', 'in', plants)
  }

  materialsByStatus(plants: string[]) {
    return this.live(plants).select(['m.plant', 'm.status']).select((eb) => eb.fn.countAll<number>().as('total')).groupBy(['m.plant', 'm.status']).execute()
  }

  expiry(plants: string[]) {
    const soon = masters.number('dashboard_expiring_soon_days', 30)
    const window = masters.number('dashboard_expiring_days', 90)
    return this.live(plants)
      .where('m.is_active', '=', true)
      .select([
        sql<number>`count(*) filter (where m.expired_date < current_date)`.as('expired'),
        sql<number>`count(*) filter (where m.expired_date between current_date and current_date + ${soon}::int)`.as('expiring_30'),
        sql<number>`count(*) filter (where m.expired_date between current_date + ${soon + 1}::int and current_date + ${window}::int)`.as('expiring_90'),
      ])
      .executeTakeFirstOrThrow()
  }

  pipeline(plants: string[], openStatuses: string[]) {
    return this.db
      .selectFrom('material_requests')
      .select(['plant', 'current_step'])
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('status', 'in', openStatuses)
      .where('plant', 'in', plants)
      .groupBy(['plant', 'current_step'])
      .execute()
  }

  async countTasks(plants: string[], openStatuses: string[], steps: number[], userId: number) {
    const { total } = await this.db
      .selectFrom('material_requests')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('status', 'in', openStatuses)
      .where('plant', 'in', plants)
      .where('current_step', 'in', steps.length ? steps : [0])
      .where('requested_by', '!=', userId) // own requests are approved by someone else
      .executeTakeFirstOrThrow()
    return total
  }

  async countReleasedThisMonth(plants: string[], releaseStatus: string) {
    const { total } = await this.db
      .selectFrom('approval_histories as h')
      .innerJoin('material_requests as r', 'r.id', 'h.request_id')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('h.to_status', '=', releaseStatus)
      .where('r.plant', 'in', plants)
      .where('h.created_at', '>=', sql<string>`date_trunc('month', now())`)
      .executeTakeFirstOrThrow()
    return total
  }

  certificates() {
    const days = masters.number('certificate_expiring_days', 180)
    return this.db
      .selectFrom('certificates')
      .where('deleted_at', 'is', null)
      .select([
        sql<number>`count(*)`.as('total'),
        sql<number>`count(*) filter (where valid_until is null or valid_until >= current_date)`.as('valid'),
        sql<number>`count(*) filter (where valid_until between current_date and current_date + ${days}::int)`.as('expiring'),
      ])
      .executeTakeFirstOrThrow()
  }

  recentActivity(plants: string[], limit = 10) {
    return this.db
      .selectFrom('approval_histories as h')
      .innerJoin('material_requests as r', 'r.id', 'h.request_id')
      .innerJoin('users as u', 'u.id', 'h.user_id')
      .leftJoin('roles as ro', 'ro.code', 'h.role')
      .select(['h.id', 'h.request_id', 'h.action', 'h.to_status', 'u.name as user_name', 'ro.name as role', 'h.created_at', 'r.plant'])
      .select([sql<string>`r.data->>'material_code'`.as('material_code'), sql<string>`r.data->>'material_desc'`.as('material_desc')])
      .where('r.plant', 'in', plants)
      .orderBy('h.created_at', 'desc')
      .orderBy('h.id', 'desc')
      .limit(limit)
      .execute()
  }
}
