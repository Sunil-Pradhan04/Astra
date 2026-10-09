from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from app.core.security import decode_token
from app.models.admin import Admin
from app.models.health_worker import HealthWorker
from app.models.doctor import Doctor
from app.models.endpoint_device import EndpointDevice

bearer_scheme = HTTPBearer()


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Admin:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        admin_id: str = payload.get("sub")
        if admin_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    admin = None
    try:
        admin = await Admin.get(admin_id)
    except Exception:
        pass
    if admin is None:
        admin = await Admin.find_one(Admin.admin_id == admin_id)
    if admin is None:
        raise HTTPException(status_code=401, detail="Admin not found")
    return admin


async def get_current_worker(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> HealthWorker:
    """Dependency for health worker protected routes."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        role = payload.get("role")
        if role != "health_worker":
            raise HTTPException(status_code=403, detail="Access denied: not a health worker")
        worker_mongo_id: str = payload.get("sub")
        if not worker_mongo_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    worker = None
    try:
        worker = await HealthWorker.get(worker_mongo_id)
    except Exception:
        pass
    if worker is None:
        wid = payload.get("worker_id") or worker_mongo_id
        worker = await HealthWorker.find_one(HealthWorker.worker_id == wid)
    if worker is None:
        raise HTTPException(status_code=401, detail="Health worker not found")
    return worker


async def get_current_doctor(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Doctor:
    """Dependency for doctor protected routes."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        role = payload.get("role")
        if role != "doctor":
            raise HTTPException(status_code=403, detail="Access denied: not a doctor")
        doctor_mongo_id: str = payload.get("sub")
        if not doctor_mongo_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    doctor = None
    try:
        doctor = await Doctor.get(doctor_mongo_id)
    except Exception:
        pass
    if doctor is None:
        did = payload.get("doctor_id") or doctor_mongo_id
        doctor = await Doctor.find_one(Doctor.doctor_id == did)
    if doctor is None:
        raise HTTPException(status_code=401, detail="Doctor not found")
    return doctor


async def get_current_device(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> EndpointDevice:
    """Dependency for endpoint device / kiosk routes."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        role = payload.get("role")
        if role not in ("endpoint_device", "admin"):
            raise HTTPException(status_code=403, detail="Access denied: not an authorized device")
        device_mongo_id: str = payload.get("sub")
        if not device_mongo_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

    if role == "endpoint_device":
        device = None
        try:
            device = await EndpointDevice.get(device_mongo_id)
        except Exception:
            pass
        if device is None:
            dev_id = payload.get("device_id") or device_mongo_id
            if dev_id:
                device = await EndpointDevice.find_one(EndpointDevice.device_id == dev_id)
        if device is None:
            raise HTTPException(status_code=401, detail="Endpoint device not found")
        return device

    if role == "admin":
        admin = None
        try:
            admin = await Admin.get(device_mongo_id)
        except Exception:
            pass
        if admin is None:
            admin = await Admin.find_one(Admin.admin_id == device_mongo_id)
        if not admin:
            device = await EndpointDevice.find_one()
            if not device:
                device = EndpointDevice(
                    device_id="DEV-KIOSK-01",
                    device_name="Admin Test Terminal",
                    care_hub_id="default_hub",
                    location="Main Lobby",
                    is_online=True,
                    last_seen_at=datetime.utcnow(),
                )
            return device
        device = await EndpointDevice.find_one(EndpointDevice.care_hub_id == admin.care_hub_id)
        if not device:
            device = EndpointDevice(
                device_id="DEV-KIOSK-01",
                device_name="Admin Test Terminal",
                care_hub_id=admin.care_hub_id or "default_hub",
                location="Main Lobby",
                is_online=True,
                last_seen_at=datetime.utcnow(),
            )
            await device.insert()
        return device

    raise HTTPException(status_code=403, detail="Access denied")

