"""
Urgency Signal Detection — Core Pipeline Orchestrator
=====================================================
Integrates Layer 1 (Keyword/Phrase) and Layer 2 (Local Semantic Embedding)
into a production-grade, low-latency triage screening pipeline.

Guarantees:
1. Fast-path: Keyword match terminates immediately without executing NLP embeddings.
2. Local execution: 100% on-device, zero remote API or database dependencies.
3. Fail-safe: Detectors never silently mask runtime errors as 'NO_URGENCY_SIGNAL'.
4. Clinical safety: Explains findings, flags cases for human review, never diagnoses.
"""

import os
import json
import time
import logging
from typing import List, Optional

from app.urgency.models import (
    UrgencySignalEntry,
    UrgencyDetectionRequest,
    UrgencyDetectionResponse,
    MatchedSignal,
)
from app.urgency.config import urgency_settings
from app.urgency.keyword_detector import KeywordDetector
from app.urgency.semantic_detector import SemanticDetector

logger = logging.getLogger("astra.urgency_detector")


class UrgencyDetector:
    """
    Two-layer local urgency detection orchestrator.
    """

    def __init__(self):
        self.keyword_detector = KeywordDetector()
        self.semantic_detector = SemanticDetector()
        self._entries: List[UrgencySignalEntry] = []
        self._is_initialized: bool = False

    @property
    def is_initialized(self) -> bool:
        return self._is_initialized

    def load_knowledge_base(self, path: Optional[str] = None) -> List[UrgencySignalEntry]:
        """
        Loads and parses the urgency signals knowledge base JSON file.
        """
        kb_path = path or urgency_settings.KNOWLEDGE_BASE_PATH
        if not os.path.exists(kb_path):
            raise FileNotFoundError(f"Urgency knowledge base file not found at: {kb_path}")

        try:
            with open(kb_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            if not isinstance(raw_data, list):
                raise ValueError("Knowledge base root must be a JSON array of signal objects.")

            entries = [UrgencySignalEntry(**item) for item in raw_data]
            if not entries:
                raise ValueError("Knowledge base is empty; at least one urgency signal entry required.")

            self._entries = entries
            return entries
        except Exception as e:
            logger.error(f"[UrgencyDetector] Failed to load knowledge base: {e}")
            raise

    def initialize(
        self,
        kb_path: Optional[str] = None,
        model_name: Optional[str] = None,
        device_override: Optional[str] = None,
    ):
        """
        Initializes the entire pipeline during FastAPI application startup:
        1. Loads knowledge base.
        2. Configures Layer 1 keyword rules.
        3. Loads Layer 2 multilingual SentenceTransformer.
        4. Precomputes all reference embeddings in RAM.
        """
        t0 = time.perf_counter()
        logger.info("[UrgencyDetector] Initializing two-layer urgency detection pipeline...")

        # 1. Load Knowledge Base
        entries = self.load_knowledge_base(kb_path)
        logger.info(f"[UrgencyDetector] Loaded {len(entries)} urgency concepts from knowledge base.")

        # 2. Configure Layer 1 Keywords
        self.keyword_detector.load_entries(entries)

        # 3. Configure Layer 2 Semantic Model & Precompute Embeddings
        self.semantic_detector.load_model(model_name=model_name, device_override=device_override)
        self.semantic_detector.precompute_references(entries)

        self._is_initialized = True
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            f"[UrgencyDetector] Pipeline initialized successfully in {elapsed_ms:.1f}ms "
            f"(device: {self.semantic_detector.device}). Ready for low-latency inference."
        )

    def detect_urgency(
        self,
        text: str,
        patient_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> UrgencyDetectionResponse:
        """
        Executes the two-layer detection pipeline on patient input:

        Layer 1: Deterministic normalized keyword/phrase match.
                 If matched -> return immediately (no NLP embedding).
        Layer 2: Local SentenceTransformer semantic cosine similarity.
                 If above threshold -> urgency detected.
                 If in uncertainty band -> flagged for further review.
                 Else -> no signal.
        """
        if isinstance(text, UrgencyDetectionRequest):
            if not patient_id:
                patient_id = text.case_id
            text = text.text

        start_time = time.perf_counter()
        trace_id = patient_id or session_id or "anon_case"

        # 1. Input Validation
        if text is None or not str(text).strip():
            logger.info(f"[UrgencyDetector] Empty text received for trace {trace_id}.")
            return UrgencyDetectionResponse(
                urgency_signal_detected=False,
                layer="none",
                signals=[],
                action=urgency_settings.ACTION_NO_INPUT,
                requires_human_review=False,
                top_candidates=[],
                processing_time_ms=0.0,
            )
        text = str(text)

        try:
            # 2. LAYER 1: KEYWORD / PHRASE MATCHING
            kw_detected, kw_signals, kw_action = self.keyword_detector.detect_keyword_signals(text)

            if kw_detected:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
                matched_id = kw_signals[0].signal_id if kw_signals else "unknown"

                # Log performance without logging sensitive patient text
                logger.info(
                    f"[UrgencyDetector] Layer 1 MATCH (trace: {trace_id}, signal: {matched_id}, "
                    f"latency: {elapsed_ms}ms). Bypassing Layer 2 NLP embedding."
                )

                return UrgencyDetectionResponse(
                    urgency_signal_detected=True,
                    layer="keyword",
                    signals=kw_signals,
                    action=kw_action,
                    requires_human_review=True,
                    top_candidates=kw_signals,
                    processing_time_ms=elapsed_ms,
                )

            # 3. LAYER 2: LOCAL NLP SEMANTIC MATCHING (Run only if Layer 1 found no signal)
            sem_detected, sem_signals, sem_action, top_k = self.semantic_detector.detect_semantic_signals(text)

            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            primary_sig_id = sem_signals[0].signal_id if sem_signals else "none"

            if sem_detected:
                logger.info(
                    f"[UrgencyDetector] Layer 2 MATCH (trace: {trace_id}, signal: {primary_sig_id}, "
                    f"sim: {sem_signals[0].similarity}, latency: {elapsed_ms}ms)."
                )
                return UrgencyDetectionResponse(
                    urgency_signal_detected=True,
                    layer="semantic",
                    signals=sem_signals,
                    action=sem_action,
                    requires_human_review=True,
                    top_candidates=top_k,
                    processing_time_ms=elapsed_ms,
                )

            elif sem_action == urgency_settings.ACTION_UNCERTAIN:
                logger.info(
                    f"[UrgencyDetector] Layer 2 UNCERTAIN (trace: {trace_id}, candidate: {primary_sig_id}, "
                    f"sim: {sem_signals[0].similarity if sem_signals else None}, latency: {elapsed_ms}ms)."
                )
                return UrgencyDetectionResponse(
                    urgency_signal_detected=False,
                    layer="semantic",
                    signals=sem_signals,
                    action=urgency_settings.ACTION_UNCERTAIN,
                    requires_human_review=True,
                    top_candidates=top_k,
                    processing_time_ms=elapsed_ms,
                )

            else:
                logger.info(
                    f"[UrgencyDetector] NO SIGNAL (trace: {trace_id}, latency: {elapsed_ms}ms)."
                )
                return UrgencyDetectionResponse(
                    urgency_signal_detected=False,
                    layer="none",
                    signals=[],
                    action=urgency_settings.ACTION_NO_SIGNAL,
                    requires_human_review=False,
                    top_candidates=top_k,
                    processing_time_ms=elapsed_ms,
                )

        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"[UrgencyDetector] Safety detector failure on trace {trace_id}: {str(e)}",
                exc_info=True,
            )
            # Fail-safe behavior: Alert that safety check is unavailable, require human review
            return UrgencyDetectionResponse(
                urgency_signal_detected=False,
                layer="error",
                signals=[],
                action=urgency_settings.ACTION_SAFETY_UNAVAILABLE,
                requires_human_review=True,
                top_candidates=[],
                processing_time_ms=elapsed_ms,
                error_details=f"Urgency detection subsystem encounter: {str(e)}",
            )


# Global singleton instance
urgency_detector = UrgencyDetector()
