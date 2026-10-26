"""Request validation. Input accepts camelCase (from the frontend) or snake_case."""
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
PHONE_PATTERN = re.compile(r"^\+?[0-9][0-9 \-()]{6,18}$")


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MedicineIn(CamelModel):
    name: str = Field(min_length=1, max_length=80)
    identifier: str | None = Field(default=None, max_length=40)
    instructions: str = Field(default="", max_length=500)
    frequency: Literal["Daily", "Twice daily", "Three times daily", "Custom times"] = "Daily"
    start_date: date
    end_date: date | None = None
    times: list[str] = Field(min_length=1, max_length=8)
    compartment: int = Field(ge=1, le=4)
    reminder_enabled: bool = True
    reminder_lead_minutes: int = Field(default=5, ge=0, le=60)
    active: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Medicine name is required")
        return value

    @field_validator("identifier")
    @classmethod
    def clean_identifier(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("times")
    @classmethod
    def check_times(cls, values: list[str]) -> list[str]:
        cleaned = []
        for raw in values:
            value = raw.strip()
            if not TIME_PATTERN.match(value):
                raise ValueError(f"'{raw}' is not a valid 24-hour time (use HH:MM)")
            cleaned.append(value)
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Each scheduled time must be different")
        return sorted(cleaned)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date")
        return self


class SettingsIn(CamelModel):
    voice_enabled: bool = True
    speech_rate: float = Field(default=1.0, ge=0.5, le=2.0)
    voice_name: str = Field(default="", max_length=100)
    caretaker_name: str = Field(default="", max_length=80)
    caretaker_phone: str = Field(default="", max_length=24)
    emergency_countdown_seconds: int = Field(default=10, ge=3, le=60)
    reminder_lead_minutes: int = Field(default=5, ge=0, le=60)

    @field_validator("caretaker_phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        value = value.strip()
        if value and not PHONE_PATTERN.match(value):
            raise ValueError("Phone number must have 7 to 19 digits (spaces, dashes, brackets and a leading + are allowed)")
        return value

    @field_validator("caretaker_name")
    @classmethod
    def clean_caretaker(cls, value: str) -> str:
        return value.strip()


class DispenseIn(CamelModel):
    # Only the dose is accepted. The server chooses the compartment, so clients cannot pick a motor.
    dose_id: str = Field(min_length=1, max_length=36)


class DeviceSimulationIn(CamelModel):
    dispense_seconds: float | None = Field(default=None, ge=0.5, le=30)
    fail_next_dispense: bool | None = None


class EmergencyIntentIn(CamelModel):
    source: Literal["voice", "button"] = "button"
    transcript: str = Field(default="", max_length=300)
