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
from app.models.health_worker import HealthWorker
from app.schemas.staff import HealthWorkerCreate, HealthWorkerOut, HealthWorkerCreatedResponse
from app.dependencies.auth import get_current_admin
from app.core.security import hash_password, generate_id, generate_password
from app.services.email_service import send_email, staff_credentials_email

router = APIRouter(prefix="/health-workers", tags=["Health Workers"])


async def _unique_worker_id(sub_role: str = "Reception") -> str:
    prefix_map = {
        "Reception": "REC",
        "Verification": "VER",
        "Dispensing": "DIS",
    }
    prefix = prefix_map.get(sub_role, "HW")
    for _ in range(10):
        wid = generate_id(prefix)
        if not await HealthWorker.find_one(HealthWorker.worker_id == wid):
            return wid
    raise HTTPException(500, f"Could not generate unique {sub_role} Worker ID")


@router.get("", response_model=List[HealthWorkerOut])
async def list_workers(admin: Admin = Depends(get_current_admin)):
    if not admin.care_hub_id:
        raise HTTPException(400, "No Care Hub created yet")
    workers = await HealthWorker.find(HealthWorker.care_hub_id == admin.care_hub_id).to_list()
    return [
        HealthWorkerOut(
            worker_id=w.worker_id, full_name=w.full_name, email=w.email,
            sub_role=w.sub_role, designation=w.designation,
            is_online=_is_actually_online(w), created_at=w.created_at,
        )
        for w in workers
    ]


@router.post("", response_model=HealthWorkerCreatedResponse, status_code=201)
async def create_worker(
    data: HealthWorkerCreate,
    admin: Admin = Depends(get_current_admin),
):
    if not admin.care_hub_id:
        raise HTTPException(400, "Create a Care Hub first")

    if await HealthWorker.find_one(HealthWorker.email == data.email):
        raise HTTPException(400, "A health worker with this email already exists")

    hub = await CareHub.get(admin.care_hub_id)
    sub_role = data.sub_role or "Reception"
    wid      = await _unique_worker_id(sub_role)
    password = generate_password()

    worker = HealthWorker(
        worker_id=wid,
        password_hash=hash_password(password),
        full_name=data.full_name,
        email=data.email,
        sub_role=sub_role,
        designation=data.designation,
        care_hub_id=admin.care_hub_id,
    )
    await worker.insert()

    email_html = staff_credentials_email(
        full_name=data.full_name,
        staff_id=wid,
        plain_password=password,
        role="Health Worker",
        hub_name=hub.name if hub else "Your Hub",
    )
    sent = await send_email(data.email, "Your Astra Login Credentials", email_html)

    return HealthWorkerCreatedResponse(
        worker=HealthWorkerOut(
            worker_id=wid, full_name=data.full_name, email=data.email,
            designation=data.designation, is_online=False, created_at=worker.created_at,
        ),
        plain_password=password,
        email_sent=sent,
    )


@router.delete("/{worker_id}", status_code=204)
async def delete_worker(worker_id: str, admin: Admin = Depends(get_current_admin)):
    worker = await HealthWorker.find_one(HealthWorker.worker_id == worker_id)
    if not worker or worker.care_hub_id != admin.care_hub_id:
        raise HTTPException(404, "Health worker not found")
    await worker.delete()
