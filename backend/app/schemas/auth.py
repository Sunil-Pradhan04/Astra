from typing import Optional
from pydantic import BaseModel, EmailStr


class AdminRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    confirm_password: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin_id: str
    email: str
    username: str


class HealthWorkerLogin(BaseModel):
    worker_id: str
    password: str


class HealthWorkerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    worker_id: str
    full_name: str
    email: str
    sub_role: str
    care_hub_id: str


class DeviceLogin(BaseModel):
    device_id: str
    password: str


class DeviceTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    device_id: str
    device_name: str
    care_hub_id: str
    location: Optional[str] = None


class DoctorLogin(BaseModel):
    doctor_id: str
    password: str


class DoctorTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    doctor_id: str
    full_name: str
    email: str
    role: str
    specialization: Optional[str] = None
    care_hub_id: str
