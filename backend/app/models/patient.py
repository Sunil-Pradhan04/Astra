from beanie import Document
from datetime import datetime
from typing import Optional, Dict, Any, List
from pymongo import IndexModel, ASCENDING


class Patient(Document):
    patient_id: str                      # e.g. P-0001
    full_name: str
    age: int
    gender: str                          # Male, Female, Other
    contact_number: Optional[str] = None
    email: Optional[str] = None          # Optional email for sending digital prescriptions & reports
    address: Optional[str] = None

    # Biological data & vitals collected at reception
    blood_group: Optional[str] = None    # A+, B+, O+, etc.
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    temperature_f: Optional[float] = None
    chief_complaints: Optional[str] = None

    # Pipeline status
    status: str = "queued_for_ai"        # queued_for_ai | in_ai_session | pending_verification | emergency_queue | verified_for_doctor | prescription_dispensing | completed

    # Queue Type & Urgency Flagging
    priority: str = "normal"             # "emergency" (red queue) | "normal" (normal queue)
    urgency_level: str = "green"         # "red" | "green" | "yellow"
    urgency_detected: bool = False
    urgency_details: Optional[Dict[str, Any]] = None

    # Care Hub & Audit
    care_hub_id: str                     # references CareHub._id
    registered_by: str                   # Worker ID (e.g. REC-12345)
    created_at: datetime = datetime.utcnow()

    # AI Agent output (populated after AI interrogation)
    ai_summary: Optional[Dict[str, Any]] = None
    prescription_records: Optional[List[Dict[str, Any]]] = None

    # Health Worker Verification / Review Audit & Doctor Routing
    verified_by: Optional[str] = None
    verified_worker_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    verification_notes: Optional[str] = None
    ai_update_history: Optional[List[Dict[str, Any]]] = None

    # Doctor Assignment & Queue Routing
    assigned_doctor_id: Optional[str] = None    # e.g. DOC-12345
    assigned_doctor_name: Optional[str] = None  # e.g. Dr. Ashok Panda
    assigned_doctor_role: Optional[str] = None  # intern_doctor | medicine_specialist | specialist

    # Doctor Prescription & Digital Treatment Record
    doctor_prescription: Optional[Dict[str, Any]] = None

    # Clinical Referrals (Inside Hospital / Hospital to Another)
    internal_referral: Optional[Dict[str, Any]] = None
    external_referral: Optional[Dict[str, Any]] = None

    class Settings:
        name = "patients"
        indexes = [
            IndexModel([("patient_id", ASCENDING)], unique=True),
            IndexModel([("care_hub_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("priority", ASCENDING)]),
            IndexModel([("assigned_doctor_id", ASCENDING)]),
            IndexModel([("created_at", ASCENDING)]),
        ]
