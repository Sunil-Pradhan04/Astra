from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CareHubCreate(BaseModel):
    name: str
    hub_type: str
    address: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CareHubOut(BaseModel):
    id: str
    name: str
    hub_type: str
    address: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime


class DashboardStats(BaseModel):
    total_doctors: int
    total_health_workers: int
    total_endpoint_devices: int
    total_patients: int
    online_doctors: int
    online_health_workers: int
    hub_name: str
    hub_type: str
