from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import List

ONLINE_TIMEOUT_MINUTES = 5

def _is_actually_online(entity) -> bool:
    if not entity.is_online:
        return False
    if not getattr(entity, 'last_seen_at', None):
        return False
    return datetime.utcnow() - entity.last_seen_at < timedelta(minutes=ONLINE_TIMEOUT_MINUTES)

from app.models.admin import Admin
from app.models.care_hub import CareHub
from app.models.doctor import Doctor
from app.schemas.staff import DoctorCreate, DoctorOut, DoctorCreatedResponse
from app.dependencies.auth import get_current_admin
from app.core.security import hash_password, generate_id, generate_password
from app.services.email_service import send_email, staff_credentials_email

router = APIRouter(prefix="/doctors", tags=["Doctors"])


async def _unique_doctor_id() -> str:
    for _ in range(10):
        did = generate_id("DOC")
        if not await Doctor.find_one(Doctor.doctor_id == did):
            return did
    raise HTTPException(500, "Could not generate unique Doctor ID")


@router.get("", response_model=List[DoctorOut])
async def list_doctors(admin: Admin = Depends(get_current_admin)):
    if not admin.care_hub_id:
        raise HTTPException(400, "No Care Hub created yet")
    docs = await Doctor.find(Doctor.care_hub_id == admin.care_hub_id).to_list()
    return [
        DoctorOut(
            doctor_id=d.doctor_id, full_name=d.full_name, email=d.email,
            specialization=d.specialization, is_online=_is_actually_online(d), created_at=d.created_at,
        )
        for d in docs
    ]


@router.post("", response_model=DoctorCreatedResponse, status_code=201)
async def create_doctor(
    data: DoctorCreate,
    admin: Admin = Depends(get_current_admin),
):
    if not admin.care_hub_id:
        raise HTTPException(400, "Create a Care Hub first")

    # Check duplicate email within hub
    if await Doctor.find_one(Doctor.email == data.email):
        raise HTTPException(400, "A doctor with this email already exists")

    hub = await CareHub.get(admin.care_hub_id)
    did      = await _unique_doctor_id()
    password = generate_password()

    doctor = Doctor(
        doctor_id=did,
        password_hash=hash_password(password),
        full_name=data.full_name,
        email=data.email,
        specialization=data.specialization,
        care_hub_id=admin.care_hub_id,
    )
    await doctor.insert()

    email_html = staff_credentials_email(
        full_name=data.full_name,
        staff_id=did,
        plain_password=password,
        role="Doctor",
        hub_name=hub.name if hub else "Your Hub",
    )
    sent = await send_email(data.email, "Your Astra Login Credentials", email_html)

    return DoctorCreatedResponse(
        doctor=DoctorOut(
            doctor_id=did, full_name=data.full_name, email=data.email,
            specialization=data.specialization, is_online=False, created_at=doctor.created_at,
        ),
        plain_password=password,
        email_sent=sent,
    )


@router.delete("/{doctor_id}", status_code=204)
async def delete_doctor(doctor_id: str, admin: Admin = Depends(get_current_admin)):
    doctor = await Doctor.find_one(Doctor.doctor_id == doctor_id)
    if not doctor or doctor.care_hub_id != admin.care_hub_id:
        raise HTTPException(404, "Doctor not found")
    await doctor.delete()
