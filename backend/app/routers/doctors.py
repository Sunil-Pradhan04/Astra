import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query

ONLINE_TIMEOUT_MINUTES = 5

def _is_actually_online(entity) -> bool:
    if not entity.is_online:
        return False
    if not getattr(entity, 'last_seen_at', None):
        return False
    return datetime.utcnow() - entity.last_seen_at < timedelta(minutes=ONLINE_TIMEOUT_MINUTES)

from pydantic import BaseModel
from app.models.admin import Admin
from app.models.care_hub import CareHub
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.schemas.staff import DoctorCreate, DoctorOut, DoctorCreatedResponse
from app.schemas.patient import (
    DoctorPrescriptionSubmitRequest,
    PatientOut,
    InternalReferralRequest,
    GenerateReferralNoteRequest,
    ExternalReferralDoctorRequest,
)
from app.dependencies.auth import get_current_admin, get_current_doctor
from app.core.security import hash_password, generate_id, generate_password
from app.services.email_service import send_email, staff_credentials_email, patient_prescription_email
from app.services.health_worker_ai_service import health_worker_ai

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
            doctor_id=d.doctor_id,
            full_name=d.full_name,
            email=d.email,
            role=getattr(d, "role", "medicine_specialist"),
            specialization=d.specialization,
            is_online=_is_actually_online(d),
            created_at=d.created_at,
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

    # Validate role
    valid_roles = ["intern_doctor", "medicine_specialist", "specialist"]
    doctor_role = data.role if data.role in valid_roles else "medicine_specialist"

    # Check duplicate email
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
        role=doctor_role,
        specialization=data.specialization,
        care_hub_id=admin.care_hub_id,
    )
    await doctor.insert()

    role_label = {
        "intern_doctor": "Intern Doctor",
        "medicine_specialist": "Medicine Specialist",
        "specialist": f"Specialist ({data.specialization or 'General'})",
    }.get(doctor_role, "Doctor")

    email_html = staff_credentials_email(
        full_name=data.full_name,
        staff_id=did,
        plain_password=password,
        role=role_label,
        hub_name=hub.name if hub else "Your Hub",
    )
    sent = await send_email(data.email, "Your Astra Login Credentials", email_html)

    return DoctorCreatedResponse(
        doctor=DoctorOut(
            doctor_id=did,
            full_name=data.full_name,
            email=data.email,
            role=doctor_role,
            specialization=data.specialization,
            is_online=False,
            created_at=doctor.created_at,
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


# ── Mid-Level Health Worker & Dispatch endpoints ────────────────────────────

@router.get("/queues")
async def get_doctors_with_queues(hub_id: Optional[str] = Query(None)):
    """
    Returns all registered doctors with their real-time waiting queue counts.
    Used by the Verification Desk to inspect queue loads and dispatch patients.
    """
    query = {}
    if hub_id:
        query["care_hub_id"] = hub_id
    doctors = await Doctor.find(query).to_list()

    # Load active patients waiting for doctor consultation
    patient_query = {"status": "verified_for_doctor"}
    if hub_id:
        patient_query["care_hub_id"] = hub_id
    waiting_patients = await Patient.find(patient_query).to_list()

    # Count patients per doctor
    doc_map = {}
    unassigned_count = 0
    for p in waiting_patients:
        did = getattr(p, "assigned_doctor_id", None)
        if did:
            doc_map[did] = doc_map.get(did, 0) + 1
        else:
            unassigned_count += 1

    result = []
    for d in doctors:
        role = getattr(d, "role", "medicine_specialist")
        role_label = {
            "intern_doctor": "Intern Doctor",
            "medicine_specialist": "Medicine Specialist",
            "specialist": "Specialist",
        }.get(role, role)

        result.append({
            "doctor_id": d.doctor_id,
            "full_name": d.full_name,
            "role": role,
            "role_label": role_label,
            "specialization": d.specialization or "General Medicine",
            "is_online": _is_actually_online(d),
            "waiting_patients": doc_map.get(d.doctor_id, 0),
            "care_hub_id": d.care_hub_id,
        })

    # Group by role
    grouped = {
        "intern_doctor": [d for d in result if d["role"] == "intern_doctor"],
        "medicine_specialist": [d for d in result if d["role"] == "medicine_specialist"],
        "specialist": [d for d in result if d["role"] == "specialist"],
    }

    return {
        "doctors": result,
        "grouped": grouped,
        "total_doctors": len(result),
        "unassigned_waiting_patients": unassigned_count,
    }


# ── Doctor Desk Endpoints ───────────────────────────────────────────────────

@router.get("/desk/my-queue")
async def get_doctor_desk_queue(doctor: Doctor = Depends(get_current_doctor)):
    """
    Fetches the consultation queue for the authenticated doctor.
    Separated into:
    - Emergency (Red priority or emergency flag)
    - Normal Consultation
    - Recently completed / prescribed cases
    """
    doctor.is_online = True
    doctor.last_seen_at = datetime.utcnow()
    await doctor.save()

    # Find patients assigned to this doctor or unassigned waiting for their role
    assigned_patients = await Patient.find(
        Patient.assigned_doctor_id == doctor.doctor_id
    ).sort([("priority", -1), ("created_at", -1)]).to_list()

    # Also include patients assigned to doctor's role without specific doctor, or unassigned emergency cases
    if getattr(doctor, "role", None):
        unassigned_role = await Patient.find(
            Patient.status == "verified_for_doctor",
            Patient.assigned_doctor_id == None,
            Patient.assigned_doctor_role == doctor.role
        ).to_list()
        for p in unassigned_role:
            if p not in assigned_patients:
                assigned_patients.append(p)

    emergency_queue = [
        p for p in assigned_patients
        if p.status == "verified_for_doctor"
        and (getattr(p, "priority", "") == "emergency" or getattr(p, "urgency_detected", False) or getattr(p, "urgency_level", "") == "red")
    ]

    normal_queue = [
        p for p in assigned_patients
        if p.status == "verified_for_doctor"
        and p not in emergency_queue
    ]

    completed_queue = [
        p for p in assigned_patients
        if p.status in ["prescription_dispensing", "completed"]
    ][:20]

    return {
        "doctor": {
            "doctor_id": doctor.doctor_id,
            "full_name": doctor.full_name,
            "role": getattr(doctor, "role", "medicine_specialist"),
            "specialization": doctor.specialization or "General Medicine",
            "email": doctor.email,
        },
        "emergency_queue": emergency_queue,
        "normal_queue": normal_queue,
        "completed_queue": completed_queue,
        "emergency_count": len(emergency_queue),
        "normal_count": len(normal_queue),
        "completed_count": len(completed_queue),
        "total_active": len(emergency_queue) + len(normal_queue),
    }


@router.post("/desk/prescriptions/{patient_id}")
async def submit_doctor_prescription(
    patient_id: str,
    data: DoctorPrescriptionSubmitRequest,
    doctor: Doctor = Depends(get_current_doctor),
):
    """
    Doctor submits clinical diagnosis and medicines:
    1. Attaches digital prescription object to patient document.
    2. Updates status to 'prescription_dispensing' (enters pharmacist queue).
    3. Dispatches comprehensive prescription HTML email to patient (if email is provided).
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    rx_id = f"RX-{uuid.uuid4().hex[:8].upper()}"
    prescribed_at_dt = datetime.utcnow()

    # Format medicines list
    medicines_data = [
        {
            "name": m.name.strip(),
            "form": m.form,
            "dosage": m.dosage,
            "frequency": m.frequency,
            "duration": m.duration,
            "route": m.route,
            "instructions": m.instructions,
        }
        for m in data.medicines
    ]

    role_label = {
        "intern_doctor": "Intern Doctor",
        "medicine_specialist": "Medicine Specialist",
        "specialist": "Specialist",
    }.get(getattr(doctor, "role", "medicine_specialist"), "Doctor")

    prescription_obj = {
        "prescription_id": rx_id,
        "doctor_id": doctor.doctor_id,
        "doctor_name": doctor.full_name,
        "doctor_role": getattr(doctor, "role", "medicine_specialist"),
        "doctor_role_label": role_label,
        "doctor_specialization": doctor.specialization or "General Medicine",
        "diagnosis": data.diagnosis,
        "clinical_notes": data.clinical_notes,
        "medicines": medicines_data,
        "doctor_advice": data.doctor_advice,
        "follow_up_date": data.follow_up_date,
        "prescribed_at": prescribed_at_dt.isoformat(),
        "is_dispensed": False,
        "dispensed_at": None,
        "dispensed_by": None,
    }

    patient.doctor_prescription = prescription_obj
    patient.status = "prescription_dispensing"
    patient.updated_at = prescribed_at_dt
    await patient.save()

    # Send digital prescription via email if patient provided email
    email_sent = False
    if patient.email and patient.email.strip():
        patient_vitals = {
            "bp": f"{patient.bp_systolic}/{patient.bp_diastolic} mmHg" if patient.bp_systolic and patient.bp_diastolic else "N/A",
            "temperature": f"{patient.temperature_f} °F" if patient.temperature_f else "N/A",
            "weight": f"{patient.weight_kg} kg" if patient.weight_kg else "N/A",
            "blood_group": patient.blood_group or "N/A",
        }

        email_html = patient_prescription_email(
            patient_name=patient.full_name,
            patient_id=patient.patient_id,
            doctor_name=doctor.full_name,
            doctor_role=role_label,
            specialization=doctor.specialization or "General Medicine",
            prescription_id=rx_id,
            diagnosis=data.diagnosis,
            clinical_notes=data.clinical_notes,
            medicines=medicines_data,
            advice=data.doctor_advice,
            follow_up=data.follow_up_date,
            vitals=patient_vitals,
        )

        email_subject = f"Astra Care Hub - Official Prescription #{rx_id} for {patient.full_name}"
        email_sent = await send_email(patient.email.strip(), email_subject, email_html)

    return {
        "success": True,
        "message": "Prescription successfully recorded, routed to Pharmacist queue and emailed to patient.",
        "prescription_id": rx_id,
        "email_sent": email_sent,
        "patient_email": patient.email,
        "prescription": prescription_obj,
        "patient": patient,
    }


@router.post("/desk/dispense/{patient_id}")
async def dispense_patient_medicine(
    patient_id: str,
    worker_name: Optional[str] = Query("Pharmacist"),
    worker_id: Optional[str] = Query("HW-PHARMACY"),
):
    """
    Pharmacist confirms medicines have been handed over to the patient.
    Status moves to 'completed'.
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    if not patient.doctor_prescription:
        raise HTTPException(400, "Patient has no prescribed medicines to dispense.")

    now_iso = datetime.utcnow().isoformat()
    patient.doctor_prescription["is_dispensed"] = True
    patient.doctor_prescription["dispensed_at"] = now_iso
    patient.doctor_prescription["dispensed_by"] = f"{worker_name} ({worker_id})"
    patient.status = "completed"
    patient.updated_at = datetime.utcnow()

    await patient.save()

    return {
        "success": True,
        "message": f"Medicines for {patient.full_name} ({patient.patient_id}) marked as dispensed. Case complete.",
        "patient": patient,
    }


@router.post("/heartbeat")
async def doctor_heartbeat(doctor: Doctor = Depends(get_current_doctor)):
    doctor.is_online = True
    doctor.last_seen_at = datetime.utcnow()
    await doctor.save()
    return {"status": "ok", "doctor_id": doctor.doctor_id}


# ── Clinical Referral Endpoints ─────────────────────────────────────────────

@router.get("/internal-doctors")
async def get_internal_doctors(doctor: Doctor = Depends(get_current_doctor)):
    """
    Returns all registered doctors in the same hospital/care hub with their real-time waiting queue counts.
    Used for doctor-to-doctor internal referral.
    """
    hub_id = doctor.care_hub_id
    if not hub_id:
        raise HTTPException(400, "Doctor has no Care Hub assigned")

    doctors = await Doctor.find(Doctor.care_hub_id == hub_id).to_list()

    # Load active patients waiting for doctor consultation in this care hub
    waiting_patients = await Patient.find(
        Patient.care_hub_id == hub_id,
        Patient.status == "verified_for_doctor"
    ).to_list()

    doc_map = {}
    for p in waiting_patients:
        did = getattr(p, "assigned_doctor_id", None)
        if did:
            doc_map[did] = doc_map.get(did, 0) + 1

    result = []
    for d in doctors:
        role = getattr(d, "role", "medicine_specialist")
        role_label = {
            "intern_doctor": "Intern Doctor",
            "medicine_specialist": "Medicine Specialist",
            "specialist": "Specialist",
        }.get(role, role)

        result.append({
            "doctor_id": d.doctor_id,
            "full_name": d.full_name,
            "role": role,
            "role_label": role_label,
            "specialization": d.specialization or "General Medicine",
            "is_online": _is_actually_online(d),
            "waiting_patients": doc_map.get(d.doctor_id, 0),
            "is_self": d.doctor_id == doctor.doctor_id,
        })

    return {
        "doctors": result,
        "care_hub_id": hub_id,
        "total": len(result),
    }


async def _safe_find_patient(patient_id: str) -> Optional[Patient]:
    p = await Patient.find_one(Patient.patient_id == patient_id)
    if p:
        return p
    try:
        p = await Patient.get(patient_id)
        if p:
            return p
    except Exception:
        pass
    return None


async def _safe_get_hub(hub_id: Optional[str]) -> Optional[CareHub]:
    if not hub_id:
        return None
    try:
        hub = await CareHub.get(hub_id)
        if hub:
            return hub
    except Exception:
        pass
    try:
        return await CareHub.find_one(CareHub.hub_id == hub_id)
    except Exception:
        pass
    return None


@router.post("/desk/refer-internal/{patient_id}")
async def refer_patient_internal(
    patient_id: str,
    data: InternalReferralRequest,
    doctor: Doctor = Depends(get_current_doctor),
):
    """
    Refers a patient to another doctor within the same hospital, immediately
    transferring the patient to the target doctor's queue with referral notes.
    """
    patient = await _safe_find_patient(patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found in database")

    target_doctor = await Doctor.find_one(Doctor.doctor_id == data.target_doctor_id)
    if not target_doctor:
        raise HTTPException(404, f"Target doctor {data.target_doctor_id} not found")

    if doctor.care_hub_id and target_doctor.care_hub_id and target_doctor.care_hub_id != doctor.care_hub_id:
        raise HTTPException(400, "Target doctor must be in the same hospital facility")

    # Update patient assignment
    patient.assigned_doctor_id = target_doctor.doctor_id
    patient.assigned_doctor_name = target_doctor.full_name
    patient.assigned_doctor_role = getattr(target_doctor, "role", "specialist")
    patient.status = "verified_for_doctor"

    if data.priority:
        patient.priority = data.priority
        if data.priority.lower() == "emergency":
            patient.urgency_level = "red"
            patient.urgency_detected = True

    referral_record = {
        "from_doctor_id": doctor.doctor_id,
        "from_doctor_name": doctor.full_name,
        "to_doctor_id": target_doctor.doctor_id,
        "to_doctor_name": target_doctor.full_name,
        "to_doctor_role": getattr(target_doctor, "role", "specialist"),
        "to_doctor_specialization": target_doctor.specialization or "General Medicine",
        "reason": data.reason,
        "notes": data.notes,
        "priority": data.priority or getattr(patient, "priority", "normal"),
        "referred_at": datetime.utcnow().isoformat(),
    }
    patient.internal_referral = referral_record

    note_entry = f"[Internal Referral from Dr. {doctor.full_name} -> Dr. {target_doctor.full_name}]: {data.reason}"
    if data.notes:
        note_entry += f" | Notes: {data.notes}"
    existing_notes = getattr(patient, "clinical_notes", None) or ""
    if existing_notes:
        patient.clinical_notes = f"{existing_notes}\n{note_entry}"
    else:
        patient.clinical_notes = note_entry

    patient.updated_at = datetime.utcnow()
    await patient.save()

    return {
        "success": True,
        "message": f"Patient {patient.full_name} successfully transferred to Dr. {target_doctor.full_name}'s queue",
        "patient": patient,
    }


@router.post("/desk/generate-referral-note/{patient_id}")
async def generate_patient_referral_note(
    patient_id: str,
    data: GenerateReferralNoteRequest,
    doctor: Doctor = Depends(get_current_doctor),
):
    """
    Uses Sarvam AI LLM to automatically synthesize an official clinical referral memorandum
    based on the doctor's reason for referral and possible diagnosis.
    """
    patient = await _safe_find_patient(patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    hub = await _safe_get_hub(doctor.care_hub_id)
    hub_name = hub.name if hub else "Astra Care Hub Facility"

    p_dict = patient.model_dump() if hasattr(patient, "model_dump") else patient.dict()

    referral_note = await health_worker_ai.generate_referral_note(
        patient_data=p_dict,
        reason_for_referral=data.reason_for_referral,
        possible_diagnosis=data.possible_diagnosis,
        referring_doctor_name=doctor.full_name,
        referring_facility_name=hub_name,
        urgency=data.urgency or "Urgent",
        clinical_notes=data.clinical_notes,
    )

    return {
        "success": True,
        "ai_referral_note": referral_note,
        "urgency": data.urgency,
        "reason_for_referral": data.reason_for_referral,
        "possible_diagnosis": data.possible_diagnosis,
        "referring_facility_name": hub_name,
        "referring_doctor_name": doctor.full_name,
    }


@router.post("/desk/refer-external/{patient_id}")
async def refer_patient_external(
    patient_id: str,
    data: ExternalReferralDoctorRequest,
    doctor: Doctor = Depends(get_current_doctor),
):
    """
    Submits an external referral note created by the doctor. The case is routed into the
    Mid-Level Health Worker review queue ('pending_external_referral') to select destination
    facility in radius and dispatch.
    """
    patient = await _safe_find_patient(patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    hub = await _safe_get_hub(doctor.care_hub_id)
    hub_name = hub.name if hub else "Current Care Hub"

    external_ref_record = {
        "referring_doctor_id": doctor.doctor_id,
        "referring_doctor_name": doctor.full_name,
        "referring_doctor_role": getattr(doctor, "role", "Doctor"),
        "referring_care_hub_id": doctor.care_hub_id,
        "referring_care_hub_name": hub_name,
        "reason_for_referral": data.reason_for_referral,
        "possible_diagnosis": data.possible_diagnosis,
        "urgency": data.urgency,
        "ai_referral_note": data.ai_referral_note,
        "updated_referral_note": data.ai_referral_note,
        "doctor_notes": data.clinical_notes,
        "created_at": datetime.utcnow().isoformat(),
        "status": "pending_worker_review",
    }

    patient.status = "pending_external_referral"
    patient.external_referral = external_ref_record

    note_entry = (
        f"[External Referral Initiated by Dr. {doctor.full_name}]: "
        f"Diagnosis: {data.possible_diagnosis} | Reason: {data.reason_for_referral}"
    )
    existing_notes = getattr(patient, "clinical_notes", None) or ""
    if existing_notes:
        patient.clinical_notes = f"{existing_notes}\n{note_entry}"
    else:
        patient.clinical_notes = note_entry

    patient.updated_at = datetime.utcnow()
    await patient.save()

    return {
        "success": True,
        "message": "Referral note submitted. Patient sent to Health Worker queue for facility selection and dispatch.",
        "patient": patient,
    }
