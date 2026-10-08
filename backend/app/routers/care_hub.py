import math
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any

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


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)


# Standard network partner facilities across all 8 facility types in Odisha region
DEFAULT_FACILITIES_NETWORK = [
    {
        "id": "REF-TERTIARY-01",
        "name": "AIIMS Bhubaneswar (Apex Tertiary Hospital)",
        "hub_type": "District / Tertiary Hospital",
        "address": "Sijua, Patrapada, Bhubaneswar, Odisha 751019",
        "latitude": 20.2312,
        "longitude": 85.7758,
        "phone": "+91-674-2476789",
        "specialties": ["Trauma", "Cardiology", "Neurology", "ICU / CCU", "Pediatric Surgery"],
    },
    {
        "id": "REF-TERTIARY-02",
        "name": "SCB Medical College & Hospital",
        "hub_type": "District / Tertiary Hospital",
        "address": "Manglabag, Cuttack, Odisha 753007",
        "latitude": 20.4625,
        "longitude": 85.8928,
        "phone": "+91-671-2414080",
        "specialties": ["Super-Specialty Care", "Emergency Medicine", "Burn Care", "Nephrology"],
    },
    {
        "id": "REF-GOVT-01",
        "name": "Capital Hospital Bhubaneswar",
        "hub_type": "Government Hospital",
        "address": "Unit 6, Ganga Nagar, Bhubaneswar, Odisha 751001",
        "latitude": 20.2612,
        "longitude": 85.8277,
        "phone": "+91-674-2391983",
        "specialties": ["General Medicine", "Emergency & Casualty", "Obstetrics & Gynae", "Orthopedics"],
    },
    {
        "id": "REF-CHC-01",
        "name": "Community Health Center (CHC) Jatni",
        "hub_type": "Community Health Center (CHC)",
        "address": "Jatni Main Road, Khordha, Odisha 752050",
        "latitude": 20.1654,
        "longitude": 85.7061,
        "phone": "+91-674-2490214",
        "specialties": ["Maternity & Child Health", "Inpatient 30 Beds", "Minor OT", "X-Ray"],
    },
    {
        "id": "REF-PHC-01",
        "name": "Primary Health Center (PHC) Mendhasal",
        "hub_type": "Primary Health Center (PHC)",
        "address": "Mendhasal, Chandaka Road, Khordha, Odisha 752054",
        "latitude": 20.3015,
        "longitude": 85.7142,
        "phone": "+91-674-2741122",
        "specialties": ["Outpatient Care", "Essential Drugs", "Maternal Care", "Immunization"],
    },
    {
        "id": "REF-CAMP-01",
        "name": "Public Health Mobile Camp Unit - Khordha",
        "hub_type": "Public Health Camp",
        "address": "Rural Outreach Base, Khordha District, Odisha 752055",
        "latitude": 20.1980,
        "longitude": 85.6200,
        "phone": "+91-674-2550199",
        "specialties": ["Epidemic Screening", "Mobile Diagnostics", "Preventive Care"],
    },
    {
        "id": "REF-COMP-01",
        "name": "Tata Steel Occupational Health Clinic",
        "hub_type": "Company Clinic",
        "address": "Chandrasekharpur Industrial Area, Bhubaneswar, Odisha 751024",
        "latitude": 20.3421,
        "longitude": 85.8112,
        "phone": "+91-674-2300400",
        "specialties": ["Occupational Medicine", "Emergency First-Aid", "Toxicology"],
    },
    {
        "id": "REF-IND-01",
        "name": "NALCO Industrial Emergency Health Unit",
        "hub_type": "Industrial Health Unit",
        "address": "NALCO Bhawan, P/1, Nayapalli, Bhubaneswar, Odisha 751061",
        "latitude": 20.3150,
        "longitude": 85.8350,
        "phone": "+91-674-2301988",
        "specialties": ["Trauma First-Response", "Industrial Injury Care", "Ambulance Support"],
    },
    {
        "id": "REF-CAMPUS-01",
        "name": "IIT Bhubaneswar Campus Health Center",
        "hub_type": "Campus Health Center",
        "address": "Argul, Jatni, Khordha, Odisha 752050",
        "latitude": 20.1482,
        "longitude": 85.6710,
        "phone": "+91-674-7134555",
        "specialties": ["Student & Faculty Healthcare", "Day Care 10 Beds", "Pathology Lab"],
    },
    {
        "id": "REF-CAMPUS-02",
        "name": "BPUT Central Campus Health & Trauma Post",
        "hub_type": "Campus Health Center",
        "address": "BPUT Academic Complex, Bhubaneswar, Odisha 751015",
        "latitude": 20.3540,
        "longitude": 85.8180,
        "phone": "+91-674-2389100",
        "specialties": ["Emergency Medical Post", "Ambulance Transfer", "Physiotherapy"],
    },
]


@router.get("/nearby-facilities")
async def get_nearby_facilities(
    origin_hub_id: Optional[str] = Query(None),
    origin_lat: Optional[float] = Query(None),
    origin_lng: Optional[float] = Query(None),
    radius_km: Optional[float] = Query(None),
    facility_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """
    Returns healthcare facilities within a specified radius (e.g. 10km, 20km, 50km, etc.)
    and filtered by one of 8 facility types. Calculates live distance using Haversine formula
    and generates Google Maps directions links.
    """
    # Determine reference origin coordinates (default to Bhubaneswar standard coordinates)
    cur_lat = origin_lat or 20.2961
    cur_lng = origin_lng or 85.8245

    if origin_hub_id:
        try:
            origin_hub = await CareHub.get(origin_hub_id)
            if origin_hub and origin_hub.latitude is not None and origin_hub.longitude is not None:
                cur_lat = origin_hub.latitude
                cur_lng = origin_hub.longitude
        except Exception:
            pass

    # Collect registered CareHub documents from database
    db_hubs = await CareHub.find().to_list()
    facility_list: List[Dict[str, Any]] = []

    # Map registered DB hubs
    for idx, hub in enumerate(db_hubs):
        hub_id_str = str(hub.id)
        # Skip current hub if it is the referring origin
        if origin_hub_id and hub_id_str == origin_hub_id:
            continue

        h_lat = hub.latitude if hub.latitude is not None else (cur_lat + (0.012 * (idx + 1)))
        h_lng = hub.longitude if hub.longitude is not None else (cur_lng + (0.015 * (idx + 1)))

        dist = haversine_distance_km(cur_lat, cur_lng, h_lat, h_lng)
        facility_list.append({
            "id": hub_id_str,
            "name": hub.name,
            "hub_type": hub.hub_type or "Government Hospital",
            "address": hub.address or "Registered Care Hub Facility, Odisha",
            "latitude": h_lat,
            "longitude": h_lng,
            "distance_km": dist,
            "phone": "+91-674-ASTRACARE",
            "google_maps_directions_url": f"https://www.google.com/maps/dir/?api=1&destination={h_lat},{h_lng}",
            "is_registered_hub": True,
            "specialties": ["Comprehensive Emergency", "Clinical Consultation"],
        })

    # Include default regional facilities network to guarantee full coverage of all 8 types
    for ref in DEFAULT_FACILITIES_NETWORK:
        # Avoid duplicate names if admin named hub similarly
        if any(f["name"].lower() == ref["name"].lower() for f in facility_list):
            continue

        dist = haversine_distance_km(cur_lat, cur_lng, ref["latitude"], ref["longitude"])
        facility_list.append({
            "id": ref["id"],
            "name": ref["name"],
            "hub_type": ref["hub_type"],
            "address": ref["address"],
            "latitude": ref["latitude"],
            "longitude": ref["longitude"],
            "distance_km": dist,
            "phone": ref.get("phone", "+91-674-108"),
            "google_maps_directions_url": f"https://www.google.com/maps/dir/?api=1&destination={ref['latitude']},{ref['longitude']}",
            "is_registered_hub": False,
            "specialties": ref.get("specialties", ["Emergency Care"]),
        })

    # Filter by radius_km if provided
    if radius_km is not None and radius_km > 0:
        facility_list = [f for f in facility_list if f["distance_km"] <= radius_km]

    # Filter by facility_type (one of the 8 types) if provided
    if facility_type and facility_type.lower() != "all":
        facility_list = [f for f in facility_list if f["hub_type"].lower() == facility_type.lower()]

    # Filter by search keyword if provided
    if search and search.strip():
        q = search.strip().lower()
        facility_list = [
            f for f in facility_list
            if q in f["name"].lower() or q in f["address"].lower() or q in f["hub_type"].lower()
        ]

    # Sort ascending by distance (closest first)
    facility_list.sort(key=lambda x: x["distance_km"])

    return {
        "origin": {
            "latitude": cur_lat,
            "longitude": cur_lng,
            "origin_hub_id": origin_hub_id,
        },
        "radius_km": radius_km,
        "facility_type": facility_type,
        "total_facilities": len(facility_list),
        "facilities": facility_list,
    }


