from beanie import Document
from datetime import datetime
from typing import Optional
from pymongo import IndexModel, ASCENDING


class EndpointDevice(Document):
    device_id: str                       # e.g. DEV-12345 (unique)
    password_hash: str
    device_name: str
    location: Optional[str] = None      # e.g. "Ward 3 - Bed 12"
    care_hub_id: str                     # references CareHub._id
    is_active: bool = True
    is_online: bool = False
    last_seen_at: Optional[datetime] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "endpoint_devices"
        indexes = [
            IndexModel([("device_id", ASCENDING)], unique=True),
            IndexModel([("care_hub_id", ASCENDING)]),
        ]
