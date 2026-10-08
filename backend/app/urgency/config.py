"""
Urgency Signal Detection — Configuration
========================================
Centralized configuration parameters, thresholds, and model specifications.

IMPORTANT CLINICAL NOTE:
Thresholds (SEMANTIC_HIGH_THRESHOLD and SEMANTIC_UNCERTAIN_THRESHOLD) are engineering
decision boundaries calibrated for sensitivity in a triage-support environment.
They do NOT represent clinically validated risk curves.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


DEFAULT_KB_PATH = str(Path(__file__).resolve().parent / "data" / "urgency_signals.json")


class UrgencySettings(BaseSettings):
    """
    Configuration parameters for urgency screening.
    Supports environment variable overrides (e.g. URGENCY_HIGH_THRESHOLD=0.88).
    """
    # Knowledge Base
    KNOWLEDGE_BASE_PATH: str = DEFAULT_KB_PATH

    # Local SentenceTransformer Model
    EMBEDDING_MODEL_NAME: str = "intfloat/multilingual-e5-small"
    EMBEDDING_DIM: int = 384
    # "auto", "cuda", or "cpu"
    EMBEDDING_DEVICE: str = "auto"
    USE_E5_PREFIXES: bool = True  # Prepends "passage: " and "query: " for E5 models

    # Semantic Thresholds (Configurable, uncoupled from medical certainty)
    SEMANTIC_HIGH_THRESHOLD: float = 0.885
    SEMANTIC_UNCERTAIN_THRESHOLD: float = 0.878
    SEMANTIC_TOP_K: int = 3

    # Standard Clinical Routing Actions
    ACTION_HIGH_PRIORITY: str = "HIGH_PRIORITY_REVIEW"
    ACTION_UNCERTAIN: str = "UNCERTAIN_NEEDS_FURTHER_EVALUATION"
    ACTION_NO_SIGNAL: str = "NO_URGENCY_SIGNAL"
    ACTION_SAFETY_UNAVAILABLE: str = "SAFETY_CHECK_UNAVAILABLE"
    ACTION_NO_INPUT: str = "NO_INPUT_PROVIDED"

    class Config:
        env_prefix = "URGENCY_"
        extra = "ignore"


urgency_settings = UrgencySettings()
