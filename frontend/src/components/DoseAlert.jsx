import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BellRing } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import { getMedicine } from '../utils/metrics.js'
import { speak } from '../services/voice.js'

/** Global reminder: shown on every page when a dose is due, and spoken once per dose if voice is enabled. */
export default function DoseAlert() {
  const { state } = useAppState()
  const spokenRef = useRef(new Set())
  const due = state.doses.find((d) => d.isDue && (d.status === 'scheduled' || d.status === 'failed'))
  const med = due ? getMedicine(state.medicines, due.medicineId) : null
  const dueId = due?.id

  useEffect(() => {
    if (!dueId || spokenRef.current.has(dueId)) return
    spokenRef.current.add(dueId)
    if (med?.reminderEnabled === false) return
    speak(
      `Hello. It is time for your scheduled medicine. ${med?.name ?? 'Your medicine'} is in compartment ${med?.compartment ?? ''}. Please check the displayed instructions and confirm after taking it.`,
      { enabled: state.settings.voiceEnabled, rate: state.settings.speechRate, voiceName: state.settings.voiceName },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueId])

  if (!due) return null
  const retry = due.status === 'failed'
  return (
    <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="font-semibold text-amber-900">
            {retry ? 'Dispense failed. Retry is available' : 'Medicine due'}: {med?.name ?? 'scheduled medicine'}
          </p>
          <p className="text-sm text-amber-800">Compartment {med?.compartment ?? '-'}. Check the displayed instructions, then confirm after taking it.</p>
        </div>
      </div>
      <Link to="/dispenser" className="btn-primary shrink-0">Open live dispenser</Link>
    </div>
  )
}
