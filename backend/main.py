from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.database import init_db
from app.core.config import settings
from app.routers import auth, care_hub, doctors, health_workers, endpoint_devices, communicate, settings as settings_router, patients, kiosk


import asyncio
import warnings

# Suppress PyTorch and dependency deprecation notices
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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

# CORS — allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5174", "http://localhost:5173"],
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


@app.get("/")
async def root():
    return {"status": "Astra API running", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "Astra API"}
