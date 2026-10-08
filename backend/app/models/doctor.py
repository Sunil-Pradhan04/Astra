from beanie import Document
from datetime import datetime
from typing import Optional
from pymongo import IndexModel, ASCENDING


class Doctor(Document):
    doctor_id: str                       # e.g. DOC-12345 (unique)
    password_hash: str
    full_name: str
    email: str
    role: str = "medicine_specialist"    # intern_doctor | medicine_specialist | specialist
    specialization: Optional[str] = None # e.g. General Medicine, Cardiology, Pediatrics, etc.
    care_hub_id: str                     # references CareHub._id
    is_online: bool = False
    last_seen_at: Optional[datetime] = None   # updated on login & heartbeat
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "doctors"
        indexes = [
            IndexModel([("doctor_id", ASCENDING)], unique=True),
            IndexModel([("care_hub_id", ASCENDING)]),
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("role", ASCENDING)]),
        ]
