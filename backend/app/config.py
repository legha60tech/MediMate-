"""Configuration loaded from environment variables (and an optional backend/.env file)."""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DATABASE_URL = os.getenv(
    "MEDIMATE_DATABASE_URL",
    f"sqlite:///{(BACKEND_DIR / 'medimate.db').as_posix()}",
)

# "simulation" (default) or "live".
# Live mode is not implemented in this prototype.
DEVICE_MODE = os.getenv("MEDIMATE_DEVICE_MODE", "simulation").lower()

SEED_DEMO = os.getenv("MEDIMATE_SEED_DEMO", "true").lower() == "true"
ENABLE_DEMO_CLOCK = (
    os.getenv("MEDIMATE_ENABLE_DEMO_CLOCK", "true").lower() == "true"
)

OVERDUE_GRACE_MINUTES = int(
    os.getenv("MEDIMATE_OVERDUE_GRACE_MINUTES", "30")
)
DISPENSE_EARLY_MINUTES = int(
    os.getenv("MEDIMATE_DISPENSE_EARLY_MINUTES", "60")
)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "MEDIMATE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

# Twilio emergency voice call configuration
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
MEDIMATE_EMERGENCY_PHONE = os.getenv("MEDIMATE_EMERGENCY_PHONE", "")
EMERGENCY_CALL_MODE = os.getenv("MEDIMATE_EMERGENCY_MODE", "simulation").lower()