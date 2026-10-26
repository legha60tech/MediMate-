# Hardware integration plan (ESP32 + MQTT)

This is a plan, not something built in the expo version. The software is already split so that the hardware can be added without rewriting the app.

## What changes and what does not
- **Unchanged:** the React UI, medicine schedules, dose state machine, confirmation logic, history, API.
- **Replaced:** `SimulatedDeviceAdapter` in `backend/app/device.py` becomes an `MqttDeviceAdapter` (the stub already exists).
- **Added in firmware:** an ESP32 sketch that subscribes to commands, drives the motor, reads the pill-drop sensor, and publishes events, status, and telemetry.

## Adapter interface (already in code)
| Method | Real-device behaviour |
|---|---|
| `is_connected()` | True only after a heartbeat has been received recently |
| `test_connection()` | Publishes a ping and waits for the status reply |
| `get_status()` | Latest retained status message |
| `get_compartments()` | Compartment states reported by the device |
| `request_dispense(command_id, compartment, dose_id)` | Publishes a command and returns `dispensing`. Refuses if not connected |
| `poll_command(command_id)` | Returns `completed` only after a sensor event for that command |
| `stop(command_id)` | Publishes a stop command |
| `send_emergency_alert(event_id)` | Must go through an authorised channel (GSM/LTE module or licensed service). Not implemented |

## MQTT topics (configurable prefix, default `medimate`)
| Topic | Direction | Purpose |
|---|---|---|
| `medimate/device/status` | device to server (retained) | Online status, firmware, compartment states, heartbeat |
| `medimate/device/command` | server to device | Dispense and stop commands |
| `medimate/device/event` | device to server | Command acknowledgement, dispense started, completed, failed |
| `medimate/device/telemetry` | device to server | Periodic sensor readings (optional) |

Device ID example: `MM-ESP32-0001`.

## Payload examples
Command (server to device):
```json
{
  "schemaVersion": 1,
  "deviceId": "MM-ESP32-0001",
  "commandId": "3fd244d1-e25f-4457-bbd6-c688be871169",
  "action": "dispense",
  "compartment": 3,
  "doseId": "ae71cf82-cdda-4be9-9f2c-9a1e62bcac77",
  "issuedAt": "2026-10-24T19:58:00Z",
  "expiresAt": "2026-10-24T20:05:00Z"
}
```

Acknowledgement and completion (device to server):
```json
{"schemaVersion":1,"deviceId":"MM-ESP32-0001","commandId":"3fd244d1-e25f-4457-bbd6-c688be871169",
 "event":"ack","status":"accepted","timestamp":"2026-10-24T19:58:00.420Z"}

{"schemaVersion":1,"deviceId":"MM-ESP32-0001","commandId":"3fd244d1-e25f-4457-bbd6-c688be871169",
 "event":"completed","status":"success","sensor":{"pillDropDetected":true,"compartment":3},
 "timestamp":"2026-10-24T19:58:03.100Z"}
```

Status (retained, device to server):
```json
{"schemaVersion":1,"deviceId":"MM-ESP32-0001","firmware":"0.1.0","online":true,
 "compartments":{"1":"ready","2":"ready","3":"low","4":"empty"},"timestamp":"2026-10-24T19:58:00Z"}
```

## Required safety rules before any live use
1. **Validate every command on the device**: schema version, device ID, command ID not seen before, not expired, compartment in range.
2. **Duplicate protection**: keep recently seen command IDs on the ESP32. Ignore repeats and resend the stored result.
3. **Motor limits**: a hard timeout on the motor. Stop on stall current or encoder error. Report a fault instead of retrying.
4. **Sensor confirmation**: report `completed` only when the pill-drop sensor fires for that command. A timeout is reported as `failed`.
5. **No automatic retries** on the device or server after a timeout. The server asks the user, and the user decides after checking the dispenser.
6. **Heartbeat**: if the device is silent for longer than the heartbeat window, the UI shows "disconnected" and refuses new commands.
7. **Authentication**: MQTT with TLS and per-device credentials. Never put broker passwords in the frontend.
8. **Physical safety**: a lockout on the motor, a mechanical stop, and a reviewed electrical design. The prototype does none of this.

## Build order for the ESP32 (after the expo)
1. Blink LEDs and connect to Wi-Fi.
2. Publish status and heartbeat to a local broker (for example, Mosquitto on the laptop).
3. Run the motor for one compartment with a hard timeout (no medicine present).
4. Add the pill-drop sensor and confirm it triggers reliably over many cycles.
5. Connect the backend's `MqttDeviceAdapter` and run the test suite against the real device.
6. Add the speaker, the display, and the RTC if needed.
