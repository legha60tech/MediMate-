"""Hardware abstraction layer.

Everything that could move a motor goes through a DeviceAdapter.
- SimulatedDeviceAdapter: simulated sensor and dispensing results.
- MqttDeviceAdapter: future ESP32 integration stub.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

from . import config


class DeviceError(Exception):
    """The device cannot accept or complete a request."""


def _real_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(dt: datetime | None) -> str | None:
    return (
        dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        if dt
        else None
    )


class DeviceAdapter(ABC):
    mode: str = "unknown"

    @abstractmethod
    def is_connected(self) -> bool:
        ...

    @abstractmethod
    def test_connection(self) -> dict:
        ...

    @abstractmethod
    def get_status(self) -> dict:
        ...

    @abstractmethod
    def get_compartments(self) -> dict:
        ...

    @abstractmethod
    def request_dispense(
        self, command_id: str, compartment: int, dose_id: str
    ) -> dict:
        ...

    @abstractmethod
    def poll_command(self, command_id: str) -> dict | None:
        ...

    @abstractmethod
    def stop(self, command_id: str) -> dict:
        ...

    @abstractmethod
    def send_emergency_alert(self, event_id: str) -> dict:
        ...

    @abstractmethod
    def configure_simulation(
        self, dispense_seconds=None, fail_next_dispense=None
    ) -> None:
        ...


class SimulatedDeviceAdapter(DeviceAdapter):
    mode = "simulation"

    def __init__(self) -> None:
        self.device_id = "MM-SIM-0001"
        self.firmware = "sim-0.2.0"

        # Compartment 4 is empty for demonstration purposes.
        self.compartments = {
            1: "ready",
            2: "ready",
            3: "low",
            4: "empty",
        }

        self.dispense_seconds = 3.0
        self.fail_next = False
        self._active: dict[str, dict] = {}
        self.last_heartbeat = _real_utc_now()

    def is_connected(self) -> bool:
        return True

    def test_connection(self) -> dict:
        self.last_heartbeat = _real_utc_now()
        return {
            "ok": True,
            "message": (
                "Simulated device responded. "
                "No physical hardware is involved."
            ),
        }

    def get_status(self) -> dict:
        self.last_heartbeat = _real_utc_now()

        return {
            "mode": self.mode,
            "connected": True,
            "deviceId": self.device_id,
            "firmware": self.firmware,
            "lastHeartbeat": _iso(self.last_heartbeat),
            "dispenseSeconds": self.dispense_seconds,
            "failNextDispense": self.fail_next,
        }

    def get_compartments(self) -> dict:
        return dict(self.compartments)

    def get_sensor_readings(self) -> dict:
        return {
            "compartments": dict(self.compartments),
            "note": "simulated readings",
        }

    def request_dispense(
        self, command_id: str, compartment: int, dose_id: str
    ) -> dict:
        if compartment not in self.compartments:
            raise DeviceError(
                f"Compartment {compartment} does not exist on this device"
            )

        state = self.compartments[compartment]

        if state in ("empty", "fault"):
            return {
                "status": "failed",
                "reason": (
                    f"Compartment {compartment} is {state}. "
                    "Dispense refused."
                ),
            }

        if self.fail_next:
            self.fail_next = False
            return {
                "status": "failed",
                "reason": (
                    "Simulated jam: motor stalled "
                    "(fault injected for testing)."
                ),
            }

        started = _real_utc_now()
        completes = started + timedelta(seconds=self.dispense_seconds)

        self._active[command_id] = {
            "compartment": compartment,
            "completes": completes,
        }

        return {
            "status": "dispensing",
            "started": started,
            "completes": completes,
        }

    def poll_command(self, command_id: str) -> dict | None:
        info = self._active.get(command_id)

        if info is None:
            return None

        if _real_utc_now() >= info["completes"]:
            del self._active[command_id]

            return {
                "status": "completed",
                "sensor": (
                    "simulated pill-drop sensor reports a drop "
                    "(simulation only)"
                ),
            }

        return {"status": "dispensing"}

    def stop(self, command_id: str) -> dict:
        self._active.pop(command_id, None)
        return {"status": "stopped"}

    def send_emergency_alert(self, event_id: str) -> dict:
        """Simulate alerts by default; call Twilio only when enabled."""
        print(f"[DEBUG] Emergency mode: {config.EMERGENCY_CALL_MODE!r}")
        # Safety: simulation mode must never place a real phone call.
        if config.EMERGENCY_CALL_MODE != "twilio":
            return {
                "status": "simulated",
                "note": (
                    "No real call was placed. "
                    "Emergency alert simulated."
                ),
            }

        account_sid = config.TWILIO_ACCOUNT_SID
        auth_token = config.TWILIO_AUTH_TOKEN
        from_number = config.TWILIO_FROM_NUMBER
        to_number = config.MEDIMATE_EMERGENCY_PHONE

        if not all([account_sid, auth_token, from_number, to_number]):
            raise DeviceError(
                "Twilio is not fully configured. "
                "Check the backend .env file."
            )

        try:
            from twilio.rest import Client

            client = Client(account_sid, auth_token)

            call = client.calls.create(
                to=to_number,
                from_=from_number,
                twiml=(
                    "<Response>"
                    "<Say voice='alice' language='en-IN'>"
                    "Emergency alert from MediMate. "
                    "Please check on the person using the "
                    "medicine dispenser."
                    "</Say>"
                    "</Response>"
                ),
            )

            return {
                "status": "sent",
                "note": (
                    "Emergency voice call initiated. "
                    f"Call ID: {call.sid}"
                ),
            }

        except Exception as exc:
            raise DeviceError(
                f"Twilio could not initiate the emergency call: {exc}"
            ) from exc

    def configure_simulation(
        self, dispense_seconds=None, fail_next_dispense=None
    ) -> None:
        if dispense_seconds is not None:
            self.dispense_seconds = float(dispense_seconds)

        if fail_next_dispense is not None:
            self.fail_next = bool(fail_next_dispense)


class MqttDeviceAdapter(DeviceAdapter):
    """Stub for the future ESP32 link."""

    mode = "live"

    def is_connected(self) -> bool:
        return False

    def test_connection(self) -> dict:
        return {
            "ok": False,
            "message": (
                "Live MQTT adapter is not implemented in this prototype."
            ),
        }

    def get_status(self) -> dict:
        return {
            "mode": self.mode,
            "connected": False,
            "deviceId": "not-configured",
            "firmware": None,
            "lastHeartbeat": None,
            "dispenseSeconds": None,
            "failNextDispense": False,
            "reason": (
                "Live MQTT adapter is not implemented. "
                "Dispensing is refused."
            ),
        }

    def get_compartments(self) -> dict:
        return {}

    def request_dispense(
        self, command_id: str, compartment: int, dose_id: str
    ) -> dict:
        raise DeviceError(
            "Live hardware is not connected. Dispensing refused."
        )

    def poll_command(self, command_id: str) -> dict | None:
        return None

    def stop(self, command_id: str) -> dict:
        raise DeviceError("Live hardware is not connected.")

    def send_emergency_alert(self, event_id: str) -> dict:
        raise DeviceError(
            "No live emergency channel is configured in this prototype."
        )

    def configure_simulation(
        self, dispense_seconds=None, fail_next_dispense=None
    ) -> None:
        raise DeviceError(
            "Simulation settings are only available in simulation mode."
        )


_adapter: DeviceAdapter | None = None


def get_adapter() -> DeviceAdapter:
    global _adapter

    if _adapter is None:
        if config.DEVICE_MODE == "live":
            _adapter = MqttDeviceAdapter()
        else:
            _adapter = SimulatedDeviceAdapter()

    return _adapter
