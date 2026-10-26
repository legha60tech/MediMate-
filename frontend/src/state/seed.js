// DEMONSTRATION DATA ONLY.
// Medicine names are placeholders. No dosage or treatment advice is included:
// the instruction text is a reminder to enter real instructions from a prescription.
import { dateAtTime, dayKey } from '../utils/time.js'

export const DEMO_MEDICINES = [
  {
    id: 'med-1',
    name: 'Demo Medicine A',
    identifier: 'DEMO-A-001',
    instructions: 'Placeholder: enter the instructions from your prescription here.',
    times: ['08:00', '14:00', '21:00'],
    startDate: '2026-10-01',
    endDate: null,
    frequency: 'Daily',
    compartment: 1,
    reminderEnabled: true,
    reminderLeadMinutes: 5,
    active: true,
  },
  {
    id: 'med-2',
    name: 'Demo Medicine B',
    identifier: 'DEMO-B-002',
    instructions: 'Placeholder: enter the instructions from your prescription here.',
    times: ['09:00', '21:00'],
    startDate: '2026-10-01',
    endDate: null,
    frequency: 'Twice daily',
    compartment: 2,
    reminderEnabled: true,
    reminderLeadMinutes: 5,
    active: true,
  },
  {
    id: 'med-3',
    name: 'Demo Medicine C',
    identifier: 'DEMO-C-003',
    instructions: 'Placeholder: enter the instructions from your prescription here.',
    times: ['20:00'],
    startDate: '2026-10-01',
    endDate: null,
    frequency: 'Daily',
    compartment: 3,
    reminderEnabled: true,
    reminderLeadMinutes: 5,
    active: true,
  },
]

/** Builds one week of history (past doses get taken/missed) plus upcoming doses for today and tomorrow. */
export function buildDemoDoses(medicines, now) {
  const doses = []
  for (let offset = -6; offset <= 1; offset++) {
    medicines.forEach((med, mi) => {
      if (!med.active) return
      med.times.forEach((hhmm, ti) => {
        const scheduledAt = dateAtTime(offset, hhmm, now)
        const day = dayKey(scheduledAt)
        if (med.startDate && day < med.startDate) return
        if (med.endDate && day > med.endDate) return

        let status = 'scheduled'
        if (scheduledAt <= now) {
          // Deterministic demo pattern: roughly 1 in 9 past doses is "missed".
          status = ((offset + 10) * 7 + mi * 3 + ti) % 9 === 4 ? 'missed' : 'taken'
        }
        doses.push({
          id: `dose-${med.id}-${day}-${hhmm.replace(':', '')}`,
          medicineId: med.id,
          scheduledAt: scheduledAt.toISOString(),
          status,
          source: 'demo',
        })
      })
    })
  }
  return doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
}

export function buildDemoEvents(doses, medicines, now) {
  const recent = doses.filter((d) => d.status !== 'scheduled').slice(-8)
  const medicineEvents = recent.map((d) => {
    const med = medicines.find((m) => m.id === d.medicineId)
    return {
      id: `evt-${d.id}`,
      at: d.scheduledAt,
      kind: 'medicine',
      message: `${d.status === 'taken' ? 'Dose confirmed taken' : 'Dose missed'}: ${med?.name ?? 'Unknown'}`,
    }
  })
  return [
    ...medicineEvents,
    {
      id: 'evt-emergency-demo',
      at: new Date(now.getTime() - 2 * 86400000).toISOString(),
      kind: 'emergency',
      message: 'Emergency drill (simulated): no call was placed',
    },
    {
      id: 'evt-device-demo',
      at: now.toISOString(),
      kind: 'device',
      message: 'Simulation started: no hardware connected',
    },
  ].sort((a, b) => b.at.localeCompare(a.at))
}

export function buildDemoDevice(now) {
  return {
    mode: 'simulation',
    deviceId: 'MM-SIM-0001',
    firmware: 'sim-0.1.0',
    lastHeartbeat: now.toISOString(),
    compartments: [
      { id: 1, medicineId: 'med-1', status: 'ready' },
      { id: 2, medicineId: 'med-2', status: 'ready' },
      { id: 3, medicineId: 'med-3', status: 'low' },
      { id: 4, medicineId: null, status: 'empty' },
    ],
  }
}

export const DEMO_SETTINGS = {
  voiceEnabled: true,
  speechRate: 1,
  voiceName: '',
  caretakerName: '',
  caretakerPhone: '',
  emergencyCountdownSeconds: 10,
  reminderLeadMinutes: 5,
  simulationSpeed: 1,
}
