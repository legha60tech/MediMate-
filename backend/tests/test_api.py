"""Workflow tests for the MediMate backend. Run from the backend folder: python -m pytest -q"""
import os
import sys
import tempfile
import time
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "medimate_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["MEDIMATE_DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["MEDIMATE_SEED_DEMO"] = "true"
os.environ["MEDIMATE_DEVICE_MODE"] = "simulation"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def wait_until_idle(client, timeout=8):
    end = time.time() + timeout
    status = client.get("/api/device/status").json()
    while status["activeCommand"] is not None and time.time() < end:
        time.sleep(0.1)
        status = client.get("/api/device/status").json()
    return status


def dose_by_id(client, dose_id):
    return next(d for d in client.get("/api/bootstrap").json()["doses"] if d["id"] == dose_id)


def test_health_reports_simulation(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["deviceMode"] == "simulation"


def test_bootstrap_contains_demo_schedule(client):
    body = client.get("/api/bootstrap").json()
    assert len(body["medicines"]) >= 3
    assert any(d["status"] == "taken" for d in body["doses"])
    assert body["device"]["mode"] == "simulation"
    assert body["device"]["connected"] is True


def test_medicine_validation_errors(client):
    base = {"name": "Test", "startDate": "2026-10-24", "times": ["08:00"], "compartment": 4}
    bad_time = client.post("/api/medicines", json={**base, "times": ["25:00"]})
    assert bad_time.status_code == 422
    assert "HH:MM" in bad_time.json()["detail"][0]["message"]

    bad_dates = client.post("/api/medicines", json={**base, "endDate": "2026-10-01"})
    assert bad_dates.status_code == 422

    bad_compartment = client.post("/api/medicines", json={**base, "compartment": 9})
    assert bad_compartment.status_code == 422


def test_compartment_conflict_is_rejected(client):
    body = {"name": "Conflict", "startDate": "2026-10-24", "times": ["07:00"], "compartment": 1}
    assert client.post("/api/medicines", json=body).status_code == 409


def test_create_update_delete_medicine(client):
    body = {"name": "Temporary Test Medicine", "startDate": "2026-10-01", "times": ["07:30"], "compartment": 4}
    created = client.post("/api/medicines", json=body)
    assert created.status_code == 201
    med_id = created.json()["id"]

    body["name"] = "Renamed Test Medicine"
    updated = client.put(f"/api/medicines/{med_id}", json=body)
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed Test Medicine"

    deleted = client.delete(f"/api/medicines/{med_id}")
    assert deleted.status_code == 200
    assert client.delete(f"/api/medicines/{med_id}").status_code == 404


def test_settings_phone_validation(client):
    settings = client.get("/api/settings").json()
    settings["caretakerPhone"] = "abc"
    assert client.put("/api/settings", json=settings).status_code == 422


def test_emergency_requires_caretaker_and_never_places_real_call(client):
    settings = client.get("/api/settings").json()
    settings["caretakerPhone"] = ""
    client.put("/api/settings", json=settings)
    assert client.post("/api/emergency/intent", json={"source": "button"}).status_code == 409

    settings["caretakerName"] = "Test Caretaker"
    settings["caretakerPhone"] = "+91 98765 43210"
    assert client.put("/api/settings", json=settings).status_code == 200

    intent = client.post("/api/emergency/intent", json={"source": "voice", "transcript": "emergency call"})
    assert intent.status_code == 201
    event = intent.json()
    assert event["status"] == "awaiting_confirmation"
    assert event["caretakerPhoneMasked"].endswith("3210")
    assert "3210" in event["caretakerPhoneMasked"] and "98765" not in event["caretakerPhoneMasked"]

    confirmed = client.post(f"/api/emergency/{event['id']}/confirm").json()
    assert confirmed["status"] == "simulated_completed"
    assert "No real call" in confirmed["note"]


def test_emergency_cancel(client):
    client.post("/api/emergency/intent", json={"source": "button"})
    waiting = next(e for e in client.get("/api/emergency/events").json() if e["status"] == "awaiting_confirmation")
    cancelled = client.post(f"/api/emergency/{waiting['id']}/cancel").json()
    assert cancelled["status"] == "cancelled"


def test_dispense_flow_duplicate_protection_and_confirmation(client):
    client.put("/api/settings", json={**client.get("/api/settings").json(), "reminderLeadMinutes": 5})
    client.post("/api/device/simulation", json={"dispenseSeconds": 0.5, "failNextDispense": False})
    assert client.post("/api/demo/advance-to-next-dose").status_code == 200

    due = [d for d in client.get("/api/bootstrap").json()["doses"] if d["isDue"] and d["status"] == "scheduled"]
    assert due, "advancing the demo clock should make a dose due"
    dose = due[0]

    first = client.post("/api/dispenser/dispense", json={"doseId": dose["id"]})
    assert first.status_code == 200
    command_id = first.json()["command"]["commandId"]
    assert first.json()["alreadyInProgress"] is False

    second = client.post("/api/dispenser/dispense", json={"doseId": dose["id"]})
    assert second.json()["alreadyInProgress"] is True
    assert second.json()["command"]["commandId"] == command_id

    status = wait_until_idle(client)
    assert status["activeCommand"] is None
    assert dose_by_id(client, dose["id"])["status"] == "awaiting_confirmation"

    confirmed = client.post(f"/api/doses/{dose['id']}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "taken"

    again = client.post("/api/dispenser/dispense", json={"doseId": dose["id"]})
    assert again.status_code == 409


def test_failed_dispense_can_be_retried(client):
    client.post("/api/device/simulation", json={"dispenseSeconds": 0.5, "failNextDispense": True})
    assert client.post("/api/demo/advance-to-next-dose").status_code == 200
    due = [d for d in client.get("/api/bootstrap").json()["doses"] if d["isDue"] and d["status"] == "scheduled"]
    dose = due[0]

    failed = client.post("/api/dispenser/dispense", json={"doseId": dose["id"]}).json()
    assert failed["command"]["status"] == "failed"
    assert "jam" in failed["command"]["failureReason"].lower()
    assert dose_by_id(client, dose["id"])["status"] == "failed"

    retry = client.post("/api/dispenser/dispense", json={"doseId": dose["id"]})
    assert retry.status_code == 200
    assert retry.json()["command"]["status"] == "dispensing"
    wait_until_idle(client)
    assert dose_by_id(client, dose["id"])["status"] == "awaiting_confirmation"


def test_dispense_request_cannot_choose_compartment(client):
    # The request body only accepts a dose ID. Extra fields are ignored, so a client cannot pick a motor.
    response = client.post("/api/dispenser/dispense", json={"doseId": "does-not-exist", "compartment": 2})
    assert response.status_code == 404


def test_reset_clock_returns_to_real_time(client):
    body = client.post("/api/demo/reset-clock").json()
    assert body["clockOffsetSeconds"] == 0
