import { Card, PageHeader } from '../components/ui.jsx'

const SECTIONS = [
  ['What it is', 'MediMate IoT is a simulation-first prototype of an automatic pill dispenser. A web dashboard talks to a Python backend. The backend decides when doses are due, asks a device adapter to dispense, and records what happened.'],
  ['What is real in this prototype', 'Medicine schedules, dose state, dispense requests, confirmations, missed-dose detection, emergency intents, and the event history are stored in SQLite and enforced by the backend. Voice output and recognition use browser features.'],
  ['What is simulated', 'The dispenser hardware, its motor, its sensors, the device heartbeat, and the emergency call. No physical device is connected and no call or message is sent.'],
  ['Safety design', 'The browser can name only a dose. The server picks the compartment. Dispensing is limited to a time window, duplicate dispense requests return the running command, a dose becomes taken only after user confirmation, and emergency intents need explicit confirmation.'],
  ['Hardware plan', 'An ESP32 controller would replace SimulatedDeviceAdapter with an MQTT adapter. Topics are medimate/device/status, command, event, and telemetry. Dispensing would require compartment-sensor feedback before reporting completion. See docs/hardware-integration.md.'],
  ['Limitations', 'Not a medical device. Not validated with clinicians or users. Dosage data is user-entered. Single user, no login, no encryption at rest, and no real emergency channel.'],
]

export default function About() {
  return (
    <div className="space-y-6">
      <PageHeader title="About the Project" subtitle="MediMate IoT · Smart pill dispenser with voice alerts and caretaker calling (prototype)" />
      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map(([title, body]) => (
          <Card key={title}>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
          </Card>
        ))}
      </div>
      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm text-amber-900">
          This prototype must not be used to manage real medication until it has been properly designed, tested, and validated
          for that purpose.
        </p>
      </Card>
    </div>
  )
}
