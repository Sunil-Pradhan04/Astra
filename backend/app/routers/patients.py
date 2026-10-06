import random
import string
from fastapi import APIRouter, HTTPException, Query, Header, Depends
from typing import List, Optional

from app.models.patient import Patient
from app.models.health_worker import HealthWorker
from app.schemas.patient import PatientIntakeCreate, PatientOut

router = APIRouter(prefix="/patients", tags=["Patients & Queue"])


async def _unique_patient_id(care_hub_id: str) -> str:
    count = await Patient.count()
    for offset in range(1, 10000):
        pid = f"P-{(count + offset):04d}"
        if not await Patient.find_one(Patient.patient_id == pid):
            return pid
    # Fallback to random 4-digit code if high collision
    digits = "".join(random.choices(string.digits, k=4))
    return f"P-{digits}"


@router.post("", response_model=PatientOut, status_code=201)
async def intake_patient(
    data: PatientIntakeCreate,
    x_worker_id: Optional[str] = Header(None, alias="X-Worker-Id"),
):
    hub_id = data.care_hub_id or "default_hub"
    worker_id = x_worker_id or "REC-DESK"

    # Generate sequential unique Patient ID (e.g. P-0001)
    pid = await _unique_patient_id(hub_id)

    patient = Patient(
        patient_id=pid,
        full_name=data.full_name.strip(),
        age=data.age,
        gender=data.gender,
        contact_number=data.contact_number,
        address=data.address,
        blood_group=data.blood_group,
        height_cm=data.height_cm,
        weight_kg=data.weight_kg,
        bp_systolic=data.bp_systolic,
        bp_diastolic=data.bp_diastolic,
        temperature_f=data.temperature_f,
        chief_complaints=data.chief_complaints,
        status="queued_for_ai",
        care_hub_id=hub_id,
        registered_by=worker_id,
    )

    await patient.insert()
    return patient


@router.get("/queue", response_model=List[PatientOut])
async def get_patient_queue(
    hub_id: Optional[str] = Query(None),
    status: Optional[str] = Query("queued_for_ai"),
):
    query = {}
    if hub_id:
        query["care_hub_id"] = hub_id
    if status and status != "all":
        query["status"] = status

    # Return latest queue first
    patients = await Patient.find(query).sort("-created_at").to_list()
    return patients


@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient_detail(patient_id: str):
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")
    return patient
