import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import { Badge, Card, PageHeader } from '../components/ui.jsx'
import { getMedicine } from '../utils/metrics.js'
import { formatDateTime } from '../utils/time.js'

const STATUSES = ['all', 'scheduled', 'dispensing_requested', 'dispensing_completed', 'awaiting_confirmation', 'taken', 'missed', 'failed']
const TONE = { taken: 'emerald', missed: 'rose', failed: 'rose', scheduled: 'blue' }

function downloadCsv(rows) {
  const header = ['scheduled_at', 'medicine', 'compartment', 'status']
  const lines = [header.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'medimate-dose-history.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function History() {
  const { state } = useAppState()
  const [status, setStatus] = useState('all')
  const [medicineId, setMedicineId] = useState('all')

  const rows = useMemo(() => {
    return [...state.doses]
      .filter((d) => status === 'all' || d.status === status)
      .filter((d) => medicineId === 'all' || d.medicineId === medicineId)
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
  }, [state.doses, status, medicineId])

  const exportRows = () =>
    downloadCsv(rows.map((d) => [
      d.scheduledAt, getMedicine(state.medicines, d.medicineId)?.name ?? d.medicineName, d.compartment, d.status,
    ]))

  const select = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm'

  return (
    <div className="space-y-6">
      <PageHeader title="Dose History" subtitle="Every scheduled dose and its outcome, plus the event log.">
        <button type="button" className="btn-secondary" onClick={exportRows} disabled={rows.length === 0}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </button>
      </PageHeader>

      <Card>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm text-slate-600">
            Status{' '}
            <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Medicine{' '}
            <select className={select} value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
              <option value="all">All medicines</option>
              {state.medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Scheduled</th>
                <th className="py-2 pr-4">Medicine</th>
                <th className="py-2 pr-4">Compartment</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="py-2 pr-4 text-slate-700">{formatDateTime(d.scheduledAt)}</td>
                  <td className="py-2 pr-4 text-slate-900">{getMedicine(state.medicines, d.medicineId)?.name ?? d.medicineName ?? 'Removed medicine'}</td>
                  <td className="py-2 pr-4 text-slate-600">{d.compartment ?? '-'}</td>
                  <td className="py-2"><Badge tone={TONE[d.status] ?? 'amber'}>{d.status.replace(/_/g, ' ')}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No doses match these filters.</p>}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Event log</h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {state.events.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
              <span className="text-sm text-slate-800">{e.message}</span>
              <span className="text-xs text-slate-500">{formatDateTime(e.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
