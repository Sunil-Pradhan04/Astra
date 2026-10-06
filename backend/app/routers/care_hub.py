from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from typing import List

ONLINE_TIMEOUT_MINUTES = 5

def _is_actually_online(entity) -> bool:
    """True only if entity is marked online AND sent a heartbeat in the last 5 minutes."""
    if not entity.is_online:
        return False
    if not getattr(entity, 'last_seen_at', None):
        return False
    return datetime.utcnow() - entity.last_seen_at < timedelta(minutes=ONLINE_TIMEOUT_MINUTES)

from app.models.admin import Admin
from app.models.care_hub import CareHub
from app.models.doctor import Doctor
from app.models.health_worker import HealthWorker
from app.models.endpoint_device import EndpointDevice
from app.models.patient import Patient
from app.schemas.care_hub import CareHubCreate, CareHubOut, DashboardStats
from app.dependencies.auth import get_current_admin

router = APIRouter(prefix="/care-hub", tags=["Care Hub"])


@router.get("", response_model=List[CareHubOut])
async def get_my_hub(admin: Admin = Depends(get_current_admin)):
    """Get care hub(s) belonging to this admin."""
    hubs = await CareHub.find(CareHub.admin_id == str(admin.id)).to_list()
    return [
        CareHubOut(
            id=str(h.id),
            name=h.name,
            hub_type=h.hub_type,
            address=h.address,
            description=h.description,
            latitude=getattr(h, "latitude", None),
            longitude=getattr(h, "longitude", None),
            created_at=h.created_at,
        )
        for h in hubs
    ]


@router.post("", response_model=CareHubOut, status_code=201)
async def create_hub(
    data: CareHubCreate,
    admin: Admin = Depends(get_current_admin),
):
    """Create a new healthcare facility for this admin."""
    hub = CareHub(
        name=data.name.strip(),
        hub_type=data.hub_type,
        admin_id=str(admin.id),
        address=data.address.strip() if data.address else None,
        description=data.description.strip() if data.description else None,
        latitude=data.latitude,
        longitude=data.longitude,
    )
    await hub.insert()

    # Link hub as admin's active facility if none set
    if not admin.care_hub_id:
        admin.care_hub_id = str(hub.id)
        await admin.save()

    return CareHubOut(
        id=str(hub.id),
        name=hub.name,
        hub_type=hub.hub_type,
        address=hub.address,
        description=hub.description,
        latitude=hub.latitude,
        longitude=hub.longitude,
        created_at=hub.created_at,
    )


@router.delete("/{hub_id}", status_code=200)
async def delete_facility(
    hub_id: str,
    admin: Admin = Depends(get_current_admin),
):
    """
    Deletes a healthcare facility and cascade cleans up all its associated
    doctors, health workers, endpoint devices, and patient queue records.
    """
    try:
        hub = await CareHub.get(hub_id)
    except Exception:
        hub = None

    if not hub or hub.admin_id != str(admin.id):
        # Fallback check if passed ID matches admin's care_hub_id
        if str(admin.care_hub_id) == hub_id:
            hub = await CareHub.find_one(CareHub.admin_id == str(admin.id))

    if not hub or hub.admin_id != str(admin.id):
        raise HTTPException(404, "Facility not found or you are not authorized to delete it.")

    hub_id_str = str(hub.id)
    hub_name = hub.name

    # Cascade delete all child resources belonging to this facility
    await Doctor.find(Doctor.care_hub_id == hub_id_str).delete()
    await HealthWorker.find(HealthWorker.care_hub_id == hub_id_str).delete()
    await EndpointDevice.find(EndpointDevice.care_hub_id == hub_id_str).delete()
    await Patient.find(Patient.care_hub_id == hub_id_str).delete()

    # Delete the facility document
    await hub.delete()

    # If this was admin's active care_hub_id, switch to another remaining facility or clear it
    remaining_hub = await CareHub.find_one(CareHub.admin_id == str(admin.id))
    admin.care_hub_id = str(remaining_hub.id) if remaining_hub else None
    await admin.save()

    return {
        "success": True,
        "message": f"Facility '{hub_name}' and all associated staff, devices, and queue records have been permanently deleted.",
        "active_facility_id": admin.care_hub_id,
    }


@router.get("/{hub_id}/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    hub_id: str,
    admin: Admin = Depends(get_current_admin),
):
    """Return dashboard statistics for the hub."""
    try:
        hub = await CareHub.get(hub_id)
    except Exception:
        hub = None

    if not hub:
        # Check by admin_id fallback
        hub = await CareHub.find_one(CareHub.admin_id == str(admin.id))

    if not hub:
        raise HTTPException(404, "Care Hub not found")

    doctors = await Doctor.find(Doctor.care_hub_id == str(hub.id)).to_list()
    workers = await HealthWorker.find(HealthWorker.care_hub_id == str(hub.id)).to_list()
    devices = await EndpointDevice.find(EndpointDevice.care_hub_id == str(hub.id)).to_list()
    total_patients = await Patient.find(Patient.care_hub_id == str(hub.id)).count()

    return DashboardStats(
        total_doctors=len(doctors),
        total_health_workers=len(workers),
        total_endpoint_devices=len(devices),
        total_patients=total_patients,
        online_doctors=sum(1 for d in doctors if _is_actually_online(d)),
        online_health_workers=sum(1 for w in workers if _is_actually_online(w)),
        hub_name=hub.name,
        hub_type=hub.hub_type,
    )

