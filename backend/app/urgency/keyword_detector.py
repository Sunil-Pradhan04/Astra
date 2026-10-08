"""
Urgency Signal Detection — Layer 1: Keyword & Phrase Detector
=============================================================
Fast, zero-dependency, fully local deterministic keyword/phrase scanner.
Bypasses NLP embeddings entirely when explicit urgency signals are matched.

Features:
- Unicode NFKC normalization (supports English, Hindi, Odia, and Indian scripts).
- Contraction expansion and punctuation normalization.
- Multi-word phrase matching with boundary protection.
- Configurable rules loaded from urgency knowledge base.
"""

import re
import unicodedata
from typing import List, Tuple, Dict, Any, Optional

from app.urgency.models import MatchedSignal, UrgencySignalEntry
from app.urgency.config import urgency_settings


# Common contraction expansions for robust matching
CONTRACTIONS = {
    "can't": "cannot",
    "cant": "cannot",
    "won't": "will not",
    "wont": "will not",
    "i'm": "i am",
    "im": "i am",
    "don't": "do not",
    "dont": "do not",
    "didn't": "did not",
    "didnt": "did not",
    "doesn't": "does not",
    "doesnt": "does not",
    "isn't": "is not",
    "isnt": "is not",
    "aren't": "are not",
    "arent": "are not",
}

# Regex to strip non-word punctuation while retaining Indian script characters
PUNCTUATION_PATTERN = re.compile(r"[^\w\s]", re.UNICODE)


def normalize_text(text: str) -> str:
    """
    Normalizes input text for resilient keyword and phrase matching:
    1. Unicode NFKC normalization.
    2. Lowercase transformation.
    3. English contraction normalization.
    4. Punctuation removal while preserving Unicode letters (Indic scripts).
    5. Whitespace consolidation.
    """
    if not text:
        return ""

    # 1. Unicode NFKC
    normalized = unicodedata.normalize("NFKC", text)

    # 2. Lowercase
    normalized = normalized.lower()

    # 3. Expand contractions
    words = normalized.split()
    expanded_words = [CONTRACTIONS.get(w, w) for w in words]
    normalized = " ".join(expanded_words)

    # 4. Remove punctuation
    normalized = PUNCTUATION_PATTERN.sub(" ", normalized)

    # 5. Collapse multiple whitespaces
    normalized = " ".join(normalized.split())
    return normalized


class KeywordDetector:
    """
    Deterministic Layer 1 matcher that checks patient input against configured
    multi-word phrases and clinical trigger terms.
    """

    def __init__(self, entries: Optional[List[UrgencySignalEntry]] = None):
        self._rules: List[Dict[str, Any]] = []
        if entries:
            self.load_entries(entries)

    def load_entries(self, entries: List[UrgencySignalEntry]):
        """
        Builds a compiled index of normalized multi-word phrases and keywords.
        Sorted by descending length so more specific phrases match first.
        """
        rules = []
        for entry in entries:
            # Combine explicit keywords and short examples (< 60 chars)
            phrases_to_index = set(entry.keywords)
            for ex in entry.examples:
                if len(ex) < 60:
                    phrases_to_index.add(ex)

            for raw_phrase in phrases_to_index:
                norm_phrase = normalize_text(raw_phrase)
                if norm_phrase:
                    rules.append({
                        "signal_id": entry.id,
                        "action": entry.action,
                        "norm_phrase": norm_phrase,
                        "original_phrase": raw_phrase,
                        "length": len(norm_phrase),
                    })

        # Sort descending by length for greedy, specific phrase matching
        rules.sort(key=lambda r: r["length"], reverse=True)
        self._rules = rules

    def detect_keyword_signals(self, text: str) -> Tuple[bool, List[MatchedSignal], str]:
        """
        Scans normalized text for configured urgency phrases.
        Returns: (has_signal: bool, signals: List[MatchedSignal], action: str)
        """
        if not text or not text.strip():
            return False, [], urgency_settings.ACTION_NO_SIGNAL

        norm_text = normalize_text(text)
        if not norm_text:
            return False, [], urgency_settings.ACTION_NO_SIGNAL

        # Surround with spaces for clean token-boundary substring checking
        padded_haystack = f" {norm_text} "

        matched_signals: List[MatchedSignal] = []
        seen_signal_ids = set()
        selected_action = urgency_settings.ACTION_HIGH_PRIORITY

        for rule in self._rules:
            needle = f" {rule['norm_phrase']} "
            if needle in padded_haystack:
                sig_id = rule["signal_id"]
                if sig_id not in seen_signal_ids:
                    seen_signal_ids.add(sig_id)
                    matched_signals.append(
                        MatchedSignal(
                            signal_id=sig_id,
                            matched_phrase=rule["original_phrase"],
                            similarity=None,
                        )
                    )
                    selected_action = rule["action"]

        if matched_signals:
            return True, matched_signals, selected_action

        return False, [], urgency_settings.ACTION_NO_SIGNAL
