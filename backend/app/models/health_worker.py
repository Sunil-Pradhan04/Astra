from beanie import Document
from datetime import datetime
from typing import Optional
from pymongo import IndexModel, ASCENDING


class HealthWorker(Document):
    worker_id: str                       # e.g. REC-12345, VER-12345, DIS-12345
    password_hash: str
    full_name: str
    email: str
    sub_role: str = "Reception"          # Reception | Verification | Dispensing
    designation: Optional[str] = None
    care_hub_id: str                     # references CareHub._id
    is_online: bool = False
    last_seen_at: Optional[datetime] = None   # updated on login & heartbeat
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "health_workers"
        indexes = [
            IndexModel([("worker_id", ASCENDING)], unique=True),
            IndexModel([("care_hub_id", ASCENDING)]),
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("sub_role", ASCENDING)]),
        ]
