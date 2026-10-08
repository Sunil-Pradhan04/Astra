import os
import sys
import json
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# Add backend directory to sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.urgency.models import UrgencySignalEntry, MatchedSignal
from app.urgency.config import urgency_settings
from app.urgency.keyword_detector import KeywordDetector, normalize_text
from app.urgency.semantic_detector import SemanticDetector
from app.urgency.detector import UrgencyDetector


class TestUrgencyDetector(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Initializes the shared detector once for all tests."""
        cls.detector = UrgencyDetector()
        cls.detector.initialize()

    # --------------------------------------------------------------------------
    # Test 1: Exact keyword match
    # --------------------------------------------------------------------------
    def test_01_exact_keyword_match(self):
        result = self.detector.detect_urgency("cannot breathe")
        self.assertTrue(result.urgency_signal_detected)
        self.assertEqual(result.layer, "keyword")
        self.assertEqual(result.action, "HIGH_PRIORITY_REVIEW")
        self.assertTrue(any(s.signal_id == "breathing_difficulty" for s in result.signals))
        self.assertIsNone(result.signals[0].similarity)

    # --------------------------------------------------------------------------
    # Test 2: Multi-word phrase match
    # --------------------------------------------------------------------------
    def test_02_phrase_match(self):
        result = self.detector.detect_urgency("I fainted while walking")
        self.assertTrue(result.urgency_signal_detected)
        self.assertEqual(result.layer, "keyword")
        self.assertTrue(any(s.signal_id == "loss_of_consciousness" for s in result.signals))
        self.assertEqual(result.action, "HIGH_PRIORITY_REVIEW")

    # --------------------------------------------------------------------------
    # Test 3: Case variation
    # --------------------------------------------------------------------------
    def test_03_case_variation(self):
        result = self.detector.detect_urgency("i CaNnOt bReAtHe properly")
        self.assertTrue(result.urgency_signal_detected)
        self.assertEqual(result.layer, "keyword")
        self.assertTrue(any(s.signal_id == "breathing_difficulty" for s in result.signals))

    # --------------------------------------------------------------------------
    # Test 4: Punctuation variation
    # --------------------------------------------------------------------------
    def test_04_punctuation_variation(self):
        # Includes contractions, ellipses, exclamation marks
        result = self.detector.detect_urgency("Help!! I can't breathe... please...")
        self.assertTrue(result.urgency_signal_detected)
        self.assertEqual(result.layer, "keyword")
        self.assertTrue(any(s.signal_id == "breathing_difficulty" for s in result.signals))

    # --------------------------------------------------------------------------
    # Test 5: No keyword -> semantic detection fallback
    # --------------------------------------------------------------------------
    def test_05_no_keyword_semantic_fallback(self):
        # Phrase does not contain exact keywords, but clearly describes air deprivation
        statement = "I feel like I do not have enough air"
        # Verify layer 1 alone does not match this phrasing
        kw_matched, _, _ = self.detector.keyword_detector.detect_keyword_signals(statement)
        self.assertFalse(kw_matched)

        # Run end-to-end detector
        result = self.detector.detect_urgency(statement)
        self.assertTrue(result.urgency_signal_detected)
        self.assertEqual(result.layer, "semantic")
        self.assertIsNotNone(result.signals[0].similarity)
        self.assertGreaterEqual(result.signals[0].similarity, urgency_settings.SEMANTIC_HIGH_THRESHOLD)
        self.assertEqual(result.signals[0].signal_id, "breathing_difficulty")

    # --------------------------------------------------------------------------
    # Test 6: Semantic positive example
    # --------------------------------------------------------------------------
    def test_06_semantic_positive_example(self):
        # Urgent statements requiring high priority review
        statements = [
            "I feel like I do not have enough air",
            "sudden collapse and completely unresponsive",
            "spurting blood from open wound",
        ]
        for stmt in statements:
            res = self.detector.detect_urgency(stmt)
            self.assertTrue(res.urgency_signal_detected, f"Failed for statement: {stmt}")
            self.assertEqual(res.action, "HIGH_PRIORITY_REVIEW")

    # --------------------------------------------------------------------------
    # Test 7: Semantic negative example (normal non-urgent symptoms)
    # --------------------------------------------------------------------------
    def test_07_semantic_negative_example(self):
        normal_statements = [
            "I have a mild headache",
            "I have had a cough for two days",
            "I feel tired today",
        ]
        for stmt in normal_statements:
            res = self.detector.detect_urgency(stmt)
            self.assertFalse(
                res.urgency_signal_detected,
                f"False positive triggered on normal symptom: {stmt}"
            )
            self.assertEqual(res.action, "NO_URGENCY_SIGNAL")
            self.assertEqual(res.layer, "none")
            self.assertEqual(len(res.signals), 0)

    # --------------------------------------------------------------------------
    # Test 8: Multiple urgency signals in one input
    # --------------------------------------------------------------------------
    def test_08_multiple_urgency_signals(self):
        statement = "I cannot breathe and the bleeding won't stop"
        res = self.detector.detect_urgency(statement)
        self.assertTrue(res.urgency_signal_detected)
        self.assertEqual(res.layer, "keyword")
        signal_ids = {s.signal_id for s in res.signals}
        self.assertIn("breathing_difficulty", signal_ids)
        self.assertIn("severe_bleeding", signal_ids)
        self.assertGreaterEqual(len(res.signals), 2)

    # --------------------------------------------------------------------------
    # Test 9: Uncertain semantic result
    # --------------------------------------------------------------------------
    def test_09_uncertain_semantic_result(self):
        # Borderline statement tested with custom thresholds
        custom_detector = UrgencyDetector()
        custom_detector.keyword_detector = self.detector.keyword_detector
        custom_detector.semantic_detector = self.detector.semantic_detector
        custom_detector._entries = self.detector._entries
        custom_detector._is_initialized = True

        # Simulate a controlled score in the uncertainty window
        with patch.object(
            custom_detector.semantic_detector,
            "detect_semantic_signals",
            return_value=(
                False,
                [MatchedSignal(signal_id="breathing_difficulty", similarity=0.880, matched_phrase=None)],
                "UNCERTAIN_NEEDS_FURTHER_EVALUATION",
                []
            )
        ):
            res = custom_detector.detect_urgency("mild chest discomfort after running yesterday")
            self.assertFalse(res.urgency_signal_detected)
            self.assertEqual(res.layer, "semantic")
            self.assertEqual(res.action, "UNCERTAIN_NEEDS_FURTHER_EVALUATION")
            self.assertTrue(res.requires_human_review)

    # --------------------------------------------------------------------------
    # Test 10: Empty and whitespace input
    # --------------------------------------------------------------------------
    def test_10_empty_input(self):
        test_cases = ["", "   ", "\n\t", None]
        for val in test_cases:
            res = self.detector.detect_urgency(val)
            self.assertFalse(res.urgency_signal_detected)
            self.assertEqual(res.layer, "none")
            self.assertEqual(res.action, urgency_settings.ACTION_NO_INPUT)
            self.assertFalse(res.requires_human_review)

    # --------------------------------------------------------------------------
    # Test 11: Model runtime failure handling (Fail-Safe)
    # --------------------------------------------------------------------------
    def test_11_model_failure_handling(self):
        fail_detector = UrgencyDetector()
        fail_detector.keyword_detector = self.detector.keyword_detector
        fail_detector.semantic_detector = MagicMock()
        fail_detector.semantic_detector.detect_semantic_signals.side_effect = RuntimeError(
            "CUDA Out of Memory simulation"
        )
        fail_detector._is_initialized = True

        # Phrase that bypasses keyword matching and triggers semantic
        res = fail_detector.detect_urgency("having an unusual feeling in my left thorax")
        self.assertFalse(res.urgency_signal_detected)
        self.assertEqual(res.layer, "error")
        self.assertEqual(res.action, "SAFETY_CHECK_UNAVAILABLE")
        self.assertTrue(res.requires_human_review)
        self.assertIn("CUDA Out of Memory simulation", res.error_details)

    # --------------------------------------------------------------------------
    # Test 12: Knowledge-base failure handling
    # --------------------------------------------------------------------------
    def test_12_knowledge_base_failure(self):
        broken_detector = UrgencyDetector()
        with self.assertRaises(FileNotFoundError):
            broken_detector.load_knowledge_base("non_existent_file_path.json")

        # Malformed JSON
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json") as f:
            f.write('{"invalid": "must be array"}')
            temp_path = f.name

        try:
            with self.assertRaises(ValueError):
                broken_detector.load_knowledge_base(temp_path)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    # --------------------------------------------------------------------------
    # Test 13: Semantic model is NOT called when keyword matching succeeds
    # --------------------------------------------------------------------------
    def test_13_semantic_not_called_on_keyword_match(self):
        spy_detector = UrgencyDetector()
        spy_detector.keyword_detector = self.detector.keyword_detector
        spy_detector.semantic_detector = MagicMock()
        spy_detector._is_initialized = True

        res = spy_detector.detect_urgency("cannot breathe")
        self.assertTrue(res.urgency_signal_detected)
        self.assertEqual(res.layer, "keyword")
        # Semantic detector must NOT have been called
        spy_detector.semantic_detector.detect_semantic_signals.assert_not_called()

    # --------------------------------------------------------------------------
    # Test 14: Verify that external network APIs are NEVER called
    # --------------------------------------------------------------------------
    def test_14_no_external_network_calls(self):
        # Patch socket and HTTP libraries to ensure zero outgoing requests
        with patch("socket.socket") as mock_socket:
            res = self.detector.detect_urgency("I feel like I do not have enough air")
            mock_socket.assert_not_called()
        self.assertTrue(res.urgency_signal_detected)

    # --------------------------------------------------------------------------
    # Test 15: Verify embedding model is loaded only once
    # --------------------------------------------------------------------------
    def test_15_model_loaded_only_once(self):
        first_model_ref = self.detector.semantic_detector._model
        self.assertIsNotNone(first_model_ref)

        # Call load_model again
        self.detector.semantic_detector.load_model()
        second_model_ref = self.detector.semantic_detector._model

        # Identity check: Must be the identical object in RAM
        self.assertIs(first_model_ref, second_model_ref)


if __name__ == "__main__":
    unittest.main()
