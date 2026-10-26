"""Business logic: schedule generation, the dose state machine, dispensing, confirmation,
missed-dose detection, the emergency workflow, settings, and the demo clock."""
import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from twilio.rest import Client
from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import config
from .device import DeviceError, get_adapter
from .models import AppSetting, DeviceCommand, Dose, DoseEvent, EmergencyEvent, Medicine
from .schemas import SettingsIn

# ---------------------------------------------------------------- clock
# The demo clock lets the expo jump forward to the next dose. Real time is used for device timing.
_clock_offset = timedelta(0)


def real_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_now() -> datetime:
    return real_utc_now() + _clock_offset


def set_clock_offset(delta: timedelta) -> None:
    global _clock_offset
    _clock_offset = delta


def clock_offset_seconds() -> int:
    return int(_clock_offset.total_seconds())


def iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def local_today() -> date:
    return utc_now().replace(tzinfo=timezone.utc).astimezone().date()


def local_date_of(dt: datetime) -> date:
    return dt.replace(tzinfo=timezone.utc).astimezone().date()


def local_to_utc(day: date, hhmm: str) -> datetime:
    hour, minute = (int(part) for part in hhmm.split(":"))
    local_dt = datetime(day.year, day.month, day.day, hour, minute).astimezone()
    return local_dt.astimezone(timezone.utc).replace(tzinfo=None)


def grace() -> timedelta:
    return timedelta(minutes=config.OVERDUE_GRACE_MINUTES)


# ---------------------------------------------------------------- settings
def default_settings() -> dict:
    return SettingsIn().model_dump(by_alias=True)


def get_settings(db: Session) -> dict:
    data = default_settings()
    row = db.get(AppSetting, "settings")
    if row:
        data.update(json.loads(row.value_json))
    return data


def save_settings(db: Session, payload: SettingsIn) -> dict:
    data = payload.model_dump(by_alias=True)
    row = db.get(AppSetting, "settings")
    if row is None:
        db.add(AppSetting(key="settings", value_json=json.dumps(data)))
    else:
        row.value_json = json.dumps(data)
    db.commit()
    return data


# ---------------------------------------------------------------- dose state machine
# Every status change goes through transition_dose, which rejects illegal moves.
ALLOWED_TRANSITIONS = {
    "scheduled": {"dispensing_requested", "missed"},
    "failed": {"dispensing_requested", "missed"},
    "dispensing_requested": {"dispensing_completed", "failed"},
    "dispensing_completed": {"awaiting_confirmation", "taken"},
    "awaiting_confirmation": {"taken", "missed"},
    "taken": set(),
    "missed": set(),
}


def log_event(db: Session, dose_id: str, event_type: str, message: str, source: str = "system") -> None:
    db.add(DoseEvent(dose_id=dose_id, event_type=event_type, source=source, message=message, created_at=utc_now()))


def transition_dose(db: Session, dose: Dose, new_status: str, event_type: str, message: str, source: str = "system") -> None:
    if new_status not in ALLOWED_TRANSITIONS.get(dose.status, set()):
        raise HTTPException(409, f"A dose cannot change from '{dose.status}' to '{new_status}'.")
    dose.status = new_status
    dose.updated_at = utc_now()
    log_event(db, dose.id, event_type, message, source)


def is_due(dose: Dose, lead_minutes: int, now: datetime) -> bool:
    if dose.status not in ("scheduled", "failed"):
        return False
    return dose.scheduled_at - timedelta(minutes=lead_minutes) <= now <= dose.scheduled_at + grace()


# ---------------------------------------------------------------- schedule generation and device sync
def ensure_doses(db: Session) -> None:
    """Create today's and tomorrow's doses from the medicine schedules (no duplicates)."""
    now = utc_now()
    today = local_today()
    for medicine in db.query(Medicine).filter(Medicine.active.is_(True)).all():
        for day in (today, today + timedelta(days=1)):
            key = day.isoformat()
            if key < medicine.start_date or (medicine.end_date and key > medicine.end_date):
                continue
            for hhmm in sorted(t.time_of_day for t in medicine.times):
                at = local_to_utc(day, hhmm)
                if at < now - grace():
                    continue  # too old to create as a new dose
                exists = db.query(Dose.id).filter(Dose.medicine_id == medicine.id, Dose.scheduled_at == at).first()
                if exists:
                    continue
                db.add(
                    Dose(
                        id=str(uuid.uuid4()),
                        medicine_id=medicine.id,
                        medicine_name=medicine.name,
                        compartment=medicine.compartment,
                        scheduled_at=at,
                        status="scheduled",
                        source=medicine.source,
                        updated_at=now,
                    )
                )
    db.flush()


def sync_device(db: Session) -> None:
    """Ask the device about running commands and move doses forward when it reports results."""
    adapter = get_adapter()
    for cmd in db.query(DeviceCommand).filter(DeviceCommand.status == "dispensing").all():
        dose = db.get(Dose, cmd.dose_id)
        result = adapter.poll_command(cmd.command_id)
        if result is None:
            cmd.status = "failed"
            cmd.failure_reason = "The device lost track of this command. No dispense is confirmed. Check the dispenser before retrying."
            cmd.updated_at = utc_now()
            transition_dose(db, dose, "failed", "dispense_failed", cmd.failure_reason, source="device")
        elif result["status"] == "completed":
            cmd.status = "completed"
            cmd.updated_at = utc_now()
            transition_dose(
                db, dose, "dispensing_completed", "dispense_completed",
                f"Compartment {cmd.compartment}: {result.get('sensor', 'completion reported')}", source="device",
            )
            transition_dose(db, dose, "awaiting_confirmation", "awaiting_confirmation",
                            "Waiting for the user to confirm the dose was taken")
    db.flush()


def mark_overdue_as_missed(db: Session) -> None:
    cutoff = utc_now() - grace()
    for dose in db.query(Dose).filter(Dose.status.in_(["scheduled", "failed"]), Dose.scheduled_at < cutoff).all():
        transition_dose(db, dose, "missed", "missed",
                        "No dispense or confirmation was recorded within the grace period", source="system")
    db.flush()


def refresh_state(db: Session) -> None:
    sync_device(db)
    mark_overdue_as_missed(db)
    ensure_doses(db)
    db.commit()


# ---------------------------------------------------------------- dispensing
def serialize_command(cmd: DeviceCommand) -> dict:
    return {
        "commandId": cmd.command_id,
        "doseId": cmd.dose_id,
        "compartment": cmd.compartment,
        "status": cmd.status,
        "startedAt": iso(cmd.started_at) if cmd.started_at else None,
        "completesAt": iso(cmd.completes_at) if cmd.completes_at else None,
        "failureReason": cmd.failure_reason,
    }


def dispense_dose(db: Session, dose_id: str, source: str = "user") -> dict:
    dose = db.get(Dose, dose_id)
    if dose is None:
        raise HTTPException(404, "Dose not found")

    # Duplicate protection: if a dispense is already running for this dose, return it instead of starting another.
    running = db.query(DeviceCommand).filter(DeviceCommand.dose_id == dose.id, DeviceCommand.status == "dispensing").first()
    if running:
        return {"alreadyInProgress": True, "command": serialize_command(running)}

    now = utc_now()
    if dose.status not in ("scheduled", "failed"):
        raise HTTPException(409, f"This dose is '{dose.status}'. Dispensing is only allowed for scheduled or failed doses.")
    if now < dose.scheduled_at - timedelta(minutes=config.DISPENSE_EARLY_MINUTES):
        raise HTTPException(409, f"Too early. Dispensing opens {config.DISPENSE_EARLY_MINUTES} minutes before the scheduled time.")
    if now > dose.scheduled_at + grace():
        raise HTTPException(409, "The dispense window has closed. This dose is recorded as missed.")
    medicine = db.get(Medicine, dose.medicine_id) if dose.medicine_id else None
    if medicine is None or not medicine.active:
        raise HTTPException(409, "This medicine is no longer active, so it cannot be dispensed.")

    command_id = str(uuid.uuid4())
    try:
        result = get_adapter().request_dispense(command_id, medicine.compartment, dose.id)
    except DeviceError as exc:
        raise HTTPException(503, str(exc))

    cmd = DeviceCommand(command_id=command_id, dose_id=dose.id, compartment=medicine.compartment,
                        action="dispense", status="dispensing", created_at=now, updated_at=now)
    transition_dose(db, dose, "dispensing_requested", "dispense_requested",
                    f"Dispense requested from compartment {medicine.compartment}", source=source)
    if result["status"] == "failed":
        cmd.status = "failed"
        cmd.failure_reason = result["reason"]
        transition_dose(db, dose, "failed", "dispense_failed", result["reason"], source="device")
    else:
        cmd.started_at = result["started"]
        cmd.completes_at = result["completes"]
    db.add(cmd)
    db.commit()
    return {"alreadyInProgress": False, "command": serialize_command(cmd)}


def stop_dispense(db: Session, command_id: str) -> dict:
    cmd = db.get(DeviceCommand, command_id)
    if cmd is None:
        raise HTTPException(404, "Command not found")
    if cmd.status != "dispensing":
        raise HTTPException(409, f"This command is '{cmd.status}', so there is nothing to stop.")
    get_adapter().stop(command_id)
    cmd.status = "failed"
    cmd.failure_reason = "Stopped by user"
    cmd.updated_at = utc_now()
    dose = db.get(Dose, cmd.dose_id)
    transition_dose(db, dose, "failed", "dispense_stopped",
                    "Dispense stopped by the user. No dose was recorded as taken.", source="user")
    db.commit()
    return serialize_command(cmd)


def confirm_taken(db: Session, dose_id: str) -> Dose:
    dose = db.get(Dose, dose_id)
    if dose is None:
        raise HTTPException(404, "Dose not found")
    if dose.status not in ("awaiting_confirmation", "dispensing_completed"):
        raise HTTPException(409, "Only a dispensed dose that is awaiting confirmation can be confirmed as taken.")
    transition_dose(db, dose, "taken", "confirmed_taken", "User confirmed the dose was taken", source="user")
    db.commit()
    return dose


# ---------------------------------------------------------------- emergency workflow
def mask_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if not digits:
        return ""
    return "*" * max(len(digits) - 4, 0) + digits[-4:]


def serialize_emergency(ev: EmergencyEvent) -> dict:
    return {
        "id": ev.id,
        "source": ev.source,
        "status": ev.status,
        "transcript": ev.transcript,
        "caretakerName": ev.caretaker_name,
        "caretakerPhoneMasked": ev.caretaker_phone_masked,
        "note": ev.note,
        "createdAt": iso(ev.created_at),
        "updatedAt": iso(ev.updated_at),
    }


def create_emergency(db: Session, source: str, transcript: str) -> EmergencyEvent:
    settings = get_settings(db)
    if not settings.get("caretakerPhone"):
        raise HTTPException(409, "Set a caretaker name and phone number in Device Settings before using the emergency workflow.")
    waiting = db.query(EmergencyEvent).filter(EmergencyEvent.status == "awaiting_confirmation").first()
    if waiting:
        return waiting
    now = utc_now()
    ev = EmergencyEvent(
        id=str(uuid.uuid4()),
        source=source,
        status="awaiting_confirmation",
        transcript=transcript or None,
        caretaker_name=settings.get("caretakerName") or "Caretaker",
        caretaker_phone_masked=mask_phone(settings["caretakerPhone"]),
        note="Waiting for explicit confirmation. Nothing has been sent.",
        created_at=now,
        updated_at=now,
    )
    db.add(ev)
    db.commit()
    return ev


def confirm_emergency(db: Session, event_id: str) -> EmergencyEvent:
    ev = db.get(EmergencyEvent, event_id)

    if ev is None:
        raise HTTPException(404, "Emergency event not found")

    if ev.status != "awaiting_confirmation":
        raise HTTPException(
            409,
            f"This emergency event is '{ev.status}' and cannot be confirmed.",
        )

    try:
        result = get_adapter().send_emergency_alert(event_id)
    except DeviceError as exc:
        raise HTTPException(503, str(exc)) from exc

    # Update the emergency status based on the result.
    if result["status"] == "sent":
        ev.status = "sent"
    elif result["status"] == "simulated":
        ev.status = "simulated_completed"
    else:
        ev.status = "failed"

    ev.note = result.get("note", "")
    ev.updated_at = utc_now()

    db.commit()
    db.refresh(ev)

    return ev


def cancel_emergency(db: Session, event_id: str) -> EmergencyEvent:
    ev = db.get(EmergencyEvent, event_id)
    if ev is None:
        raise HTTPException(404, "Emergency event not found")
    if ev.status != "awaiting_confirmation":
        raise HTTPException(409, f"This emergency event is '{ev.status}' and cannot be cancelled.")
    ev.status = "cancelled"
    ev.note = "Cancelled before any action. Nothing was sent."
    ev.updated_at = utc_now()
    db.commit()
    return ev


# ---------------------------------------------------------------- serializers and snapshots
def serialize_medicine(med: Medicine) -> dict:
    return {
        "id": med.id,
        "name": med.name,
        "identifier": med.identifier,
        "instructions": med.instructions or "",
        "frequency": med.frequency,
        "startDate": med.start_date,
        "endDate": med.end_date,
        "times": sorted(t.time_of_day for t in med.times),
        "compartment": med.compartment,
        "reminderEnabled": med.reminder_enabled,
        "reminderLeadMinutes": med.reminder_lead_minutes,
        "active": med.active,
        "source": med.source,
    }


def serialize_dose(dose: Dose, lead_minutes: int, now: datetime) -> dict:
    return {
        "id": dose.id,
        "medicineId": dose.medicine_id,
        "medicineName": dose.medicine_name,
        "compartment": dose.compartment,
        "scheduledAt": iso(dose.scheduled_at),
        "status": dose.status,
        "isDue": is_due(dose, lead_minutes, now),
        "source": dose.source,
    }


def build_events(db: Session, limit: int = 30) -> list[dict]:
    items = [
        {"id": f"dose-event-{e.id}", "at": iso(e.created_at), "kind": "medicine", "message": e.message}
        for e in db.query(DoseEvent).order_by(DoseEvent.created_at.desc()).limit(limit).all()
    ]
    items += [
        {"id": f"emergency-{e.id}", "at": iso(e.created_at), "kind": "emergency",
         "message": f"Emergency event: {e.status.replace('_', ' ')}"}
        for e in db.query(EmergencyEvent).order_by(EmergencyEvent.created_at.desc()).limit(10).all()
    ]
    items.sort(key=lambda item: item["at"], reverse=True)
    return items[:limit]


def device_payload(db: Session) -> dict:
    adapter = get_adapter()
    status = adapter.get_status()
    hardware = adapter.get_compartments()
    assigned = {m.compartment: m.id for m in db.query(Medicine).filter(Medicine.active.is_(True)).all()}
    compartments = [
        {"id": cid, "medicineId": assigned.get(cid), "status": hardware.get(cid, "fault")}
        for cid in sorted(hardware)
    ]
    running = db.query(DeviceCommand).filter(DeviceCommand.status == "dispensing").first()
    return {**status, "compartments": compartments,
            "activeCommand": serialize_command(running) if running else None}


def build_snapshot(db: Session) -> dict:
    refresh_state(db)
    now = utc_now()
    settings = get_settings(db)
    lead = int(settings["reminderLeadMinutes"])
    medicines = db.query(Medicine).order_by(Medicine.name).all()
    doses = (
        db.query(Dose)
        .filter(Dose.scheduled_at >= now - timedelta(days=7), Dose.scheduled_at <= now + timedelta(days=2))
        .order_by(Dose.scheduled_at)
        .all()
    )
    return {
        "serverTime": iso(now),
        "medicines": [serialize_medicine(m) for m in medicines],
        "doses": [serialize_dose(d, lead, now) for d in doses],
        "events": build_events(db),
        "device": device_payload(db),
        "settings": settings,
    }


def dashboard_metrics(db: Session) -> dict:
    refresh_state(db)
    now = utc_now()
    today = local_today()
    doses = db.query(Dose).all()
    todays = [d for d in doses if local_date_of(d.scheduled_at) == today]
    week = [d for d in doses if now - timedelta(days=7) <= d.scheduled_at <= now]
    taken_week = sum(1 for d in week if d.status == "taken")
    missed_week = sum(1 for d in week if d.status == "missed")
    adherence = round(100 * taken_week / (taken_week + missed_week)) if (taken_week + missed_week) else None
    return {
        "date": today.isoformat(),
        "total": len(todays),
        "taken": sum(1 for d in todays if d.status == "taken"),
        "missed": sum(1 for d in todays if d.status == "missed"),
        "pending": sum(1 for d in todays if d.status not in ("taken", "missed")),
        "adherence7d": adherence,
    }
