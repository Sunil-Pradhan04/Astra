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
    status: str = "queued_for_ai"        # queued_for_ai | in_ai_session | pending_verification | verified_for_doctor | completed

    # Care Hub & Audit
    care_hub_id: str                     # references CareHub._id
    registered_by: str                   # Worker ID (e.g. REC-12345)
    created_at: datetime = datetime.utcnow()

    # AI Agent output (populated after AI interrogation)
    ai_summary: Optional[Dict[str, Any]] = None
    prescription_records: Optional[List[Dict[str, Any]]] = None

    class Settings:
        name = "patients"
        indexes = [
            IndexModel([("patient_id", ASCENDING)], unique=True),
            IndexModel([("care_hub_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("created_at", ASCENDING)]),
        ]
