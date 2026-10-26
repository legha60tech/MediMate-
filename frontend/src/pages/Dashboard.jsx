import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import { ArrowRight, CalendarClock, CheckCircle2, AlertTriangle, Activity, Cpu, Clock, Timer, Siren } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import useNow from '../hooks/useNow.js'
import { Badge, Card, PageHeader, StatCard } from '../components/ui.jsx'
import {
  computeDashboardMetrics,
  findNextDose,
  buildWeeklySeries,
  getMedicine,
  getDisplayStatus,
  OVERDUE_GRACE_MS,
} from '../utils/metrics.js'
import { dayKey } from '../utils/time.js'
import { formatAgo, formatCountdown, formatDateLong, formatDateTime, formatTime, greeting } from '../utils/time.js'

function NextDoseCard({ next, medicine, countdownMs }) {
  if (!next) {
    return (
      <Card className="xl:col-span-2">
        <h2 className="font-semibold text-slate-900">Next scheduled medicine</h2>
        <p className="mt-2 text-sm text-slate-500">No upcoming doses are scheduled in the current demo window.</p>
      </Card>
    )
  }
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-teal-800 p-6 text-white shadow-md xl:col-span-2">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-100">Next scheduled medicine</p>
          <h2 className="mt-1 truncate text-2xl font-bold">{medicine?.name ?? 'Unknown medicine'}</h2>
          <p className="mt-1 text-sm text-brand-100">
            Compartment {medicine?.compartment ?? '-'} · {formatTime(new Date(next.scheduledAt))} ·{' '}
            {formatDateTime(next.scheduledAt)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-brand-50">{medicine?.instructions}</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-white/15 px-6 py-4 text-center backdrop-blur">
          <p className="text-xs uppercase tracking-wider text-brand-100">Time until dose</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{formatCountdown(countdownMs)}</p>
        </div>
      </div>
      <Link
        to="/dispenser"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
      >
        Open live dispenser <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

function DeviceCard({ device, now }) {
  const ago = formatAgo(now.getTime() - new Date(device.lastHeartbeat).getTime())
  const isSim = device.mode === 'simulation'
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Device status</h2>
        <Badge tone={isSim ? 'amber' : 'emerald'}>{isSim ? 'Simulated' : 'Live'}</Badge>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Link</dt>
          <dd className="font-medium text-slate-900">{device.connected ? 'Online (simulated)' : 'Disconnected'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Last heartbeat</dt>
          <dd className="font-medium text-slate-900">{ago}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Device ID</dt>
          <dd className="font-mono text-slate-900">{device.deviceId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Firmware</dt>
          <dd className="font-mono text-slate-900">{device.firmware}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {isSim
          ? 'No physical dispenser is connected. Status values come from the built-in simulator.'
          : 'Connection verified by heartbeat from the device.'}
      </p>
    </Card>
  )
}

const COMPARTMENT_TONE = { ready: 'emerald', low: 'amber', empty: 'slate', fault: 'rose' }

function CompartmentsCard({ compartments, medicines }) {
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Compartments</h2>
      <ul className="mt-4 divide-y divide-slate-100">
        {compartments.map((c) => {
          const med = getMedicine(medicines, c.medicineId)
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Compartment {c.id}</p>
                <p className="truncate text-xs text-slate-500">{med ? med.name : 'Not assigned'}</p>
              </div>
              <Badge tone={COMPARTMENT_TONE[c.status] ?? 'slate'}>{c.status}</Badge>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const EVENT_ICON = { medicine: CheckCircle2, emergency: Siren, device: Cpu }

function EventsCard({ events }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Recent events</h2>
      </div>
      <ul className="mt-4 space-y-3">
        {events.slice(0, 6).map((e) => {
          const Icon = EVENT_ICON[e.kind] ?? Activity
          return (
            <li key={e.id} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{e.message}</p>
                <p className="text-xs text-slate-500">{formatDateTime(e.at)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default function Dashboard() {
  const { state } = useAppState()
  const now = useNow()

  const metrics = useMemo(() => computeDashboardMetrics(state.doses, now), [state.doses, now])
  const next = useMemo(() => findNextDose(state.doses, now), [state.doses, now])
  const weekly = useMemo(() => buildWeeklySeries(state.doses, now), [state.doses, now])
  const nextMedicine = next ? getMedicine(state.medicines, next.medicineId) : null
  const countdownMs = next ? new Date(next.scheduledAt).getTime() - now.getTime() : 0

  return (
    <div className="space-y-6">
      <PageHeader title={greeting(now)} subtitle={`${formatDateLong(now)} · ${formatTime(now)}`}>
        <Badge tone={state.source === 'live' ? 'teal' : 'amber'}>{state.source === 'live' ? 'Connected to backend' : 'Offline demo data'}</Badge>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        <NextDoseCard next={next} medicine={nextMedicine} countdownMs={countdownMs} />
        <DeviceCard device={state.device} now={now} />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Doses today" value={metrics.total} hint={`${metrics.upcoming} still upcoming`} icon={CalendarClock} tone="blue" />
        <StatCard label="Confirmed taken" value={metrics.taken} hint="Recorded in dose history" icon={CheckCircle2} tone="emerald" />
        <StatCard
          label="Missed or overdue"
          value={metrics.missed + metrics.overdue}
          hint={metrics.overdue > 0 ? `${metrics.overdue} awaiting outcome` : 'None outstanding'}
          icon={AlertTriangle}
          tone="rose"
        />
        <StatCard
          label="Adherence (7 days)"
          value={metrics.adherence === null ? '—' : `${metrics.adherence}%`}
          hint={metrics.adherence === null ? 'No due doses yet' : `${metrics.weekTaken} taken of ${metrics.weekTaken + metrics.weekFailed} due`}
          icon={Timer}
          tone="teal"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Last 7 days</h2>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend />
                <Bar dataKey="taken" name="Taken" fill="#0d9488" radius={[6, 6, 0, 0]} />
                <Bar dataKey="missed" name="Missed" fill="#e11d48" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <CompartmentsCard compartments={state.device.compartments} medicines={state.medicines} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <EventsCard events={state.events} />
        <Card className="xl:col-span-2">
          <h2 className="font-semibold text-slate-900">Today at a glance</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Dose outcomes are derived from recorded dose records, so counts update automatically when a dose is taken,
            missed, or overdue. A dose is marked overdue after a {Math.round(OVERDUE_GRACE_MS / 60000)}-minute grace period with no recorded outcome.
            Motor activation is never treated as proof that medicine was dispensed or taken.
          </p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {state.doses
              .filter((d) => dayKey(new Date(d.scheduledAt)) === dayKey(now))
              .map((d) => {
                const med = getMedicine(state.medicines, d.medicineId)
                const s = getDisplayStatus(d, now)
                const tone = { taken: 'emerald', scheduled: 'blue', missed: 'rose', overdue: 'amber' }[s] ?? 'slate'
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="truncate text-slate-700">
                        {formatTime(new Date(d.scheduledAt))} · {med?.name}
                      </span>
                    </span>
                    <Badge tone={tone}>{s}</Badge>
                  </li>
                )
              })}
          </ul>
        </Card>
      </div>
    </div>
  )
}
