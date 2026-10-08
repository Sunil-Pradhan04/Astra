"""
Urgency Signal Detection — Layer 2: Local Semantic Matcher
==========================================================
Low-latency local sentence embedding matcher using SentenceTransformers.
Precomputes all urgency reference vectors once during application startup,
holds reference matrices in RAM, and uses vectorized NumPy cosine similarity
during inference.

CRITICAL DESIGN PRINCIPLES:
- 100% on-device / local execution.
- Zero remote API calls (no OpenAI, no external network requests).
- No Pinecone queries.
- Thread-safe inference for FastAPI concurrency.
- Vectorized dot product (fast matrix-vector math, < 2ms).
- Strictly non-diagnostic: similarity score denotes semantic vector closeness,
  NEVER medical risk probability or clinical certainty.
"""

import threading
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from app.urgency.models import MatchedSignal, UrgencySignalEntry
from app.urgency.config import urgency_settings


class SemanticDetector:
    """
    Manages the local sentence embedding model and precomputed urgency reference vectors.
    """

    def __init__(self):
        self._model: Optional[SentenceTransformer] = None
        self._reference_matrix: Optional[np.ndarray] = None  # Shape: (N, 384)
        self._reference_metadata: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._is_ready: bool = False
        self._device: str = "cpu"

    @property
    def is_ready(self) -> bool:
        """Returns True if the model and reference vectors are ready in RAM."""
        return self._is_ready

    @property
    def device(self) -> str:
        """Returns the hardware execution device (cpu or cuda)."""
        return self._device

    def load_model(self, model_name: Optional[str] = None, device_override: Optional[str] = None):
        """
        Loads the SentenceTransformer model once. Thread-safe.
        """
        model_name = model_name or urgency_settings.EMBEDDING_MODEL_NAME
        target_device = device_override or urgency_settings.EMBEDDING_DEVICE

        if target_device == "auto":
            target_device = "cuda" if torch.cuda.is_available() else "cpu"

        self._device = target_device

        with self._lock:
            if self._model is None:
                self._model = SentenceTransformer(model_name, device=self._device)
                self._model.eval()

    def precompute_references(self, entries: List[UrgencySignalEntry]):
        """
        Encodes all urgency reference examples from the knowledge base into
        unit-normalized embeddings and caches the matrix in RAM.
        """
        if self._model is None:
            self.load_model()

        corpus_texts = []
        corpus_meta = []

        for entry in entries:
            for example in entry.examples:
                clean_ex = example.strip()
                if clean_ex:
                    corpus_texts.append(clean_ex)
                    corpus_meta.append({
                        "signal_id": entry.id,
                        "action": entry.action,
                        "example_text": clean_ex,
                    })

        if not corpus_texts:
            raise ValueError("Knowledge base contains no urgency reference examples to precompute.")

        # E5 models benefit from the 'passage: ' prefix for reference text
        if urgency_settings.USE_E5_PREFIXES:
            formatted_corpus = [f"passage: {t}" for t in corpus_texts]
        else:
            formatted_corpus = corpus_texts

        with self._lock:
            # Batch encode with L2 normalization enabled
            embeddings = self._model.encode(
                formatted_corpus,
                batch_size=32,
                show_progress_bar=False,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )

            # Ensure dtype is float32 for fast SIMD / BLAS dot products
            self._reference_matrix = embeddings.astype(np.float32)
            self._reference_metadata = corpus_meta
            self._is_ready = True

    def detect_semantic_signals(
        self,
        text: str
    ) -> Tuple[bool, List[MatchedSignal], str, List[MatchedSignal]]:
        """
        Generates embedding for patient text, computes vectorized cosine similarity
        against in-memory reference matrix, and applies deterministic thresholds.

        Returns:
            (urgency_signal_detected: bool,
             primary_signals: List[MatchedSignal],
             action: str,
             top_candidates: List[MatchedSignal])
        """
        if not self._is_ready or self._model is None or self._reference_matrix is None:
            raise RuntimeError(
                "SemanticDetector is not initialized. Call precompute_references() during application startup."
            )

        if not text or not text.strip():
            return False, [], urgency_settings.ACTION_NO_SIGNAL, []

        # E5 models benefit from 'query: ' prefix for input statements
        clean_text = text.strip()
        if urgency_settings.USE_E5_PREFIXES:
            query_str = f"query: {clean_text}"
        else:
            query_str = clean_text

        # 1. Encode patient statement with unit normalization
        with self._lock:
            query_embedding = self._model.encode(
                [query_str],
                normalize_embeddings=True,
                convert_to_numpy=True,
            )[0].astype(np.float32)

        # 2. Vectorized cosine similarity (dot product on L2-normalized vectors)
        # Matrix shape: (N, 384), Vector shape: (384,) -> Result shape: (N,)
        similarities = np.dot(self._reference_matrix, query_embedding)

        # 3. Aggregate highest similarity per unique urgency signal concept
        signal_scores: Dict[str, Tuple[float, str]] = {}
        for idx, sim in enumerate(similarities):
            meta = self._reference_metadata[idx]
            sig_id = meta["signal_id"]
            score = float(sim)
            if sig_id not in signal_scores or score > signal_scores[sig_id][0]:
                signal_scores[sig_id] = (score, meta["action"])

        if not signal_scores:
            return False, [], urgency_settings.ACTION_NO_SIGNAL, []

        # 4. Sort signals by similarity descending
        sorted_signals = sorted(signal_scores.items(), key=lambda item: item[1][0], reverse=True)

        # Top-k candidate signals for transparency
        top_candidates = [
            MatchedSignal(
                signal_id=sig_id,
                matched_phrase=None,
                similarity=round(score_data[0], 4),
            )
            for sig_id, score_data in sorted_signals[: urgency_settings.SEMANTIC_TOP_K]
        ]

        # 5. Deterministic Threshold Decision
        best_sig_id, (best_score, best_action) = sorted_signals[0]

        high_thresh = urgency_settings.SEMANTIC_HIGH_THRESHOLD
        uncertain_thresh = urgency_settings.SEMANTIC_UNCERTAIN_THRESHOLD

        best_signal_obj = MatchedSignal(
            signal_id=best_sig_id,
            matched_phrase=None,
            similarity=round(best_score, 4),
        )

        if best_score >= high_thresh:
            # Urgent signal confirmed by semantic similarity
            return True, [best_signal_obj], best_action, top_candidates

        elif uncertain_thresh <= best_score < high_thresh:
            # Semantic uncertainty zone: requires additional clarification or human verification
            return False, [best_signal_obj], urgency_settings.ACTION_UNCERTAIN, top_candidates

        else:
            # Below threshold: No urgency signal detected
            return False, [], urgency_settings.ACTION_NO_SIGNAL, top_candidates
