from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.database import init_db
from app.core.config import settings
from app.routers import auth, care_hub, doctors, health_workers, endpoint_devices, communicate, settings as settings_router, patients, kiosk, qr_upload, translation, urgency, system_test


import asyncio
import warnings

# Suppress PyTorch and dependency deprecation notices
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # 1. Initialize local urgency signal detector (loads model + precomputes reference vectors once)
    try:
        from app.urgency.detector import urgency_detector
        urgency_detector.initialize()
    except Exception as e:
        import logging
        logging.getLogger("astra").error(f"Failed to initialize urgency detector during startup: {e}")

    # 2. Preload & Warm up OCR models (MobileNetV3 + PaddleOCR detection/recognition)
    try:
        from app.services.ocr_service import ocr_service
        await asyncio.to_thread(ocr_service.preload_models)
    except Exception as e:
        import logging
        logging.getLogger("astra").error(f"Failed to preload OCR models during startup: {e}")

    # 3. Preload Local Kokoro TTS models (English + Hindi)
    try:
        from app.services.local_tts_service import local_tts
        await asyncio.to_thread(local_tts.preload_models)
    except Exception as e:
        import logging
        logging.getLogger("astra").error(f"Failed to preload TTS models during startup: {e}")
    try:
        yield
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass


app = FastAPI(
    title="Astra Healthcare API",
    description="Backend for Astra — smart healthcare portal",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow local hostnames, configured URLs, and any LAN IP subnet (Wi-Fi access)
cors_origins = [settings.FRONTEND_URL, "http://localhost:5174", "http://localhost:5173"]
if settings.FRONTEND_LAN_URL and settings.FRONTEND_LAN_URL.strip():
    cors_origins.append(settings.FRONTEND_LAN_URL.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

# Mount static uploads directory for document images
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Register all routers
app.include_router(auth.router,              prefix="/api")
app.include_router(care_hub.router,          prefix="/api")
app.include_router(doctors.router,           prefix="/api")
app.include_router(health_workers.router,    prefix="/api")
app.include_router(endpoint_devices.router,  prefix="/api")
app.include_router(communicate.router,       prefix="/api")
app.include_router(settings_router.router,   prefix="/api")
app.include_router(patients.router,          prefix="/api")
app.include_router(kiosk.router,             prefix="/api")
app.include_router(qr_upload.router,         prefix="/api")  # QR-based photo import
app.include_router(translation.router,       prefix="/api")  # 11-Language Medical Translation Machine
app.include_router(urgency.router,           prefix="/api")
app.include_router(urgency.router)  # Direct /triage/urgency support
app.include_router(system_test.router,       prefix="/api")


@app.get("/")
async def root():
    return {"status": "Astra API running", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "Astra API"}
