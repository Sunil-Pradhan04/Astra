import uuid
import random
import string
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Header, Depends
from typing import List, Optional, Dict, Any

from app.models.patient import Patient
from app.models.health_worker import HealthWorker
from app.schemas.patient import (
    PatientIntakeCreate,
    PatientOut,
    PatientManualUpdateRequest,
    PatientAiUpdateRequest,
    PatientVerifyToDoctorRequest,
    PatientRescreenRequest,
    AiUpdateResponse,
    ExternalReferralDispatchWorkerRequest,
)
from app.services.health_worker_ai_service import health_worker_ai
from pydantic import BaseModel

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
        email=data.email.strip() if data.email else None,
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
    priority: Optional[str] = Query(None),
):
    query = {}
    if hub_id:
        query["care_hub_id"] = hub_id
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority

    # Emergency cases prioritized first, then chronological
    patients = await Patient.find(query).sort([("priority", -1), ("created_at", -1)]).to_list()
    return patients


@router.get("/queues/grouped")
async def get_grouped_patient_queues(
    hub_id: Optional[str] = Query(None),
    scope: Optional[str] = Query("pending_review"),  # pending_review | doctor | all
):
    """
    Returns segmented Emergency (Red), Normal, and Verified Doctor queues for clinical staff.
    By default (scope='pending_review'), provides patients waiting for Mid-Level Health Worker review.
    """
    query: Dict[str, Any] = {}
    if hub_id:
        query["care_hub_id"] = hub_id

    all_patients = await Patient.find(query).sort("-created_at").to_list()

    # Cases already verified and waiting for Doctor
    doctor_list = [p for p in all_patients if getattr(p, "status", "") == "verified_for_doctor"]

    # External referral cases waiting for Mid-Level Health Worker review & facility dispatch
    external_referral_list = [
        p for p in all_patients
        if getattr(p, "status", "") == "pending_external_referral"
    ]

    # Excluded statuses from general pending intake queue
    excluded_statuses = [
        "verified_for_doctor",
        "completed",
        "queued_for_ai",
        "pending_external_referral",
        "referred_external",
    ]

    # Emergency cases needing mid-level worker review:
    # Priority is emergency or urgency_detected is true, and not yet verified for doctor or completed or external referral
    emergency_list = [
        p for p in all_patients
        if p.status not in excluded_statuses
        and (getattr(p, "priority", "normal") == "emergency" or getattr(p, "urgency_detected", False) or getattr(p, "status", "") == "emergency_queue")
    ]

    # Normal queue needing mid-level worker review:
    # Status is pending_verification and not in emergency list
    normal_list = [
        p for p in all_patients
        if p.status not in excluded_statuses
        and p not in emergency_list
    ]

    return {
        "emergency_queue": emergency_list,
        "normal_queue": normal_list,
        "doctor_queue": doctor_list,
        "external_referral_queue": external_referral_list,
        "emergency_count": len(emergency_list),
        "normal_count": len(normal_list),
        "doctor_count": len(doctor_list),
        "external_referral_count": len(external_referral_list),
        "total_pending_count": len(emergency_list) + len(normal_list) + len(external_referral_list),
        "total_count": len(all_patients),
    }


@router.patch("/{patient_id}/manual-update", response_model=PatientOut)
async def manual_update_patient_report(
    patient_id: str,
    data: PatientManualUpdateRequest,
):
    """
    Allows a Mid-Level Health Worker to manually adjust vitals, complaints, summary, or urgency.
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    if data.bp_systolic is not None:
        patient.bp_systolic = data.bp_systolic
    if data.bp_diastolic is not None:
        patient.bp_diastolic = data.bp_diastolic
    if data.temperature_f is not None:
        patient.temperature_f = data.temperature_f
    if data.weight_kg is not None:
        patient.weight_kg = data.weight_kg
    if data.height_cm is not None:
        patient.height_cm = data.height_cm
    if data.chief_complaints is not None:
        patient.chief_complaints = data.chief_complaints
    if data.priority is not None:
        patient.priority = data.priority
        if data.priority == "emergency":
            patient.urgency_level = "red"
    if data.urgency_level is not None:
        patient.urgency_level = data.urgency_level
        if data.urgency_level == "red":
            patient.priority = "emergency"
    if data.verification_notes is not None:
        patient.verification_notes = data.verification_notes

    if data.ai_summary is not None:
        # Merge or update ai_summary
        current_sum = patient.ai_summary or {}
        if isinstance(current_sum, dict) and isinstance(data.ai_summary, dict):
            current_sum.update(data.ai_summary)
            patient.ai_summary = current_sum
        else:
            patient.ai_summary = data.ai_summary

    await patient.save()
    return patient


@router.post("/{patient_id}/ai-update", response_model=AiUpdateResponse)
async def ai_update_patient_report(
    patient_id: str,
    data: PatientAiUpdateRequest,
):
    """
    Allows a Mid-Level Health Worker to instruct the AI Agent via natural language
    to update the clinical summary, vitals, priority, or symptoms automatically.
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    patient_dict = patient.model_dump() if hasattr(patient, "model_dump") else patient.dict()

    # Call AI Co-pilot service
    result = await health_worker_ai.process_report_update(
        patient_data=patient_dict,
        worker_message=data.message,
        worker_name=data.worker_name,
    )

    ai_reply = result.get("ai_reply", "Summary updated.")
    changes_applied = result.get("changes_applied", [])
    updated_fields = result.get("updated_fields", {})

    # Apply vitals updates
    if updated_fields.get("bp_systolic") is not None:
        patient.bp_systolic = updated_fields["bp_systolic"]
    if updated_fields.get("bp_diastolic") is not None:
        patient.bp_diastolic = updated_fields["bp_diastolic"]
    if updated_fields.get("temperature_f") is not None:
        patient.temperature_f = updated_fields["temperature_f"]
    if updated_fields.get("weight_kg") is not None:
        patient.weight_kg = updated_fields["weight_kg"]
    if updated_fields.get("height_cm") is not None:
        patient.height_cm = updated_fields["height_cm"]

    # Apply complaints & priorities
    if updated_fields.get("chief_complaints"):
        patient.chief_complaints = updated_fields["chief_complaints"]
    if updated_fields.get("priority"):
        patient.priority = updated_fields["priority"]
    if updated_fields.get("urgency_level"):
        patient.urgency_level = updated_fields["urgency_level"]
    if patient.priority == "emergency":
        patient.urgency_level = "red"
        patient.urgency_detected = True

    # Merge clinical summary updates
    current_ai_sum = patient.ai_summary or {}
    structured = current_ai_sum.get("structured_summary") if isinstance(current_ai_sum, dict) and "structured_summary" in current_ai_sum else current_ai_sum

    if isinstance(structured, dict):
        if updated_fields.get("clinical_notes"):
            existing_notes = structured.get("clinical_notes", "")
            structured["clinical_notes"] = f"{existing_notes} | {updated_fields['clinical_notes']}".strip(" |")

        # Handle symptoms added or modified
        if updated_fields.get("symptoms_added_or_modified"):
            existing_symptoms = structured.get("symptoms_deep_dive") or structured.get("symptoms", [])
            for sym in updated_fields["symptoms_added_or_modified"]:
                # Check if already present by name
                sym_name = sym.get("name", "").lower()
                matched = False
                for ex in existing_symptoms:
                    if ex.get("name", "").lower() == sym_name:
                        ex.update(sym)
                        matched = True
                        break
                if not matched:
                    existing_symptoms.append(sym)
            structured["symptoms"] = existing_symptoms
            structured["symptoms_deep_dive"] = existing_symptoms
            structured["all_symptoms_overview"] = [s.get("name") for s in existing_symptoms if s.get("name")]

        # Handle symptoms removed
        if updated_fields.get("symptoms_removed"):
            rem_names = [r.lower() for r in updated_fields["symptoms_removed"]]
            existing_symptoms = [
                s for s in (structured.get("symptoms_deep_dive") or structured.get("symptoms", []))
                if s.get("name", "").lower() not in rem_names
            ]
            structured["symptoms"] = existing_symptoms
            structured["symptoms_deep_dive"] = existing_symptoms
            structured["all_symptoms_overview"] = [s.get("name") for s in existing_symptoms if s.get("name")]

        if updated_fields.get("medications_and_history"):
            structured["medications_and_history"] = updated_fields["medications_and_history"]

        if "structured_summary" in current_ai_sum:
            current_ai_sum["structured_summary"] = structured
        else:
            current_ai_sum = structured

        patient.ai_summary = current_ai_sum

    # Record AI interaction audit
    if patient.ai_update_history is None:
        patient.ai_update_history = []
    patient.ai_update_history.append({
        "id": str(uuid.uuid4())[:8],
        "timestamp": datetime.utcnow().isoformat(),
        "worker_id": data.worker_id or "HW-DESK",
        "worker_name": data.worker_name or "Health Worker",
        "message": data.message,
        "ai_reply": ai_reply,
        "changes_applied": changes_applied,
    })

    await patient.save()

    return AiUpdateResponse(
        success=True,
        ai_reply=ai_reply,
        changes_applied=changes_applied,
        patient=patient,
    )


@router.post("/{patient_id}/verify-to-doctor")
async def verify_patient_to_doctor(
    patient_id: str,
    data: PatientVerifyToDoctorRequest,
):
    """
    Final approval click by the Mid-Level Health Worker.
    Moves the verified report into the Doctor's Consultation Queue.
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    patient.status = "verified_for_doctor"
    patient.verified_by = data.verified_by or "HW-VERIFIER"
    patient.verified_worker_name = data.verified_worker_name or "Mid-Level Health Worker"
    patient.verified_at = datetime.utcnow()
    if data.verification_notes:
        patient.verification_notes = data.verification_notes
    if data.priority:
        patient.priority = data.priority
    if data.ai_summary:
        patient.ai_summary = data.ai_summary
    if data.assigned_doctor_id:
        patient.assigned_doctor_id = data.assigned_doctor_id
    if data.assigned_doctor_name:
        patient.assigned_doctor_name = data.assigned_doctor_name
    if data.assigned_doctor_role:
        patient.assigned_doctor_role = data.assigned_doctor_role

    await patient.save()

    return {
        "success": True,
        "message": f"Patient {patient.patient_id} ({patient.full_name}) successfully verified and dispatched to Doctor Queue.",
        "patient": patient,
    }


@router.post("/{patient_id}/request-rescreen")
async def request_patient_rescreen(
    patient_id: str,
    data: PatientRescreenRequest,
):
    """
    Mid-Level Health Worker can send case back for re-interrogation at the AI Kiosk.
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")

    patient.status = "queued_for_ai"
    note = f"Re-screening requested: {data.reason or 'Clinical data requires clarification'}"
    patient.verification_notes = f"{patient.verification_notes or ''} | {note}".strip(" |")

    await patient.save()
    return {
        "success": True,
        "message": f"Patient {patient.patient_id} returned to AI Kiosk queue for re-screening.",
        "patient": patient,
    }


@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient_detail(patient_id: str):
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found")
    return patient


@router.post("/{patient_id}/dispatch-external-referral")
async def dispatch_external_referral(
    patient_id: str,
    data: ExternalReferralDispatchWorkerRequest,
):
    """
    Health Worker completes review of external referral, selects target facility from radius radar,
    finalizes referral notes with transport instructions, and dispatches the patient.
    Status moves to 'referred_external'.
    """
    patient = await Patient.find_one(Patient.patient_id == patient_id)
    if not patient:
        try:
            patient = await Patient.get(patient_id)
        except Exception:
            patient = None
    if not patient:
        raise HTTPException(404, f"Patient {patient_id} not found in database")

    dist_val = data.target_care_hub_distance_km if data.target_care_hub_distance_km is not None else data.distance_km

    ext_ref = patient.external_referral or {}
    ext_ref["target_care_hub_id"] = data.target_care_hub_id
    ext_ref["target_care_hub_name"] = data.target_care_hub_name
    ext_ref["target_care_hub_type"] = data.target_care_hub_type
    ext_ref["target_care_hub_distance_km"] = dist_val
    ext_ref["final_referral_note"] = data.updated_referral_note
    ext_ref["updated_referral_note"] = data.updated_referral_note
    ext_ref["transport_type"] = data.transport_type
    ext_ref["dispatch_notes"] = data.dispatch_notes
    ext_ref["dispatched_by_worker_id"] = data.worker_id or "HW-VERIFIER"
    ext_ref["dispatched_by_worker_name"] = data.worker_name or "Mid-Level Health Worker"
    ext_ref["dispatched_at"] = datetime.utcnow().isoformat()
    ext_ref["status"] = "dispatched"

    patient.external_referral = ext_ref
    patient.status = "referred_external"

    note_entry = (
        f"[External Referral Dispatched]: Target -> {data.target_care_hub_name} "
        f"({data.target_care_hub_type or 'Hospital'}, {dist_val or '—'} km). "
        f"Transport: {data.transport_type or 'Standard Ambulance'}. "
        f"Dispatched by {data.worker_name or 'Health Worker'}."
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
        "message": f"Referral successfully dispatched to {data.target_care_hub_name}.",
        "patient": patient,
    }


