from beanie import Document
from datetime import datetime
from typing import Optional
from pymongo import IndexModel, ASCENDING

CARE_HUB_TYPES = [
    "Government Hospital",
    "Primary Health Center (PHC)",
    "Community Health Center (CHC)",
    "District / Tertiary Hospital",
    "Public Health Camp",
    "Company Clinic",
    "Industrial Health Unit",
    "Campus Health Center",
]


class CareHub(Document):
    name: str
    hub_type: str                        # one of CARE_HUB_TYPES
    admin_id: str                        # references Admin._id
    address: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "care_hubs"
        indexes = [
            IndexModel([("admin_id", ASCENDING)]),
        ]
