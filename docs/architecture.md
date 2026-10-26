# Architecture

## Components
```
Browser (React + Vite)                          FastAPI backend (Python)
 pages/ components/                              api.py      REST routes (camelCase JSON)
 state/AppState.jsx  --polls /api/bootstrap-->   services.py  schedule, dose state machine,
 services/api.js     --REST-->                                 dispense, confirm, emergency, settings
 services/voice.js   (TTS, recognition,                        |
                      offline command parser)     device.py   DeviceAdapter (hardware abstraction)
                                                    SimulatedDeviceAdapter  (default)
                                                    MqttDeviceAdapter       (stub: refuses dispense)
                                                  models.py / database.py -> SQLite (backend/medimate.db)
```

Key design rules:
1. The browser can name a dose. It cannot choose a compartment, motor, or command ID.
2. Every dose status change goes through `transition_dose`, which rejects illegal moves.
3. Motor activation is not treated as proof of dispensing. Dispensing completes only when the device reports it.
4. A dose becomes `taken` only after user confirmation.
5. Emergency intent recognition and call execution are separate steps. Execution is simulated.
6. The simulation is the default. Live mode reports "not connected" until a real adapter exists.

## Database (SQLite, created automatically)
| Table | Purpose |
|---|---|
| `medicines` | Name, identifier, user-entered instructions, frequency, start/end dates, compartment, reminder settings, active flag, source (demo or user) |
| `medicine_times` | One row per scheduled time for a medicine (unique per medicine and time) |
| `doses` | One row per scheduled occurrence. Unique on (medicine, scheduled time). Keeps a medicine-name snapshot so history survives deletion |
| `dose_events` | Append-only audit log of every dose transition |
| `device_commands` | Each dispense command, with a unique `command_id`, compartment, status, start and completion times, and failure reason |
| `emergency_events` | Emergency intents and their outcome. Phone numbers are stored masked |
| `app_settings` | JSON settings (voice, caretaker, countdown, reminder lead time) |

## Dose state machine
```
scheduled --> dispensing_requested --> dispensing_completed --> awaiting_confirmation --> taken
   |  ^                |                                              |
   |  |                v                                              v
   |  +------------- failed  <-- (device refused, jam, stopped)     missed
   v
 missed  (no outcome within the grace period, default 30 minutes)
```
- `dispensing_requested`: the server accepted the request and the motor is running.
- `dispensing_completed`: the device reported completion (simulated sensor in this prototype).
- `awaiting_confirmation`: waiting for the person to confirm.
- `taken`: the person confirmed.
- `failed`: the dispense did not finish. The user may retry. Retries are never automatic.
- `missed`: nothing was confirmed within the grace period.

## Dispensing safety checks (server side)
- Dispensing opens 60 minutes before the scheduled time (`MEDIMATE_DISPENSE_EARLY_MINUTES`) and closes after the grace period.
- A dose that is already dispensing returns the running command. It never starts a second dispense.
- The compartment comes from the medicine record. Empty or faulty compartments are refused.
- A dispense for a missing or inactive medicine is refused.

## Demo clock
`POST /api/demo/advance-to-next-dose` moves the server clock to two minutes before the next dose, so the reminder, dispense, and confirm steps can be shown in under a minute. Earlier doses that were never confirmed become `missed`, which is what real time would do. `POST /api/demo/reset-clock` returns to real time. Disable the feature with `MEDIMATE_ENABLE_DEMO_CLOCK=false`.

## API reference
All routes are under `/api`. Interactive docs are at http://localhost:8000/docs.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status, device mode, server time, demo clock offset |
| GET | `/bootstrap` | Everything the UI needs in one call: medicines, doses (7 days back, 2 days ahead), events, device, settings. Also runs the scheduler (missed detection, dose creation, device sync) |
| GET | `/dashboard` | Today's counts and 7-day adherence |
| GET | `/medicines` | List medicines |
| POST | `/medicines` | Create (201). 422 for invalid input, 409 for a compartment conflict |
| PUT | `/medicines/{id}` | Update. Future doses are rebuilt. History is kept |
| DELETE | `/medicines/{id}` | Delete. Future doses are removed. History is kept |
| GET | `/doses?date=YYYY-MM-DD` | Doses for a local date (default today) |
| POST | `/doses/{id}/confirm` | Confirm taken. 409 unless the dose was dispensed |
| POST | `/dispenser/dispense` | Body `{"doseId": "..."}`. Returns the command, or the running one with `alreadyInProgress: true` |
| GET | `/dispenser/commands/{id}` | Command status |
| POST | `/dispenser/commands/{id}/stop` | Stop a running dispense (the dose becomes failed) |
| GET | `/device/status` | Device, compartments, active command. Also syncs progress |
| POST | `/device/simulation` | Body `{"dispenseSeconds": 3, "failNextDispense": false}` |
| POST | `/device/test-connection` | Connection test (simulated) |
| POST | `/demo/advance-to-next-dose` | Demo clock (403 when disabled) |
| POST | `/demo/reset-clock` | Back to real time |
| GET | `/events?limit=30` | Recent medicine and emergency events |
| POST | `/emergency/intent` | Body `{"source": "voice" or "button", "transcript": "..."}`. Creates a waiting event. 409 without a caretaker |
| GET | `/emergency/events` | Emergency history |
| POST | `/emergency/{id}/confirm` | Runs the simulated workflow. Reports that no real call was placed |
| POST | `/emergency/{id}/cancel` | Cancels before any action |
| GET / PUT | `/settings` | Read or save settings. The phone number is validated |

Validation errors return `422` with `{"detail": [{"field": "...", "message": "..."}]}`.
