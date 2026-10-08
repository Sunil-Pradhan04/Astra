from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


class PatientIntakeCreate(BaseModel):
    full_name: str
    age: int
    gender: str
    contact_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    blood_group: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    temperature_f: Optional[float] = None
    chief_complaints: Optional[str] = None
    care_hub_id: Optional[str] = None


class PatientOut(BaseModel):
    patient_id: str
    full_name: str
    age: int
    gender: str
    contact_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    blood_group: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    temperature_f: Optional[float] = None
    chief_complaints: Optional[str] = None
    status: str
    priority: str = "normal"
    urgency_level: str = "green"
    urgency_detected: bool = False
    urgency_details: Optional[Dict[str, Any]] = None
    care_hub_id: str
    registered_by: str
    created_at: datetime
    ai_summary: Optional[Dict[str, Any]] = None
    prescription_records: Optional[List[Dict[str, Any]]] = None
    verified_by: Optional[str] = None
    verified_worker_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    verification_notes: Optional[str] = None
    ai_update_history: Optional[List[Dict[str, Any]]] = None
    assigned_doctor_id: Optional[str] = None
    assigned_doctor_name: Optional[str] = None
    assigned_doctor_role: Optional[str] = None
    doctor_prescription: Optional[Dict[str, Any]] = None


class PatientManualUpdateRequest(BaseModel):
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    temperature_f: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    chief_complaints: Optional[str] = None
    priority: Optional[str] = None           # "emergency" | "normal"
    urgency_level: Optional[str] = None      # "red" | "yellow" | "green"
    ai_summary: Optional[Dict[str, Any]] = None
    verification_notes: Optional[str] = None


class PatientAiUpdateRequest(BaseModel):
    message: str
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None


class PatientVerifyToDoctorRequest(BaseModel):
    verification_notes: Optional[str] = None
    verified_by: Optional[str] = None
    verified_worker_name: Optional[str] = None
    priority: Optional[str] = None
    ai_summary: Optional[Dict[str, Any]] = None
    assigned_doctor_id: Optional[str] = None
    assigned_doctor_name: Optional[str] = None
    assigned_doctor_role: Optional[str] = None


class PrescriptionMedicineItem(BaseModel):
    name: str
    form: str = "Tablet"                 # Tablet | Capsule | Syrup | Injection | Drops | Inhaler | Ointment
    dosage: str = "500mg"
    frequency: str = "1-0-1"             # 1-0-1 | 1-0-0 | 0-0-1 | 1-1-1 | SOS | Once daily
    duration: str = "5 Days"
    route: str = "Oral"                  # Oral | Topical | Inhalation | IV | IM
    instructions: str = "After meals"    # After meals | Before meals | At bedtime | As needed


class DoctorPrescriptionSubmitRequest(BaseModel):
    diagnosis: str
    clinical_notes: Optional[str] = None
    medicines: List[PrescriptionMedicineItem]
    doctor_advice: Optional[str] = None
    follow_up_date: Optional[str] = None


class PatientRescreenRequest(BaseModel):
    reason: Optional[str] = None
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None


class AiUpdateResponse(BaseModel):
    success: bool
    ai_reply: str
    changes_applied: List[str]
    patient: PatientOut

