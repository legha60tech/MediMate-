import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Square, CheckCircle2, FastForward, Box } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import useNow from '../hooks/useNow.js'
import { api } from '../services/api.js'
import { Badge, Card, PageHeader } from '../components/ui.jsx'
import { getMedicine } from '../utils/metrics.js'
import { dayKey, formatTime } from '../utils/time.js'

const STATUS_TONE = {
  scheduled: 'blue', dispensing_requested: 'amber', dispensing_completed: 'amber',
  awaiting_confirmation: 'amber', taken: 'emerald', missed: 'rose', failed: 'rose',
}

const clamp = (v) => Math.min(1, Math.max(0, v))

export default function Dispenser() {
  const { state, refresh } = useAppState()
  const now = useNow(500)
  const [message, setMessage] = useState(null)
  const [busyKey, setBusyKey] = useState(null)
  const [checked, setChecked] = useState({})
  const offline = state.source !== 'live'
  const active = state.device.activeCommand
  const today = dayKey(now)
  const todays = state.doses.filter((d) => dayKey(new Date(d.scheduledAt)) === today)

  let progress = 0
  if (active?.startedAt && active?.completesAt) {
    const start = new Date(active.startedAt).getTime()
    const end = new Date(active.completesAt).getTime()
    progress = clamp((now.getTime() - start) / Math.max(end - start, 1))
  }
  const activeDose = active ? state.doses.find((d) => d.id === active.doseId) : null
  const activeMed = activeDose ? getMedicine(state.medicines, activeDose.medicineId) : null

  const run = async (key, action, onSuccess) => {
    setBusyKey(key)
    setMessage(null)
    try {
      const result = await action()
      setMessage({ type: 'info', text: onSuccess(result) })
      await refresh()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setBusyKey(null)
    }
  }

  const dispense = (dose) =>
    run(dose.id, () => api.dispense(dose.id), (res) => {
      if (res.alreadyInProgress) return 'A dispense is already running for this dose. No second dispense was started.'
      if (res.command.status === 'failed') return `Dispense failed: ${res.command.failureReason} You can retry.`
      return 'Dispensing started. The device reports completion, and the dose is recorded as taken only after you confirm.'
    })

  const stop = () => run('stop', () => api.stopDispense(active.commandId), () => 'Dispense stopped. No dose was recorded as taken.')

  const confirm = (dose) =>
    run(dose.id, () => api.confirmDose(dose.id), () => 'Recorded as taken.')

  const advance = () =>
    run('advance', () => api.advanceToNextDose(), (res) => `Demo clock moved to ${formatTime(new Date(res.advancedTo))}. The next dose is now due.`)

  return (
    <div className="space-y-6">
      <PageHeader title="Live Dispenser" subtitle="Simulated dispensing with the dose state machine. Motor activation is never treated as proof that medicine was taken.">
        <button type="button" className="btn-secondary" onClick={advance} disabled={offline || busyKey === 'advance'}>
          <FastForward className="h-4 w-4" aria-hidden="true" /> Demo: jump to next dose
        </button>
        <Link to="/model" className="btn-secondary"><Box className="h-4 w-4" aria-hidden="true" /> View 3D model</Link>
      </PageHeader>

      {message && (
        <div role="status" className={`rounded-xl p-3 text-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-900'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="font-semibold text-slate-900">Compartments</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {state.device.compartments.map((c) => {
              const med = getMedicine(state.medicines, c.medicineId)
              const highlighted = active?.compartment === c.id
              return (
                <div key={c.id}
                  className={`rounded-xl border p-3 transition ${highlighted ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-300' : 'border-slate-200 bg-white'}`}>
                  <p className="text-xs font-semibold uppercase text-slate-500">Compartment {c.id}</p>
                  <p className="mt-1 truncate text-sm font-medium text-slate-900">{med?.name ?? 'Not assigned'}</p>
                  <div className="mt-2"><Badge tone={c.status === 'ready' ? 'emerald' : c.status === 'low' ? 'amber' : 'slate'}>{c.status}</Badge></div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-800">Dispensing mechanism</span>
              <span className="text-slate-500">
                {active ? `Running · compartment ${active.compartment}${activeMed ? ` · ${activeMed.name}` : ''}` : 'Idle'}
              </span>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar"
              aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${active ? progress * 100 : 0}%` }} />
            </div>
            {active && (
              <button type="button" className="btn-danger mt-4" onClick={stop} disabled={busyKey === 'stop' || offline}>
                <Square className="h-4 w-4" aria-hidden="true" /> Stop dispensing
              </button>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">Safety rules in this prototype</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Dispensing opens 60 minutes before a dose and closes after the 30-minute grace period.</li>
            <li>The server chooses the compartment. The browser can only name a dose.</li>
            <li>A running dispense is never started twice.</li>
            <li>A dose becomes taken only when you confirm it.</li>
            <li>Missed doses are recorded automatically.</li>
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Today&apos;s doses</h2>
        {todays.length === 0 && <p className="mt-3 text-sm text-slate-500">No doses are scheduled for today.</p>}
        <ul className="mt-4 divide-y divide-slate-100">
          {todays.map((d) => {
            const med = getMedicine(state.medicines, d.medicineId)
            const canDispense = d.status === 'scheduled' || d.status === 'failed'
            const canConfirm = d.status === 'awaiting_confirmation' || d.status === 'dispensing_completed'
            return (
              <li key={d.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {formatTime(new Date(d.scheduledAt))} · {med?.name ?? d.medicineName ?? 'Medicine'}
                    {d.isDue && <span className="ml-2 text-xs font-semibold text-amber-700">DUE NOW</span>}
                  </p>
                  <p className="text-xs text-slate-500">Compartment {med?.compartment ?? d.compartment ?? '-'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[d.status] ?? 'slate'}>{d.status.replace(/_/g, ' ')}</Badge>
                  {canDispense && (
                    <button type="button" className="btn-primary" onClick={() => dispense(d)} disabled={offline || busyKey === d.id}>
                      <Play className="h-4 w-4" aria-hidden="true" /> {d.status === 'failed' ? 'Retry dispense' : 'Dispense'}
                    </button>
                  )}
                  {canConfirm && (
                    <>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" className="h-4 w-4" checked={!!checked[d.id]}
                          onChange={(e) => setChecked({ ...checked, [d.id]: e.target.checked })} />
                        I confirm I took this medicine
                      </label>
                      <button type="button" className="btn-primary" disabled={!checked[d.id] || busyKey === d.id || offline}
                        onClick={() => confirm(d)}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Confirm taken
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
