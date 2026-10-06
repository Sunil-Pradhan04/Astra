from beanie import Document
from datetime import datetime
from typing import Optional
from pymongo import IndexModel, ASCENDING


class Admin(Document):
    email: str                          # unique — enforced by index
    username: str
    password_hash: str
    care_hub_id: Optional[str] = None  # set after hub creation
    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "admins"
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
        ]
