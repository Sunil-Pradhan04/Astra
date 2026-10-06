from pydantic import BaseModel, EmailStr
from typing import List, Optional


class EmailSend(BaseModel):
    to_ids: List[str]          # list of doctor_id or worker_id
    subject: str
    message: str


class EmailResult(BaseModel):
    sent: int
    failed: int
    details: Optional[str] = None
