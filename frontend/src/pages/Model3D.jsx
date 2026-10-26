import { useMemo, useRef, useState } from 'react'
import { RotateCcw, PanelTopOpen, Tag, Play } from 'lucide-react'
import { useAppState } from '../state/AppState.jsx'
import DispenserModel3D from '../components/DispenserModel3D.jsx'
import { Badge, Card, PageHeader } from '../components/ui.jsx'
import { getMedicine } from '../utils/metrics.js'

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

const COMPONENT_INFO = {
  panel: 'Transparent front panel. It opens on a hinge so the compartments can be serviced. Conceptual model, not to scale.',
  motor: 'Motor and dispensing wheel. It turns only while a dispense command is running. Running the motor is not proof that a pill was dropped.',
  esp32: 'ESP32 controller. It would receive commands, read sensors, and report status over Wi-Fi (MQTT). Represented conceptually.',
  sensor: 'Pill-drop sensor at the chute. In a real device it would confirm each drop before the software reports completion.',
  screen: 'Small screen on the front. It would show the next medicine and reminders.',
  speaker: 'Speaker grille. It would play the spoken reminders.',
  leds: 'Status LEDs: power, network, and dispenser status. The amber LED pulses while dispensing.',
  outlet: 'Dispensing outlet. The pill drops here, and the person takes it from this tray.',
}

export default function Model3D() {
  const { state } = useAppState()
  const controlsRef = useRef()
  const [webgl] = useState(supportsWebGL)
  const [selectedId, setSelectedId] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [preview, setPreview] = useState(false)
  const [selectedPart, setSelectedPart] = useState(null)

  const active = state.device.activeCommand
  const dispensing = preview || Boolean(active)
  const activeCompartment = preview ? 1 : active?.compartment ?? null
  const connected = state.device.connected !== false && state.source === 'live'

  const selectedCompartment = useMemo(
    () => state.device.compartments.find((c) => c.id === selectedId) ?? null,
    [state.device.compartments, selectedId],
  )
  const selectedMed = selectedCompartment ? getMedicine(state.medicines, selectedCompartment.medicineId) : null

  const selectCompartment = (id) => { setSelectedId(id); setSelectedPart(null) }

  const info = selectedCompartment
    ? `Compartment ${selectedCompartment.id}: ${selectedMed ? `holds ${selectedMed.name}` : 'no medicine assigned'}. Hardware status: ${selectedCompartment.status}.`
    : selectedPart
      ? COMPONENT_INFO[selectedPart]
      : 'Click a compartment in the model, or choose a component below. Drag to rotate, scroll to zoom.'

  const parts = [
    ['panel', 'Front panel'], ['motor', 'Motor'], ['esp32', 'ESP32 controller'], ['sensor', 'Pill sensor'],
    ['screen', 'Screen'], ['speaker', 'Speaker'], ['leds', 'Status LEDs'], ['outlet', 'Outlet'],
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Interactive 3D Model" subtitle="Procedurally generated. Components are conceptual and not drawn to engineering dimensions." />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => setPanelOpen((v) => !v)}>
          <PanelTopOpen className="h-4 w-4" aria-hidden="true" /> {panelOpen ? 'Close front panel' : 'Open front panel'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setShowLabels((v) => !v)}>
          <Tag className="h-4 w-4" aria-hidden="true" /> {showLabels ? 'Hide labels' : 'Show labels'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => controlsRef.current?.reset()}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset camera
        </button>
        <button type="button" className="btn-secondary" onClick={() => setPreview((v) => !v)}>
          <Play className="h-4 w-4" aria-hidden="true" /> {preview ? 'Stop preview' : 'Preview dispensing'}
        </button>
        <Badge tone={dispensing ? 'amber' : 'slate'}>{dispensing ? 'Dispensing' : 'Idle'}</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {webgl ? (
            <DispenserModel3D
              selectedId={selectedId}
              onSelect={selectCompartment}
              panelOpen={panelOpen}
              activeCompartment={activeCompartment}
              dispensing={dispensing}
              connected={connected}
              showLabels={showLabels}
              controlsRef={controlsRef}
            />
          ) : (
            <Card>
              <h2 className="font-semibold text-slate-900">3D view unavailable</h2>
              <p className="mt-2 text-sm text-slate-600">This browser does not support WebGL. The component list below is a schematic of the same parts.</p>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="font-semibold text-slate-900">Selected</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{info}</p>
          <h3 className="mt-6 text-sm font-semibold text-slate-800">Components</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {parts.map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => { setSelectedPart(key); setSelectedId(null) }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${selectedPart === key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-semibold text-slate-800">Compartments</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {state.device.compartments.map((c) => (
              <button key={c.id} type="button" onClick={() => selectCompartment(c.id)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${selectedId === c.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                Compartment {c.id}
                <span className="block truncate text-xs text-slate-500">{getMedicine(state.medicines, c.medicineId)?.name ?? 'Empty slot'}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
