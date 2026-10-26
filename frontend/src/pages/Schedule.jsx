import { useState } from 'react'
import { Pencil, Plus, Trash2, X, AlertCircle } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import { api } from '../services/api.js'
import { Badge, Card, PageHeader } from '../components/ui.jsx'
import { dayKey } from '../utils/time.js'

const FREQUENCIES = ['Daily', 'Twice daily', 'Three times daily', 'Custom times']
const MAX_TIMES = 8

const emptyForm = () => ({
  name: '', identifier: '', instructions: '', frequency: 'Daily',
  startDate: dayKey(new Date()), endDate: '', times: ['08:00'],
  compartment: 1, reminderEnabled: true, reminderLeadMinutes: 5, active: true,
})

function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Medicine name is required.'
  else if (form.name.trim().length > 80) errors.name = 'Name must be 80 characters or fewer.'
  if (form.identifier.length > 40) errors.identifier = 'Identifier must be 40 characters or fewer.'
  if (form.instructions.length > 500) errors.instructions = 'Instructions must be 500 characters or fewer.'
  if (!form.startDate) errors.startDate = 'Start date is required.'
  if (form.endDate && form.startDate && form.endDate < form.startDate) errors.endDate = 'End date cannot be before the start date.'
  if (form.times.some((t) => !t)) errors.times = 'Fill in every time, or remove empty rows.'
  else if (form.times.length === 0) errors.times = 'Add at least one scheduled time.'
  else if (new Set(form.times).size !== form.times.length) errors.times = 'Each scheduled time must be different.'
  if (![1, 2, 3, 4].includes(Number(form.compartment))) errors.compartment = 'Choose compartment 1 to 4.'
  const lead = Number(form.reminderLeadMinutes)
  if (!Number.isInteger(lead) || lead < 0 || lead > 60) errors.reminderLeadMinutes = 'Reminder lead time must be 0 to 60 minutes.'
  return errors
}

function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  )
}

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'

export default function Schedule() {
  const { state, refresh } = useAppState()
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const offline = state.source !== 'live'

  const update = (patch) => setForm((f) => ({ ...f, ...patch }))

  const openNew = () => {
    setForm(emptyForm()); setEditingId(null); setErrors({}); setMessage(null); setShowForm(true)
  }
  const openEdit = (m) => {
    setForm({
      name: m.name, identifier: m.identifier ?? '', instructions: m.instructions ?? '', frequency: m.frequency,
      startDate: m.startDate, endDate: m.endDate ?? '', times: [...m.times], compartment: m.compartment,
      reminderEnabled: m.reminderEnabled, reminderLeadMinutes: m.reminderLeadMinutes, active: m.active,
    })
    setEditingId(m.id); setErrors({}); setMessage(null); setShowForm(true)
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return
    const payload = {
      name: form.name.trim(),
      identifier: form.identifier.trim() || null,
      instructions: form.instructions.trim(),
      frequency: form.frequency,
      startDate: form.startDate,
      endDate: form.endDate || null,
      times: form.times,
      compartment: Number(form.compartment),
      reminderEnabled: form.reminderEnabled,
      reminderLeadMinutes: Number(form.reminderLeadMinutes),
      active: form.active,
    }
    setBusy(true)
    try {
      if (editingId) await api.updateMedicine(editingId, payload)
      else await api.createMedicine(payload)
      setMessage({ type: 'success', text: editingId ? 'Medicine schedule updated.' : 'Medicine schedule created.' })
      setShowForm(false)
      await refresh()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (medicine) => {
    if (!window.confirm(`Delete "${medicine.name}"? Future scheduled doses will be removed. Past history is kept.`)) return
    try {
      await api.deleteMedicine(medicine.id)
      setMessage({ type: 'success', text: 'Medicine deleted. Its history was kept.' })
      await refresh()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const setTime = (index, value) => update({ times: form.times.map((t, i) => (i === index ? value : t)) })
  const removeTime = (index) => update({ times: form.times.filter((_, i) => i !== index) })

  return (
    <div className="space-y-6">
      <PageHeader title="Medicine Schedule" subtitle="Create and edit schedules. Changes are saved to the SQLite database through the backend.">
        <button type="button" className="btn-primary" onClick={openNew} disabled={offline}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add medicine
        </button>
      </PageHeader>

      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm text-amber-900">
          Enter instructions exactly as printed on the prescription. MediMate does not recommend doses or treatment.
          Medicine names marked <strong>Demo</strong> are placeholders.
        </p>
      </Card>

      {offline && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4" aria-hidden="true" /> The backend is not reachable, so changes are disabled.
        </div>
      )}
      {message && (
        <div role="status" className={`rounded-xl p-3 text-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {message.text}
        </div>
      )}

      {showForm && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{editingId ? 'Edit medicine' : 'New medicine'}</h2>
            <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" onClick={() => setShowForm(false)} aria-label="Close form">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={submit} className="mt-5 grid gap-5 md:grid-cols-2" noValidate>
            <Field label="Medicine name *" error={errors.name}>
              <input className={inputClass} value={form.name} onChange={(e) => update({ name: e.target.value })} maxLength={90} />
            </Field>
            <Field label="Identifier (optional)" error={errors.identifier}>
              <input className={inputClass} value={form.identifier} onChange={(e) => update({ identifier: e.target.value })} maxLength={50} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Dosage instructions (as printed on the prescription)" error={errors.instructions}>
                <textarea className={inputClass} rows={3} value={form.instructions} onChange={(e) => update({ instructions: e.target.value })} />
              </Field>
            </div>
            <Field label="Frequency">
              <select className={inputClass} value={form.frequency} onChange={(e) => update({ frequency: e.target.value })}>
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Assigned compartment *" error={errors.compartment}>
              <select className={inputClass} value={form.compartment} onChange={(e) => update({ compartment: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((c) => <option key={c} value={c}>Compartment {c}</option>)}
              </select>
            </Field>
            <Field label="Start date *" error={errors.startDate}>
              <input type="date" className={inputClass} value={form.startDate} onChange={(e) => update({ startDate: e.target.value })} />
            </Field>
            <Field label="End date (optional)" error={errors.endDate}>
              <input type="date" className={inputClass} value={form.endDate} onChange={(e) => update({ endDate: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Scheduled times *</span>
              <div className="mt-2 space-y-2">
                {form.times.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="time" className={inputClass} value={t} onChange={(e) => setTime(i, e.target.value)} aria-label={`Scheduled time ${i + 1}`} />
                    <button type="button" className="btn-secondary px-3" onClick={() => removeTime(i)} disabled={form.times.length === 1} aria-label="Remove time">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {errors.times && <span className="mt-1 block text-xs font-medium text-rose-600">{errors.times}</span>}
              <button type="button" className="btn-secondary mt-3" disabled={form.times.length >= MAX_TIMES}
                onClick={() => update({ times: [...form.times, '12:00'] })}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add time
              </button>
            </div>
            <Field label="Reminder lead time (minutes)" error={errors.reminderLeadMinutes}>
              <input type="number" min={0} max={60} className={inputClass} value={form.reminderLeadMinutes}
                onChange={(e) => update({ reminderLeadMinutes: e.target.value })} />
            </Field>
            <div className="flex flex-col justify-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded" checked={form.reminderEnabled} onChange={(e) => update({ reminderEnabled: e.target.checked })} />
                Voice and on-screen reminders enabled
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded" checked={form.active} onChange={(e) => update({ active: e.target.checked })} />
                Active (inactive schedules create no new doses)
              </label>
            </div>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create medicine'}</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.medicines.length === 0 && <p className="text-sm text-slate-500">No medicines yet. Add one to start a schedule.</p>}
        {state.medicines.map((m) => (
          <Card key={m.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">{m.name}</h3>
                <p className="text-xs text-slate-500">{m.identifier || 'No identifier'} · {m.frequency}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {m.source === 'demo' && <Badge tone="amber">Demo</Badge>}
                <Badge tone={m.active ? 'emerald' : 'slate'}>{m.active ? 'Active' : 'Inactive'}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {m.times.map((t) => <span key={t} className="rounded-lg bg-brand-50 px-2 py-1 font-mono text-xs text-brand-700">{t}</span>)}
            </div>
            <p className="text-sm text-slate-600">Compartment {m.compartment} · From {m.startDate}{m.endDate ? ` to ${m.endDate}` : ''}</p>
            <p className="line-clamp-2 text-xs text-slate-500">{m.instructions || 'No instructions entered.'}</p>
            <div className="mt-auto flex gap-2 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => openEdit(m)} disabled={offline}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
              </button>
              <button type="button" className="btn-danger flex-1" onClick={() => remove(m)} disabled={offline}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
