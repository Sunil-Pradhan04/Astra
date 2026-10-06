from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import settings

_client: AsyncIOMotorClient = None


async def init_db():
    """Initialise Motor client and Beanie ODM."""
    global _client

    from app.models.admin import Admin
    from app.models.care_hub import CareHub
    from app.models.doctor import Doctor
    from app.models.health_worker import HealthWorker
    from app.models.endpoint_device import EndpointDevice
    from app.models.patient import Patient
    from app.models.prescription import PrescriptionRecord

    _client = AsyncIOMotorClient(settings.MONGO_URI)
    database = _client[settings.DB_NAME]

    await init_beanie(
        database=database,
        document_models=[Admin, CareHub, Doctor, HealthWorker, EndpointDevice, Patient, PrescriptionRecord],
    )
