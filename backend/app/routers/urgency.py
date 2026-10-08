"""
Urgency Signal Detection — FastAPI Router
=========================================
Exposes low-latency endpoints for triage-support urgency screening.

Endpoints:
- POST /triage/urgency: Evaluates patient text for configured urgency signals.
- GET  /triage/urgency/health: Reports detector readiness, hardware device, and vector counts.
- GET  /triage/urgency/signals: Lists active urgency concepts loaded in the knowledge base.
"""

from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any

from app.urgency.models import (
    UrgencyDetectionRequest,
    UrgencyDetectionResponse,
)
from app.urgency.detector import urgency_detector
from app.urgency.config import urgency_settings

router = APIRouter(prefix="/triage", tags=["Urgency Detection & Triage Screening"])


@router.post(
    "/urgency",
    response_model=UrgencyDetectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Screen patient text for urgency signals",
    description=(
        "Executes two-layer screening: Layer 1 deterministic keyword/phrase matching, "
        "falling back to Layer 2 local multilingual embedding cosine similarity. "
        "Routes detected cases to HIGH_PRIORITY_REVIEW. Never performs medical diagnosis."
    ),
)
async def detect_urgency_signal(request: UrgencyDetectionRequest) -> UrgencyDetectionResponse:
    """
    Evaluates patient symptom disclosure for configured urgency signals.
    """
    if not urgency_detector.is_initialized:
        # If application started without lifespan or is still warming up, attempt initialize
        try:
            urgency_detector.initialize()
        except Exception as init_err:
            return UrgencyDetectionResponse(
                urgency_signal_detected=False,
                layer="error",
                signals=[],
                action=urgency_settings.ACTION_SAFETY_UNAVAILABLE,
                requires_human_review=True,
                error_details=f"Detector initialization failed: {str(init_err)}",
            )

    return urgency_detector.detect_urgency(
        text=request.text,
        patient_id=request.patient_id,
        session_id=request.session_id,
    )


@router.get(
    "/urgency/health",
    summary="Check urgency detector subsystem health",
    description="Returns detector readiness, execution device (CPU/CUDA), and active threshold configuration.",
)
async def check_urgency_health() -> Dict[str, Any]:
    """
    Subsystem health check for operations monitoring.
    """
    return {
        "status": "ready" if urgency_detector.is_initialized else "uninitialized",
        "device": urgency_detector.semantic_detector.device,
        "is_ready": urgency_detector.semantic_detector.is_ready,
        "model_name": urgency_settings.EMBEDDING_MODEL_NAME,
        "embedding_dim": urgency_settings.EMBEDDING_DIM,
        "thresholds": {
            "high": urgency_settings.SEMANTIC_HIGH_THRESHOLD,
            "uncertain": urgency_settings.SEMANTIC_UNCERTAIN_THRESHOLD,
            "top_k": urgency_settings.SEMANTIC_TOP_K,
        },
        "knowledge_base_entries": len(urgency_detector._entries),
    }


@router.get(
    "/urgency/signals",
    summary="List configured urgency signal concepts",
    description="Returns all urgency concepts loaded in the knowledge base for auditability.",
)
async def list_configured_signals() -> Dict[str, Any]:
    """
    Exposes configured signals and routing actions for clinical governance.
    """
    return {
        "count": len(urgency_detector._entries),
        "signals": [
            {
                "id": entry.id,
                "description": entry.description,
                "action": entry.action,
                "keywords_count": len(entry.keywords),
                "examples_count": len(entry.examples),
            }
            for entry in urgency_detector._entries
        ],
    }
