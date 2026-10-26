import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Siren, XCircle, AlertTriangle } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import { api } from '../services/api.js'
import { Badge, Card, PageHeader } from '../components/ui.jsx'
import { formatDateTime } from '../utils/time.js'

const STATUS_TONE = { awaiting_confirmation: 'amber', simulated_completed: 'blue', cancelled: 'slate', failed: 'rose' }

export default function Emergency() {
  const { state } = useAppState()
  const [events, setEvents] = useState([])
  const [message, setMessage] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [busy, setBusy] = useState(false)
  const confirmingRef = useRef(false)
  const configured = Boolean(state.settings.caretakerPhone)
  const active = events.find((e) => e.status === 'awaiting_confirmation')

  const load = useCallback(async () => {
    try {
      setEvents(await api.emergencyEvents())
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Countdown: starts when a new waiting event appears. Cancel stops it. Zero triggers the simulated workflow.
  useEffect(() => {
    if (!active) { setRemaining(null); return }
    setRemaining(state.settings.emergencyCountdownSeconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  const confirmNow = useCallback(async (id) => {
    if (confirmingRef.current) return
    confirmingRef.current = true
    try {
      const ev = await api.confirmEmergency(id)
      setMessage({ type: 'info', text: ev.note })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      confirmingRef.current = false
      setRemaining(null)
      load()
    }
  }, [load])

  useEffect(() => {
    if (!active || remaining === null) return undefined
    if (remaining <= 0) { confirmNow(active.id); return undefined }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining, active, confirmNow])

  const start = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await api.createEmergency('button')
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setRemaining(null)
    try {
      const ev = await api.cancelEmergency(active.id)
      setMessage({ type: 'info', text: ev.note })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
    load()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Emergency Caretaker" subtitle="Simulated workflow for the expo. No real call or message is ever sent." />

      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          This prototype does not call anyone. A real device would need an authorised calling module (for example, a GSM/LTE
          modem or a licensed communication service). In an emergency, contact local emergency services directly.
        </p>
      </div>

      {message && (
        <div role="status" className={`rounded-xl p-3 text-sm ${message.type === 'error' ? 'bg-rose-100 text-rose-900' : 'bg-sky-50 text-sky-900'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {!configured && (
            <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              No caretaker is set up yet. <Link className="font-semibold underline" to="/settings">Add a caretaker in Device Settings</Link>.
            </div>
          )}

          {active ? (
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Simulated workflow waiting for confirmation</p>
              <p className="mt-3 font-mono text-6xl font-bold tabular-nums text-slate-900">{remaining ?? 0}</p>
              <p className="mt-2 text-sm text-slate-600">
                Simulated notification to <strong>{active.caretakerName}</strong> ({active.caretakerPhoneMasked}) in{' '}
                {remaining ?? 0} seconds unless cancelled.
              </p>
              <p className="mt-1 text-xs text-slate-500">Source: {active.source === 'voice' ? 'voice command' : 'emergency button'}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button type="button" className="btn-secondary" onClick={cancel}><XCircle className="h-4 w-4" aria-hidden="true" /> Cancel</button>
                <button type="button" className="btn-danger" onClick={() => confirmNow(active.id)}>Run simulation now</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <button
                type="button"
                onClick={start}
                disabled={busy || !configured || state.source !== 'live'}
                className="inline-flex h-32 w-32 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition hover:bg-rose-700 disabled:bg-slate-300"
                aria-label="Start simulated emergency workflow"
              >
                <Siren className="h-12 w-12" />
              </button>
              <p className="text-sm text-slate-600">Press to start the simulated workflow. You get a countdown and can cancel it.</p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">Caretaker</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{state.settings.caretakerName || 'Not set'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Phone</dt><dd className="font-mono text-slate-900">{configured ? 'Set (hidden)' : 'Not set'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Countdown</dt><dd className="text-slate-900">{state.settings.emergencyCountdownSeconds} s</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">Voice command “Emergency call” opens this workflow after a confirmation step.</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">Emergency event history</h2>
        {events.length === 0 && <p className="mt-3 text-sm text-slate-500">No emergency events yet.</p>}
        <ul className="mt-4 divide-y divide-slate-100">
          {events.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-slate-900">{e.note}</p>
                <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)} · {e.source === 'voice' ? 'Voice' : 'Button'} · {e.caretakerName}</p>
              </div>
              <Badge tone={STATUS_TONE[e.status] ?? 'slate'}>{e.status.replace(/_/g, ' ')}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
