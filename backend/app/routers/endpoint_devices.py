from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import List

from app.models.admin import Admin
from app.models.endpoint_device import EndpointDevice
from app.schemas.staff import EndpointDeviceCreate, EndpointDeviceOut, EndpointDeviceCreatedResponse
from app.dependencies.auth import get_current_admin
from app.core.security import hash_password, generate_id, generate_password, create_access_token

ONLINE_TIMEOUT_MINUTES = 5

def _is_device_online(d: EndpointDevice) -> bool:
    if not getattr(d, 'is_online', False):
        return False
    if not getattr(d, 'last_seen_at', None):
        return False
    return datetime.utcnow() - d.last_seen_at < timedelta(minutes=ONLINE_TIMEOUT_MINUTES)

router = APIRouter(prefix="/endpoint-devices", tags=["Endpoint Devices"])


async def _unique_device_id() -> str:
    for _ in range(10):
        did = generate_id("DEV")
        if not await EndpointDevice.find_one(EndpointDevice.device_id == did):
            return did
    raise HTTPException(500, "Could not generate unique Device ID")


@router.get("", response_model=List[EndpointDeviceOut])
async def list_devices(admin: Admin = Depends(get_current_admin)):
    if not admin.care_hub_id:
        raise HTTPException(400, "No Care Hub created yet")
    devices = await EndpointDevice.find(EndpointDevice.care_hub_id == admin.care_hub_id).to_list()
    return [
        EndpointDeviceOut(
            device_id=d.device_id, device_name=d.device_name,
            location=d.location, is_active=d.is_active,
            is_online=_is_device_online(d), created_at=d.created_at,
        )
        for d in devices
    ]


@router.post("", response_model=EndpointDeviceCreatedResponse, status_code=201)
async def create_device(
    data: EndpointDeviceCreate,
    admin: Admin = Depends(get_current_admin),
):
    if not admin.care_hub_id:
        raise HTTPException(400, "Create a Care Hub first")

    did      = await _unique_device_id()
    password = generate_password()

    device = EndpointDevice(
        device_id=did,
        password_hash=hash_password(password),
        device_name=data.device_name,
        location=data.location,
        care_hub_id=admin.care_hub_id,
        is_active=True,
        is_online=False,
    )
    await device.insert()

    return EndpointDeviceCreatedResponse(
        device=EndpointDeviceOut(
            device_id=did, device_name=data.device_name,
            location=data.location, is_active=True, is_online=False, created_at=device.created_at,
        ),
        plain_password=password,
    )


@router.post("/{device_id}/launch-token")
async def launch_device_token(device_id: str, admin: Admin = Depends(get_current_admin)):
    """Allows facility admin to launch and start the terminal directly with 1 click."""
    device = await EndpointDevice.find_one(EndpointDevice.device_id == device_id)
    if not device or device.care_hub_id != admin.care_hub_id:
        raise HTTPException(404, "Endpoint device not found")

    device.is_online = True
    device.last_seen_at = datetime.utcnow()
    await device.save()

    token = create_access_token({
        "sub": str(device.id),
        "device_id": device.device_id,
        "device_name": device.device_name,
        "role": "endpoint_device",
        "care_hub_id": device.care_hub_id,
    })

    return {
        "access_token": token,
        "device_id": device.device_id,
        "device_name": device.device_name,
        "care_hub_id": device.care_hub_id,
        "location": device.location,
    }


@router.delete("/{device_id}", status_code=204)
async def delete_device(device_id: str, admin: Admin = Depends(get_current_admin)):
    device = await EndpointDevice.find_one(EndpointDevice.device_id == device_id)
    if not device or device.care_hub_id != admin.care_hub_id:
        raise HTTPException(404, "Device not found")
    await device.delete()
