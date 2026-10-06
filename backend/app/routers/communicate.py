from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.models.admin import Admin
from app.models.doctor import Doctor
from app.models.health_worker import HealthWorker
from app.schemas.communicate import EmailSend, EmailResult
from app.dependencies.auth import get_current_admin
from app.services.email_service import send_email

router = APIRouter(prefix="/communicate", tags=["Communicate"])


@router.post("/send", response_model=EmailResult)
async def send_to_staff(
    data: EmailSend,
    admin: Admin = Depends(get_current_admin),
):
    if not admin.care_hub_id:
        raise HTTPException(400, "No Care Hub")

    sent = 0
    failed = 0

    for staff_id in data.to_ids:
        # Try doctor first, then worker
        person = await Doctor.find_one(
            Doctor.doctor_id == staff_id,
            Doctor.care_hub_id == admin.care_hub_id,
        ) or await HealthWorker.find_one(
            HealthWorker.worker_id == staff_id,
            HealthWorker.care_hub_id == admin.care_hub_id,
        )

        if person:
            body = f"""
            <div style="font-family:Arial,sans-serif;padding:24px;">
              <h2 style="color:#0a0a0a;">Message from Admin</h2>
              <p style="color:#404040;"><strong>Subject:</strong> {data.subject}</p>
              <hr style="border-color:#e5e5e5;"/>
              <p style="color:#404040;white-space:pre-wrap;">{data.message}</p>
            </div>
            """
            ok = await send_email(person.email, data.subject, body)
            if ok:
                sent += 1
            else:
                failed += 1
        else:
            failed += 1

    return EmailResult(sent=sent, failed=failed)


@router.get("/recipients")
async def get_recipients(admin: Admin = Depends(get_current_admin)):
    """Return list of all staff (doctors + workers) for recipient selector."""
    if not admin.care_hub_id:
        return {"recipients": []}

    doctors = await Doctor.find(Doctor.care_hub_id == admin.care_hub_id).to_list()
    workers = await HealthWorker.find(HealthWorker.care_hub_id == admin.care_hub_id).to_list()

    recipients = [
        {"id": d.doctor_id, "name": d.full_name, "email": d.email, "role": "Doctor"}
        for d in doctors
    ] + [
        {"id": w.worker_id, "name": w.full_name, "email": w.email, "role": "Health Worker"}
        for w in workers
    ]
    return {"recipients": recipients}
