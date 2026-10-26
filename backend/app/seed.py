"""DEMONSTRATION DATA ONLY. Medicine names are placeholders and instructions are not dosage advice."""
import uuid
from datetime import timedelta

from sqlalchemy.orm import Session

from . import services
from .models import Dose, DoseEvent, Medicine, MedicineTime

PLACEHOLDER = "Placeholder: enter the instructions from your prescription here."

DEMO_MEDICINES = [
    {"id": "demo-med-1", "name": "Demo Medicine A", "identifier": "DEMO-A-001",
     "times": ["08:00", "14:00", "21:00"], "compartment": 1, "frequency": "Three times daily"},
    {"id": "demo-med-2", "name": "Demo Medicine B", "identifier": "DEMO-B-002",
     "times": ["09:00", "21:00"], "compartment": 2, "frequency": "Twice daily"},
    {"id": "demo-med-3", "name": "Demo Medicine C", "identifier": "DEMO-C-003",
     "times": ["20:00"], "compartment": 3, "frequency": "Daily"},
]


def seed_demo(db: Session) -> None:
    """Seed one week of history plus today's and tomorrow's doses, only when the database is empty."""
    if db.query(Medicine).count() > 0:
        return
    now = services.utc_now()
    today = services.local_today()
    start = (today - timedelta(days=7)).isoformat()

    for mi, spec in enumerate(DEMO_MEDICINES):
        med = Medicine(
            id=spec["id"], name=spec["name"], identifier=spec["identifier"], instructions=PLACEHOLDER,
            frequency=spec["frequency"], start_date=start, end_date=None, compartment=spec["compartment"],
            reminder_enabled=True, reminder_lead_minutes=5, active=True, source="demo", created_at=now,
        )
        med.times = [MedicineTime(time_of_day=t) for t in spec["times"]]
        db.add(med)
        db.flush()

        for offset in range(-6, 2):
            day = today + timedelta(days=offset)
            for ti, hhmm in enumerate(spec["times"]):
                at = services.local_to_utc(day, hhmm)
                if at <= now:
                    # Deterministic demo history: roughly one in nine past doses is missed.
                    status = "missed" if ((offset + 10) * 7 + mi * 3 + ti) % 9 == 4 else "taken"
                else:
                    status = "scheduled"
                dose_id = str(uuid.uuid4())
                db.add(Dose(id=dose_id, medicine_id=med.id, medicine_name=med.name, compartment=med.compartment,
                            scheduled_at=at, status=status, source="demo", updated_at=at))
                if status in ("taken", "missed"):
                    label = "Dose confirmed taken" if status == "taken" else "Dose missed"
                    db.add(DoseEvent(dose_id=dose_id, event_type="confirmed_taken" if status == "taken" else "missed",
                                     source="demo", message=f"{label}: {med.name} (demo history)", created_at=at))
    db.commit()
