// Small date/time helpers used across the dashboard.
// All scheduling uses the browser's local time; stored timestamps are ISO (UTC) strings.

export const pad = (n) => String(n).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD (used to group doses by day). */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A Date for "HH:MM" on the day `dayOffset` days away from `base`. */
export function dateAtTime(dayOffset, hhmm, base = new Date()) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}

export const formatTime = (date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const formatDateLong = (date) =>
  date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Countdown text such as "1h 05m 09s" or "4m 12s". */
export function formatCountdown(ms) {
  if (ms <= 0) return 'Due now'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`
}

/** "12s ago" or "3 min ago". */
export function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  return `${Math.round(s / 60)} min ago`
}

export function greeting(date) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
