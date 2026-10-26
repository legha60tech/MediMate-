"""Database tables. Timestamps are stored as naive UTC datetimes."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    identifier: Mapped[str | None] = mapped_column(String(40), nullable=True)
    instructions: Mapped[str] = mapped_column(Text, default="")
    frequency: Mapped[str] = mapped_column(String(40), default="Daily")
    start_date: Mapped[str] = mapped_column(String(10))
    end_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    compartment: Mapped[int] = mapped_column(Integer)
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_lead_minutes: Mapped[int] = mapped_column(Integer, default=5)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(16), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    times: Mapped[list["MedicineTime"]] = relationship(
        back_populates="medicine",
        cascade="all, delete-orphan",
        order_by="MedicineTime.time_of_day",
        lazy="selectin",
    )


class MedicineTime(Base):
    __tablename__ = "medicine_times"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    medicine_id: Mapped[str] = mapped_column(ForeignKey("medicines.id", ondelete="CASCADE"), index=True)
    time_of_day: Mapped[str] = mapped_column(String(5))

    medicine: Mapped[Medicine] = relationship(back_populates="times")


class Dose(Base):
    """One scheduled dose. status follows the state machine in services.ALLOWED_TRANSITIONS."""

    __tablename__ = "doses"
    __table_args__ = (UniqueConstraint("medicine_id", "scheduled_at", name="uq_dose_medicine_time"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    medicine_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    medicine_name: Mapped[str] = mapped_column(String(80))
    compartment: Mapped[int] = mapped_column(Integer)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    status: Mapped[str] = mapped_column(String(32), default="scheduled", index=True)
    source: Mapped[str] = mapped_column(String(16), default="user")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DoseEvent(Base):
    """Append-only audit log of everything that happened to a dose."""

    __tablename__ = "dose_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dose_id: Mapped[str] = mapped_column(String(36), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DeviceCommand(Base):
    """A dispense command. Its command_id is unique, so retries can be recognised."""

    __tablename__ = "device_commands"

    command_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dose_id: Mapped[str] = mapped_column(String(36), index=True)
    compartment: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(20), default="dispense")
    status: Mapped[str] = mapped_column(String(24), default="dispensing")
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class EmergencyEvent(Base):
    """An emergency intent. Recording an intent never places a call by itself."""

    __tablename__ = "emergency_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32))
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    caretaker_name: Mapped[str] = mapped_column(String(80))
    caretaker_phone_masked: Mapped[str] = mapped_column(String(24))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text)
