from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ── Doctor ────────────────────────────────────────────────────────────────────

class DoctorCreate(BaseModel):
    full_name: str
    email: EmailStr
    role: str = "medicine_specialist"    # intern_doctor | medicine_specialist | specialist
    specialization: Optional[str] = None


class DoctorOut(BaseModel):
    doctor_id: str
    full_name: str
    email: str
    role: str = "medicine_specialist"
    specialization: Optional[str] = None
    is_online: bool
    created_at: datetime


class DoctorCreatedResponse(BaseModel):
    doctor: DoctorOut
    plain_password: str          # returned once at creation
    email_sent: bool


# ── Health Worker ─────────────────────────────────────────────────────────────

class HealthWorkerCreate(BaseModel):
    full_name: str
    email: EmailStr
    sub_role: Optional[str] = "Reception"
    designation: Optional[str] = None


class HealthWorkerOut(BaseModel):
    worker_id: str
    full_name: str
    email: str
    sub_role: str = "Reception"
    designation: Optional[str]
    is_online: bool
    created_at: datetime


class HealthWorkerCreatedResponse(BaseModel):
    worker: HealthWorkerOut
    plain_password: str
    email_sent: bool


# ── Endpoint Device ───────────────────────────────────────────────────────────

class EndpointDeviceCreate(BaseModel):
    device_name: str
    location: Optional[str] = None


class EndpointDeviceOut(BaseModel):
    device_id: str
    device_name: str
    location: Optional[str]
    is_active: bool
    is_online: bool = False
    created_at: datetime


class EndpointDeviceCreatedResponse(BaseModel):
    device: EndpointDeviceOut
    plain_password: str
