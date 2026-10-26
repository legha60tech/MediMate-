import { useEffect, useState } from 'react'
import { useAppState } from '../state/AppState.jsx'
import { api } from '../services/api.js'
import { Badge, Card, PageHeader } from '../components/ui.jsx'

const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

export default function Settings() {
  const { state, refresh } = useAppState()
  const [form, setForm] = useState(state.settings)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState(null)
  const [simForm, setSimForm] = useState({ dispenseSeconds: 3, failNextDispense: false })
  const offline = state.source !== 'live'

  useEffect(() => { if (!dirty) setForm(state.settings) }, [state.settings, dirty])

  const set = (patch) => { setDirty(true); setForm((f) => ({ ...f, ...patch })) }

  const save = async (event) => {
    event.preventDefault()
    setMessage(null)
    try {
      await api.saveSettings({
        ...form,
        speechRate: Number(form.speechRate),
        emergencyCountdownSeconds: Number(form.emergencyCountdownSeconds),
        reminderLeadMinutes: Number(form.reminderLeadMinutes),
      })
      setDirty(false)
      setMessage({ type: 'info', text: 'Settings saved.' })
      await refresh()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const applySimulation = async () => {
    setMessage(null)
    try {
      await api.configureSimulation({ dispenseSeconds: Number(simForm.dispenseSeconds), failNextDispense: simForm.failNextDispense })
      setMessage({ type: 'info', text: 'Simulation settings applied.' })
      await refresh()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const testConnection = async () => {
    try {
      const res = await api.testConnection()
      setMessage({ type: res.ok ? 'info' : 'error', text: res.message })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const resetClock = async () => {
    try {
      await api.resetClock()
      setMessage({ type: 'info', text: 'Demo clock reset to real time.' })
      await refresh()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Device Settings" subtitle="Caretaker, reminders, simulation controls, and device information." />

      {message && (
        <div role="status" className={`rounded-xl p-3 text-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-900'}`}>{message.text}</div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900">Caretaker and reminders</h2>
          <form onSubmit={save} className="mt-4 space-y-4">
            <label className="block text-sm text-slate-700">Caretaker name
              <input className={inputClass} maxLength={80} value={form.caretakerName} onChange={(e) => set({ caretakerName: e.target.value })} />
            </label>
            <label className="block text-sm text-slate-700">Caretaker phone number
              <input className={inputClass} maxLength={24} placeholder="+country code and number" value={form.caretakerPhone} onChange={(e) => set({ caretakerPhone: e.target.value })} />
              <span className="mt-1 block text-xs text-slate-500">Stored only in your local database. Shown masked on the emergency page.</span>
            </label>
            <label className="block text-sm text-slate-700">Emergency countdown (seconds)
              <input type="number" min={3} max={60} className={inputClass} value={form.emergencyCountdownSeconds} onChange={(e) => set({ emergencyCountdownSeconds: e.target.value })} />
            </label>
            <label className="block text-sm text-slate-700">Default reminder lead time (minutes)
              <input type="number" min={0} max={60} className={inputClass} value={form.reminderLeadMinutes} onChange={(e) => set({ reminderLeadMinutes: e.target.value })} />
            </label>
            <button type="submit" className="btn-primary" disabled={!dirty || offline}>Save settings</button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Device</h2>
              <Badge tone={state.device.mode === 'simulation' ? 'amber' : 'emerald'}>{state.device.mode === 'simulation' ? 'Simulation' : 'Live'}</Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Device ID</dt><dd className="font-mono">{state.device.deviceId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Firmware</dt><dd className="font-mono">{state.device.firmware}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Connected</dt><dd>{state.device.connected ? 'Yes (simulated)' : 'No'}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              Live mode is not implemented in this prototype. The device reports itself as disconnected and refuses dispense
              commands. See docs/hardware-integration.md for the planned ESP32 integration.
            </p>
            <button type="button" className="btn-secondary mt-4" onClick={testConnection} disabled={offline}>Test connection</button>
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Simulation controls</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm text-slate-700">Simulated dispense duration (seconds)
                <input type="number" min={0.5} max={30} step={0.5} className={inputClass} value={simForm.dispenseSeconds}
                  onChange={(e) => setSimForm({ ...simForm, dispenseSeconds: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={simForm.failNextDispense}
                  onChange={(e) => setSimForm({ ...simForm, failNextDispense: e.target.checked })} />
                Inject a simulated jam on the next dispense (tests failure and retry)
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-primary" onClick={applySimulation} disabled={offline}>Apply simulation settings</button>
                <button type="button" className="btn-secondary" onClick={resetClock} disabled={offline}>Reset demo clock</button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
