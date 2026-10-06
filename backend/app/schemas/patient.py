from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class PatientIntakeCreate(BaseModel):
    full_name: str
    age: int
    gender: str
    contact_number: Optional[str] = None
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
    address: Optional[str] = None
    blood_group: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    temperature_f: Optional[float] = None
    chief_complaints: Optional[str] = None
    status: str
    care_hub_id: str
    registered_by: str
    created_at: datetime
    ai_summary: Optional[Dict[str, Any]] = None
