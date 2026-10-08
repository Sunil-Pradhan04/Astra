"""
Astra Healthcare — Urgency Signal Detection Package
===================================================
Production-grade, two-layer, local urgency screening pipeline.
"""

from app.urgency.config import urgency_settings, UrgencySettings
from app.urgency.models import (
    MatchedSignal,
    UrgencySignalEntry,
    UrgencyDetectionRequest,
    UrgencyDetectionResponse,
)
from app.urgency.keyword_detector import KeywordDetector, normalize_text
from app.urgency.semantic_detector import SemanticDetector
from app.urgency.detector import UrgencyDetector, urgency_detector

__all__ = [
    "urgency_settings",
    "UrgencySettings",
    "MatchedSignal",
    "UrgencySignalEntry",
    "UrgencyDetectionRequest",
    "UrgencyDetectionResponse",
    "KeywordDetector",
    "normalize_text",
    "SemanticDetector",
    "UrgencyDetector",
    "urgency_detector",
]
