# Expo demo script, testing checklist, and evaluation plan

## 1. Five-minute demo script
**Before you start (2 minutes early):** both servers running, browser open at http://localhost:5173, volume up, speakers connected. Click Dashboard so the banner says "Backend connected".

| Time | Say | Show |
|---|---|---|
| 0:00 | "MediMate IoT is a smart pill dispenser that reminds, dispenses, and asks for confirmation. Today it runs in simulation: no hardware is connected." | Dashboard. Point at the amber SIMULATION MODE banner |
| 0:40 | "Schedules are stored in SQLite. Dashboard numbers are calculated from dose records." | Medicine Schedule: open one medicine, change nothing, go back |
| 1:10 | "The 3D model shows the compartments, the motor, the ESP32, the sensor, and the LEDs. It is conceptual." | 3D Model: drag to rotate, click a compartment, open the panel, press Preview dispensing |
| 1:50 | "Now the demo clock jumps to the next dose. Watch the reminder." | Live Dispenser: press "Demo: jump to next dose". The red reminder banner appears and the voice speaks |
| 2:20 | "The dose is dispensed. The device reports completion, but the dose is recorded only after the person confirms." | Press Dispense. Watch the progress bar. Tick "I confirm I took this medicine", then Confirm taken |
| 2:50 | "Voice commands work with confirmation. Let me ask for my next medicine." | Voice Assistant: press the microphone and say "What is my next medicine?" (or type it if the browser has no speech recognition) |
| 3:20 | "Emergency calls are simulated. The system counts down and can be cancelled. No real call is made." | Emergency: press the button, show the countdown, press Cancel (or let it finish and read the note) |
| 4:00 | "Failures are handled. Watch what happens when the motor jams." | Device Settings: tick "inject a jam", apply. Dispense the next due dose, show "failed", retry |
| 4:30 | "Everything is recorded in history and the audit log. The ESP32 integration is planned, and the software is already split for it." | Dose History: show the event log. Open docs/hardware-integration.md |
| 5:00 | "This is a prototype and not a medical device." | About page |

**Backup plan:** if the browser has no speech recognition, type the voice command. If the backend fails, say "the backend has crashed" and restart it (`start-backend.bat`). The dashboard shows demo data during the restart.

## 2. Test checklist (run before the expo)
Tick each box after you have seen the expected result.

**Setup**
- [ ] `python -m pytest -q` in `backend` reports 12 passed
- [ ] `npm run build` in `frontend` succeeds
- [ ] http://localhost:8000/docs opens
- [ ] http://localhost:5173 shows the dashboard with no red banner

**Schedule**
- [ ] Creating a medicine with time `25:00` shows an understandable error
- [ ] End date before start date is rejected
- [ ] Assigning compartment 1 to a second medicine is rejected with a message
- [ ] A new medicine appears on the dashboard and in the schedule after refresh
- [ ] Editing a medicine updates its future doses
- [ ] Deleting a medicine asks for confirmation and keeps its history

**Dispenser**
- [ ] Dispense is refused before the 60-minute opening time (use the demo clock to test)
- [ ] Pressing Dispense twice starts only one dispense (the second shows "already running")
- [ ] The progress bar moves and the compartment highlights
- [ ] Completion does not mark the dose as taken
- [ ] Confirm works only after the box is ticked
- [ ] Dispensing compartment 4 (empty) is refused
- [ ] Injected jam shows "failed", and Retry works

**Voice (Chrome or Edge)**
- [ ] The reminder is spoken when a dose becomes due
- [ ] "What is my next medicine?" reads the next dose
- [ ] "Show today's schedule" reads today's doses
- [ ] "Medicine taken" asks for confirmation before recording
- [ ] "Emergency call" asks for confirmation before starting the workflow
- [ ] "Stop voice" stops speech
- [ ] Denying microphone permission shows a clear message, and the typed command still works

**Emergency**
- [ ] Without a caretaker set, the workflow is blocked with a message
- [ ] The phone number appears masked on the emergency page
- [ ] Countdown runs and Cancel stops it
- [ ] The completed workflow says that no real call was placed

**Failure handling**
- [ ] Stop the backend. The banner changes to "connection lost" or "not running" and actions are disabled
- [ ] Restart the backend. The app recovers without a page reload

## 3. Evaluation metrics for a conference paper (suggested)
Measure with the simulator first, then with hardware:
1. **Dispense command latency**: time from the Dispense click to the `dispensing` status (median and 95th percentile).
2. **Completion detection accuracy**: over N dispense cycles, the fraction where the sensor event matches the physical drop (requires hardware).
3. **False-completion rate**: completions reported with no physical drop. The design target is zero.
4. **Duplicate-dispense prevention**: the number of duplicate commands sent versus the number executed (target: zero executed).
5. **Missed-dose detection delay**: time from the grace-period end to the `missed` record.
6. **Confirmation rate and time-to-confirm**: how often and how fast users confirm after a dispense (usability study).
7. **Voice command recognition accuracy**: per-command success over a set of recorded utterances, in quiet and noisy rooms.
8. **Emergency intent false-positive rate**: how often ordinary speech triggers the emergency intent.
9. **Usability**: System Usability Scale score from older adults and caretakers.
10. **Reliability**: uptime and recovery time after power loss, network loss, and device restart.

## 4. Potential technical contributions
- A dispenser-side state machine that separates dispense requests, device completion, user confirmation, and missed doses, with explicit rules for each.
- A hardware abstraction layer that lets one web application run against a simulator, a test rig, or a real ESP32 without changing the UI.
- Safety-by-design command handling: server-selected compartments, duplicate protection, no automatic retries, and time-window checks.
- Voice interaction in which sensitive actions require confirmation and emergency intent is separated from execution.

## 5. Limitations
- Not a medical device. Not clinically validated. No regulatory review.
- No real hardware. The motor, sensor, and heartbeat are simulated.
- Emergency calls and messages are simulated. There is no real calling channel.
- Single user, no login, no encryption at rest. The backend should run only on localhost.
- Voice recognition depends on the browser (Chrome and Edge work best; some browsers have none).
- Device state is held in memory. A restart during dispensing is detected and reported as a failure, but the hardware state must be checked by a person.
- The 3D model is conceptual and not drawn to engineering dimensions.

## 6. Future enhancements
- ESP32 with MQTT adapter (see docs/hardware-integration.md)
- Hardware sensors for pill counting and compartment level
- Authentication and per-user data, with caretaker accounts
- Real GSM/LTE or licensed calling service, with consent and audit
- Reports and export (PDF) for clinicians, after validation
- Localisation and accessibility review with users and caretakers
- Automated end-to-end browser tests (Playwright)
