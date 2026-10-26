// Pure functions that turn dose records into dashboard numbers. Nothing is hardcoded.
import { dayKey } from './time.js'

export const OVERDUE_GRACE_MS = 30 * 60 * 1000

/** Display status: a scheduled dose past the grace period is shown as overdue (the backend also records it as missed). */
export function getDisplayStatus(dose, now) {
  if (dose.status === 'scheduled' && new Date(dose.scheduledAt).getTime() < now.getTime() - OVERDUE_GRACE_MS) {
    return 'overdue'
  }
  return dose.status
}

export function computeDashboardMetrics(doses, now) {
  const today = dayKey(now)
  const todays = doses.filter((d) => dayKey(new Date(d.scheduledAt)) === today)

  const counts = { taken: 0, missed: 0, overdue: 0, upcoming: 0, attention: 0 }
  todays.forEach((d) => {
    const s = getDisplayStatus(d, now)
    if (s === 'taken') counts.taken++
    else if (s === 'missed') counts.missed++
    else if (s === 'overdue') counts.overdue++
    else if (s === 'failed') counts.attention++
    else counts.upcoming++
  })

  const weekStart = now.getTime() - 7 * 24 * 3600 * 1000
  const due = doses.filter((d) => {
    const t = new Date(d.scheduledAt).getTime()
    return t >= weekStart && t <= now.getTime()
  })
  const weekTaken = due.filter((d) => getDisplayStatus(d, now) === 'taken').length
  const weekFailed = due.filter((d) => ['missed', 'overdue'].includes(getDisplayStatus(d, now))).length
  const adherence = weekTaken + weekFailed === 0 ? null : Math.round((weekTaken / (weekTaken + weekFailed)) * 100)

  return { total: todays.length, ...counts, adherence, weekTaken, weekFailed }
}

export function findNextDose(doses, now) {
  return (
    doses
      .filter((d) => d.status === 'scheduled' && new Date(d.scheduledAt).getTime() >= now.getTime())
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null
  )
}

export function buildWeeklySeries(doses, now) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { weekday: 'short' }), taken: 0, missed: 0 })
  }
  const index = Object.fromEntries(days.map((d, i) => [d.key, i]))
  doses.forEach((dose) => {
    const i = index[dayKey(new Date(dose.scheduledAt))]
    if (i === undefined) return
    const s = getDisplayStatus(dose, now)
    if (s === 'taken') days[i].taken++
    else if (s === 'missed' || s === 'overdue') days[i].missed++
  })
  return days
}

export const getMedicine = (medicines, id) => medicines.find((m) => m.id === id) ?? null
