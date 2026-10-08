"""
Urgency Signal Detection — Data Models
======================================
Defines Pydantic schemas for urgency signals, detection requests, and
standardized structured responses.

IMPORTANT:
This module is a triage-support screening tool and NOT a diagnostic device.
Similarity metrics represent semantic vector closeness and NEVER medical risk,
emergency probability, or clinical certainty.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


class MatchedSignal(BaseModel):
    """
    Representation of an individual matched urgency signal candidate.
    """
    signal_id: str = Field(..., description="Unique identifier of the urgency signal concept.")
    matched_phrase: Optional[str] = Field(
        default=None,
        description="Exact phrase matched by Layer 1 keyword detector, or None if detected semantically."
    )
    similarity: Optional[float] = Field(
        default=None,
        description="Cosine similarity score (0.0 - 1.0) against reference urgency embeddings. None for keyword matches."
    )


class UrgencySignalEntry(BaseModel):
    """
    Knowledge-base schema for an urgency signal concept.
    """
    id: str = Field(..., description="Unique signal concept identifier (e.g. breathing_difficulty).")
    description: Optional[str] = Field(default="", description="Clinical description of the triage signal.")
    action: str = Field(default="HIGH_PRIORITY_REVIEW", description="Workflow action recommendation.")
    keywords: List[str] = Field(
        default_factory=list,
        description="Explicit keywords and multi-word phrases for Layer 1 normalized matching."
    )
    examples: List[str] = Field(
        default_factory=list,
        description="Representative phrases and sentences across languages for Layer 2 semantic matching."
    )


class UrgencyDetectionRequest(BaseModel):
    """
    Inbound request schema for urgency screening.
    """
    text: str = Field(
        ...,
        description="Patient statement or reported symptom description to be screened for urgency signals."
    )
    patient_id: Optional[str] = Field(
        default=None,
        description="Optional synthetic patient or session identifier for traceability without logging raw PII."
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Optional kiosk/triage session ID."
    )

    @field_validator("text")
    def validate_non_empty(cls, v: str) -> str:
        if v is None:
            raise ValueError("Input text cannot be null.")
        return v


class UrgencyDetectionResponse(BaseModel):
    """
    Structured outcome of the urgency detection pipeline.
    """
    urgency_signal_detected: bool = Field(
        ...,
        description="True if an actionable urgency signal is detected via keyword or semantic threshold."
    )
    layer: Literal["keyword", "semantic", "none", "error"] = Field(
        ...,
        description="The detection layer that produced the outcome: 'keyword', 'semantic', 'none', or 'error'."
    )
    signals: List[MatchedSignal] = Field(
        default_factory=list,
        description="Primary matching urgency signals triggering the decision."
    )
    action: str = Field(
        ...,
        description="Recommended clinical triage routing action (e.g. HIGH_PRIORITY_REVIEW, UNCERTAIN_NEEDS_FURTHER_EVALUATION, NO_URGENCY_SIGNAL)."
    )
    requires_human_review: bool = Field(
        default=False,
        description="True if flagged as urgent, uncertain, or if a safety detector failure occurred."
    )
    top_candidates: Optional[List[MatchedSignal]] = Field(
        default=None,
        description="Top-k nearest semantic candidate signals for clinical transparency and auditability."
    )
    processing_time_ms: Optional[float] = Field(
        default=None,
        description="Total roundtrip detection processing duration in milliseconds."
    )
    disclaimer: str = Field(
        default="Triage-support screening aid only. Not a diagnostic decision or emergency probability assessment.",
        description="Standard clinical safety notice."
    )
    error_details: Optional[str] = Field(
        default=None,
        description="Sanitized system diagnostic message if a safety fallback occurred."
    )
