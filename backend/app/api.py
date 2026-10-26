"""REST routes. All JSON uses camelCase keys so the frontend can consume them directly."""
import uuid
from datetime import date as date_type
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from . import config, services
from .database import get_db
from .device import DeviceError, get_adapter
from .models import DeviceCommand, Dose, EmergencyEvent, Medicine, MedicineTime
from .schemas import DeviceSimulationIn, DispenseIn, EmergencyIntentIn, MedicineIn, SettingsIn

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- system
@router.get("/health")
def health():
    return {
        "status": "ok",
        "deviceMode": config.DEVICE_MODE,
        "emergencyCallMode": config.EMERGENCY_CALL_MODE,
        "serverTime": services.iso(services.utc_now()),
        "demoClockEnabled": config.ENABLE_DEMO_CLOCK,
        "demoClockOffsetSeconds": services.clock_offset_seconds(),
    }


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db)):
    return services.build_snapshot(db)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return services.dashboard_metrics(db)


@router.get("/events")
def events(limit: int = Query(30, ge=1, le=200), db: Session = Depends(get_db)):
    return services.build_events(db, limit)


# ---------------------------------------------------------------- medicines
def _check_compartment(db: Session, compartment: int, exclude_id: str | None = None) -> None:
    query = db.query(Medicine).filter(Medicine.compartment == compartment, Medicine.active.is_(True))
    if exclude_id:
        query = query.filter(Medicine.id != exclude_id)
    other = query.first()
    if other:
        raise HTTPException(409, f"Compartment {compartment} is already assigned to '{other.name}'. Choose another compartment.")


def _apply_medicine(med: Medicine, data: MedicineIn) -> None:
    med.name = data.name
    med.identifier = data.identifier
    med.instructions = data.instructions
    med.frequency = data.frequency
    med.start_date = data.start_date.isoformat()
    med.end_date = data.end_date.isoformat() if data.end_date else None
    med.compartment = data.compartment
    med.reminder_enabled = data.reminder_enabled
    med.reminder_lead_minutes = data.reminder_lead_minutes
    med.active = data.active
    med.times = [MedicineTime(time_of_day=t) for t in data.times]


@router.get("/medicines")
def list_medicines(db: Session = Depends(get_db)):
    return [services.serialize_medicine(m) for m in db.query(Medicine).order_by(Medicine.name).all()]


@router.post("/medicines", status_code=201)
def create_medicine(payload: MedicineIn, db: Session = Depends(get_db)):
    if payload.active:
        _check_compartment(db, payload.compartment)
    med = Medicine(id=str(uuid.uuid4()), source="user", created_at=services.utc_now())
    _apply_medicine(med, payload)
    db.add(med)
    db.flush()
    services.ensure_doses(db)
    db.commit()
    return services.serialize_medicine(med)


@router.put("/medicines/{medicine_id}")
def update_medicine(medicine_id: str, payload: MedicineIn, db: Session = Depends(get_db)):
    med = db.get(Medicine, medicine_id)
    if med is None:
        raise HTTPException(404, "Medicine not found")
    if payload.active:
        _check_compartment(db, payload.compartment, exclude_id=med.id)
    now = services.utc_now()
    # Future scheduled doses are rebuilt from the new settings. History is kept.
    db.query(Dose).filter(Dose.medicine_id == med.id, Dose.status == "scheduled", Dose.scheduled_at > now) \
        .delete(synchronize_session=False)
    _apply_medicine(med, payload)
    db.query(Dose).filter(Dose.medicine_id == med.id) \
        .update({Dose.medicine_name: payload.name, Dose.compartment: payload.compartment}, synchronize_session=False)
    db.flush()
    services.ensure_doses(db)
    db.commit()
    db.refresh(med)
    return services.serialize_medicine(med)


@router.delete("/medicines/{medicine_id}")
def delete_medicine(medicine_id: str, db: Session = Depends(get_db)):
    med = db.get(Medicine, medicine_id)
    if med is None:
        raise HTTPException(404, "Medicine not found")
    now = services.utc_now()
    db.query(Dose).filter(Dose.medicine_id == med.id, Dose.status == "scheduled", Dose.scheduled_at > now) \
        .delete(synchronize_session=False)
    db.query(Dose).filter(Dose.medicine_id == med.id).update({Dose.medicine_id: None}, synchronize_session=False)
    db.delete(med)
    db.commit()
    return {"deleted": medicine_id, "historyKept": True}


# ---------------------------------------------------------------- doses
@router.get("/doses")
def list_doses(day: str | None = Query(default=None, alias="date"), db: Session = Depends(get_db)):
    try:
        target = date_type.fromisoformat(day) if day else services.local_today()
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")
    now = services.utc_now()
    lead = int(services.get_settings(db)["reminderLeadMinutes"])
    doses = db.query(Dose).order_by(Dose.scheduled_at).all()
    return [services.serialize_dose(d, lead, now) for d in doses if services.local_date_of(d.scheduled_at) == target]


@router.post("/doses/{dose_id}/confirm")
def confirm_dose(dose_id: str, db: Session = Depends(get_db)):
    dose = services.confirm_taken(db, dose_id)
    lead = int(services.get_settings(db)["reminderLeadMinutes"])
    return services.serialize_dose(dose, lead, services.utc_now())


# ---------------------------------------------------------------- dispenser
@router.post("/dispenser/dispense")
def dispense(payload: DispenseIn, db: Session = Depends(get_db)):
    return services.dispense_dose(db, payload.dose_id, source="user")


@router.get("/dispenser/commands/{command_id}")
def get_command(command_id: str, db: Session = Depends(get_db)):
    cmd = db.get(DeviceCommand, command_id)
    if cmd is None:
        raise HTTPException(404, "Command not found")
    return services.serialize_command(cmd)


@router.post("/dispenser/commands/{command_id}/stop")
def stop_command(command_id: str, db: Session = Depends(get_db)):
    return services.stop_dispense(db, command_id)


# ---------------------------------------------------------------- device
@router.get("/device/status")
def device_status(db: Session = Depends(get_db)):
    services.sync_device(db)
    db.commit()
    return services.device_payload(db)


@router.post("/device/simulation")
def device_simulation(payload: DeviceSimulationIn, db: Session = Depends(get_db)):
    try:
        get_adapter().configure_simulation(
            dispense_seconds=payload.dispense_seconds, fail_next_dispense=payload.fail_next_dispense
        )
    except DeviceError as exc:
        raise HTTPException(409, str(exc))
    return services.device_payload(db)


@router.post("/device/test-connection")
def test_connection():
    return get_adapter().test_connection()


# ---------------------------------------------------------------- demo clock
@router.post("/demo/advance-to-next-dose")
def advance_to_next_dose(db: Session = Depends(get_db)):
    if not config.ENABLE_DEMO_CLOCK:
        raise HTTPException(403, "The demo clock is disabled in this configuration.")
    now = services.utc_now()
    nxt = (
        db.query(Dose)
        .filter(Dose.status == "scheduled", Dose.scheduled_at > now)
        .order_by(Dose.scheduled_at)
        .first()
    )
    if nxt is None:
        raise HTTPException(404, "No upcoming scheduled dose to advance to.")
    target = max(nxt.scheduled_at - timedelta(minutes=2), now)
    services.set_clock_offset(target - services.real_utc_now())
    services.refresh_state(db)
    return {"advancedTo": services.iso(target), "nextDoseId": nxt.id,
            "clockOffsetSeconds": services.clock_offset_seconds()}


@router.post("/demo/reset-clock")
def reset_clock(db: Session = Depends(get_db)):
    services.set_clock_offset(timedelta(0))
    services.refresh_state(db)
    return {"clockOffsetSeconds": 0}


# ---------------------------------------------------------------- emergency
@router.post("/emergency/intent", status_code=201)
def emergency_intent(payload: EmergencyIntentIn, db: Session = Depends(get_db)):
    return services.serialize_emergency(services.create_emergency(db, payload.source, payload.transcript))


@router.get("/emergency/events")
def emergency_events(db: Session = Depends(get_db)):
    rows = db.query(EmergencyEvent).order_by(EmergencyEvent.created_at.desc()).limit(20).all()
    return [services.serialize_emergency(e) for e in rows]


@router.post("/emergency/{event_id}/confirm")
def emergency_confirm(event_id: str, db: Session = Depends(get_db)):
    return services.serialize_emergency(services.confirm_emergency(db, event_id))


@router.post("/emergency/{event_id}/cancel")
def emergency_cancel(event_id: str, db: Session = Depends(get_db)):
    return services.serialize_emergency(services.cancel_emergency(db, event_id))


# ---------------------------------------------------------------- settings
@router.get("/settings")
def read_settings(db: Session = Depends(get_db)):
    return services.get_settings(db)


@router.put("/settings")
def write_settings(payload: SettingsIn, db: Session = Depends(get_db)):
    return services.save_settings(db, payload)
