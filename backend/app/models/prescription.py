from beanie import Document
from datetime import datetime
from typing import Optional, Dict, Any, List
from pymongo import IndexModel, ASCENDING


class PrescriptionRecord(Document):
    record_id: str                      # e.g. RX-5f3a1b2c
    patient_id: str                     # e.g. P-0001
    care_hub_id: str                    # references CareHub._id
    device_id: Optional[str] = None     # kiosk endpoint device
    session_id: Optional[str] = None

    # Stored image file information
    image_url: str                      # e.g. /uploads/prescriptions/filename.jpg
    image_filename: str
    image_path: str                     # Local filesystem path
    file_size_bytes: int = 0
    mime_type: str = "image/jpeg"

    # Image Quality Audit (OpenCV / Pillow)
    quality_metrics: Dict[str, Any] = {}
    is_quality_passed: bool = False

    # Classification (PyTorch MobileNetV3)
    classification: str = "unknown"     # "printed" | "handwritten"
    classifier_confidence: float = 0.0

    # OCR Extraction (PaddleOCR) — only if printed & passed quality
    ocr_text: Optional[str] = None
    ocr_confidence: Optional[float] = None
    ocr_lines: Optional[List[Dict[str, Any]]] = None

    # Structured Medical Information (Sarvam LLM)
    structured_data: Optional[Dict[str, Any]] = None

    # Pipeline Processing Status & Review State
    processing_status: str              # "completed" | "handwritten_human_review_required" | "quality_rejected" | "ocr_validation_failed"
    status_message: str
    reviewer_notes: Optional[str] = None

    created_at: datetime = datetime.utcnow()

    class Settings:
        name = "prescription_records"
        indexes = [
            IndexModel([("record_id", ASCENDING)], unique=True),
            IndexModel([("patient_id", ASCENDING)]),
            IndexModel([("care_hub_id", ASCENDING)]),
            IndexModel([("created_at", ASCENDING)]),
        ]
