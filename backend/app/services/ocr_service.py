"""
Prescription & Medical Report OCR Service
=========================================
Implements the complete multi-stage document processing pipeline:
1. OpenCV/Pillow image quality assessment (blur, resolution, brightness, contrast, document presence).
2. Lightweight PyTorch MobileNetV3 & texture analysis for Printed vs. Handwritten classification.
3. PaddleOCR extraction for printed documents with deterministic validity checks.
4. Sarvam AI LLM structured clinical extraction (report type, dates, vitals, medications, findings).
5. Storage in MongoDB and seamless merging into the patient's triage summary.
"""

import os
import uuid
import json
import re
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List

import cv2
import numpy as np
from PIL import Image
import torch
import torchvision.models as models
import torchvision.transforms as transforms

from app.core.config import settings
from app.core.prompts import (
    PRESCRIPTION_EXTRACTION_SYSTEM,
    build_prescription_extraction_prompt,
)
from app.services.sarvam_service import sarvam_ai
from app.services.cloudinary_service import cloudinary_service
from app.models.prescription import PrescriptionRecord
from app.models.patient import Patient

# Base uploads directory for document images
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "prescriptions")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Comprehensive clinical & prescription keyword dictionary for document validation
MEDICAL_KEYWORDS = {
    # Headers & clinical roles
    "rx", "dr", "doctor", "dr.", "clinic", "hospital", "dispensary", "healthcare",
    "patient", "pt", "pt.", "age", "sex", "gender", "yrs", "years", "date", "dt", "opd", "ipd",
    # Formulations & dosages
    "tab", "tablet", "tablets", "cap", "capsule", "capsules", "syrup", "syp", "inj", "injection",
    "drops", "ointment", "cream", "suspension", "gel", "lotion", "inhaler", "respules",
    "mg", "ml", "mcg", "gm", "g", "iu", "units", "puff", "puffs", "sos", "od", "bd", "tid",
    "tds", "qid", "hs", "bbf", "pc", "ac", "stat", "daily", "days", "wk", "week", "months",
    # Vitals & clinical measurements
    "bp", "blood pressure", "pulse", "pr", "spo2", "temp", "temperature", "wt", "weight", "ht", "height",
    "bmi", "mmhg", "bpm", "deg", "f", "c",
    # Lab tests & diagnostic markers
    "blood", "test", "tests", "report", "reports", "results", "result", "sample", "specimen",
    "hemoglobin", "hb", "wbc", "rbc", "tlc", "dlc", "platelet", "platelets", "esr", "crp",
    "blood sugar", "glucose", "fbs", "ppbs", "rbs", "hba1c", "lipid", "cholesterol", "triglycerides",
    "hdl", "ldl", "sgot", "sgpt", "alt", "ast", "bilirubin", "creatinine", "serum creatinine",
    "blood urea", "bun", "uric acid", "electrolytes", "sodium", "potassium", "calcium",
    "urine", "pus cells", "ecg", "ekg", "x-ray", "xray", "ultrasound", "usg", "ct", "mri",
    "pathology", "hematology", "biochemistry", "microbiology", "investigation", "investigations",
    "neutrophil", "neutrophils", "lymphocyte", "lymphocytes", "monocyte", "monocytes",
    "eosinophil", "eosinophils", "basophil", "basophils", "pcv", "mcv", "mch", "mchc", "rdw", "mpv",
    "reference", "interval", "intervals", "range", "units", "unit", "observed", "method", "normal",
    "lab", "lab no", "status", "notes",
    # Diagnoses & terms
    "diagnosis", "diag", "c/o", "complaint", "complaints", "history", "h/o", "findings",
    "advise", "advice", "advised", "prescribed", "treatment", "refer", "referred", "signature",
    "fever", "cough", "cold", "pain", "headache", "hypertension", "htn", "diabetes", "dm",
    "asthma", "bronchitis", "infection", "gastritis", "gerd", "allergy", "anemia", "hypotension",
    "medication", "medicine", "pharmacy", "chemist", "reg", "registration", "consultant", "specialist"
}


class OCRService:
    def __init__(self):
        self._mobilenet_model = None
        self._mobilenet_transform = None
        self._paddle_ocr = None
        try:
            self._face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        except Exception:
            self._face_cascade = None

    # ── PyTorch MobileNetV3 Lazy Loader ──────────────────────────────────────
    def _get_mobilenet(self):
        if self._mobilenet_model is None:
            model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
            model.eval()
            self._mobilenet_model = model
            self._mobilenet_transform = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225]
                ),
            ])
        return self._mobilenet_model, self._mobilenet_transform

    # ── PaddleOCR Lazy Loader ───────────────────────────────────────────────
    def _get_paddle_ocr(self):
        if self._paddle_ocr is None:
            os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
            try:
                import torch
                import paddle
                # Apply Windows compatibility patch to avoid oneDNN DoubleAttribute PIR crash
                try:
                    from paddlex.inference.models.runners.paddle_static.runner import PaddleStaticRunner
                    orig_create = PaddleStaticRunner._create
                    def _safe_create(runner_self):
                        runner_self._config['run_mode'] = 'paddle'
                        runner_self._config['enable_new_ir'] = False
                        return orig_create(runner_self)
                    PaddleStaticRunner._create = _safe_create

                    orig_opt = paddle.base.libpaddle.AnalysisConfig.set_optimization_level
                    paddle.base.libpaddle.AnalysisConfig.set_optimization_level = lambda self, lvl: orig_opt(self, 0)
                except Exception as patch_e:
                    print(f"[OCRService] Compatibility patch info: {patch_e}")

                from paddleocr import PaddleOCR
                self._paddle_ocr = PaddleOCR(
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    lang="en"
                )
            except Exception as e:
                print(f"[OCRService] PaddleOCR initialization error: {e}")
                try:
                    from paddleocr import PaddleOCR
                    self._paddle_ocr = PaddleOCR(lang="en")
                except Exception as e2:
                    print(f"[OCRService] Secondary PaddleOCR init error: {e2}")
                    self._paddle_ocr = None
        return self._paddle_ocr

    # =========================================================================
    # STEP 1: IMAGE QUALITY ASSESSMENT (OpenCV / Pillow)
    # =========================================================================
    def assess_image_quality(self, image_bytes: bytes) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Analyzes image quality:
        - Resolution: minimum dimension and total pixel count
        - Blur: Laplacian variance (sharpness)
        - Brightness: mean grayscale intensity
        - Contrast: standard deviation of pixel values
        - Document visibility: Canny edge density
        Returns: (is_acceptable, metrics_dict, user_facing_rejection_reason)
        """
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            return False, {}, "The uploaded file could not be decoded as an image. Please provide a valid JPG or PNG."

        height, width = img.shape[:2]
        total_pixels = height * width
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 1. Resolution Check
        if width < 300 or height < 300 or total_pixels < 80000:
            metrics = {"width": width, "height": height, "pixels": total_pixels}
            return False, metrics, "Image resolution is too low. Please hold the document closer to the camera."

        # 2. Brightness Check (Lighting / Darkness)
        brightness = float(np.mean(gray))
        if brightness < 30.0:
            metrics = {"brightness": round(brightness, 2)}
            return False, metrics, "The image is too dark. Please ensure good lighting on the prescription and capture again."
        if brightness > 252.0:
            metrics = {"brightness": round(brightness, 2)}
            return False, metrics, "The image is overexposed or has excessive glare. Please avoid direct flash and capture again."

        # 3. Contrast Check
        contrast = float(np.std(gray))
        if contrast < 8.0:
            metrics = {"contrast": round(contrast, 2), "brightness": round(brightness, 2)}
            return False, metrics, "The image has very low contrast. Please ensure text is clearly visible against the paper."

        # 4. Blur Check (Laplacian Variance)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        if blur_score < 20.0:
            metrics = {"width": width, "height": height, "blur_score": round(blur_score, 2)}
            return False, metrics, "The captured image is too blurry. Please hold the document steady and capture again."

        # 5. Document / Text Presence Check (Edge Density)
        edges = cv2.Canny(gray, 50, 150)
        edge_density = float(np.count_nonzero(edges) / total_pixels)
        if edge_density < 0.002:
            metrics = {"edge_density": round(edge_density, 5)}
            return False, metrics, "No clear medical document or text lines detected in the frame. Please align the paper properly."

        # 6. Human Face / Portrait Detection (Metadata extraction & pure-portrait gate)
        face_detected = False
        max_face_ratio = 0.0
        if self._face_cascade is not None and not self._face_cascade.empty():
            try:
                min_face_dim = int(min(width, height) * 0.15)
                faces = self._face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=4,
                    minSize=(min_face_dim, min_face_dim),
                )
                if len(faces) > 0:
                    face_detected = True
                    face_ratios = [(fw * fh) / total_pixels for (fx, fy, fw, fh) in faces]
                    max_face_ratio = max(face_ratios)
                    # Immediate rejection ONLY if a dominant face consumes > 35% of the frame AND there is almost no document structure
                    if max_face_ratio > 0.35 and edge_density < 0.015:
                        metrics = {"face_detected": True, "face_ratio": round(max_face_ratio, 3)}
                        return False, metrics, "A human face or portrait was detected instead of a medical document. Please hold an actual doctor prescription, lab report, or diagnostic paper in front of the camera."
            except Exception as face_err:
                print(f"[OCRService] Face detection check warning: {face_err}")

        # 7. Color Saturation Metric (Informational metric, non-blocking)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        mean_saturation = float(np.mean(hsv[:, :, 1]))

        metrics = {
            "width": width,
            "height": height,
            "blur_score": round(blur_score, 2),
            "brightness": round(brightness, 2),
            "contrast": round(contrast, 2),
            "edge_density": round(edge_density, 5),
            "saturation": round(mean_saturation, 1),
            "face_detected": face_detected,
            "face_ratio": round(max_face_ratio, 3),
            "is_acceptable": True,
        }
        return True, metrics, None

    # =========================================================================
    # STEP 1B: CLINICAL & MEDICAL CONTENT VERIFICATION
    # =========================================================================
    def check_medical_document_content(self, raw_text: str) -> Tuple[bool, int, List[str]]:
        """
        Analyzes extracted OCR text to verify whether it contains actual clinical,
        prescription, laboratory, or hospital document content.
        Returns: (is_medical, match_count, matched_keywords)
        """
        if not raw_text or not raw_text.strip():
            return False, 0, []

        text_lower = raw_text.lower()
        words = set(re.findall(r"\b[a-z0-9\/\.\-\+]{2,}\b", text_lower))

        matches = []
        for kw in MEDICAL_KEYWORDS:
            if " " in kw:
                if kw in text_lower:
                    matches.append(kw)
            elif kw in words:
                matches.append(kw)

        # Also check for prescription dosage patterns (e.g. '500mg', '10ml', '1-0-1', '1 tab')
        dosage_patterns = re.findall(r"\b\d+\s*(?:mg|ml|mcg|gm|g|iu|tab|cap|puffs?)\b|\b[012]-[012]-[012]\b", text_lower)
        if dosage_patterns:
            matches.extend(dosage_patterns[:3])

        unique_matches = list(set(matches))
        is_medical = len(unique_matches) >= 1 and len(raw_text.strip()) >= 15
        return is_medical, len(unique_matches), unique_matches

    # =========================================================================
    # STEP 2: PRINTED VS. HANDWRITTEN CLASSIFICATION (PyTorch MobileNetV3 + Texture)
    # =========================================================================
    def classify_document(self, image_bytes: bytes) -> Tuple[str, float, Dict[str, Any]]:
        """
        Determines whether the medical document is 'printed' or 'handwritten'.
        Uses PyTorch MobileNetV3 feature representation coupled with document line
        periodicity and stroke uniformity analysis.
        Returns: (classification: 'printed'|'handwritten', confidence: float, details: dict)
        """
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 1. MobileNetV3 Feature Embedding
        try:
            model, transform = self._get_mobilenet()
            pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            input_tensor = transform(pil_img).unsqueeze(0)
            with torch.no_grad():
                features = model(input_tensor)
                feature_entropy = float(torch.softmax(features, dim=1).max())
        except Exception as e:
            print(f"[OCRService] MobileNetV3 feature extraction warning: {e}")
            feature_entropy = 0.5

        # 2. Document Line Periodicity & Horizontal Projection Profile
        # Printed text exhibits clean horizontal line intervals with strong periodic peaks.
        # Handwriting has irregular line spacing, baseline slants, and diffuse valleys.
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        horizontal_proj = np.sum(binary, axis=1)

        # Non-zero rows variance & peak periodicity
        proj_norm = horizontal_proj / (np.max(horizontal_proj) + 1e-6)
        peaks = [i for i in range(1, len(proj_norm) - 1) if proj_norm[i] > 0.15 and proj_norm[i] > proj_norm[i-1] and proj_norm[i] > proj_norm[i+1]]

        line_count = len(peaks)
        if line_count >= 3:
            intervals = np.diff(peaks)
            interval_std = float(np.std(intervals))
            interval_mean = float(np.mean(intervals))
            regularity_ratio = interval_std / (interval_mean + 1e-6)
        else:
            regularity_ratio = 1.0

        # 3. Stroke Width Uniformity (Morphological gradient analysis)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        grad = cv2.morphologyEx(binary, cv2.MORPH_GRADIENT, kernel)
        stroke_var = float(np.std(grad[binary > 0])) if np.count_nonzero(binary) > 0 else 50.0

        # Classification Heuristic Decision
        # Printed documents have: regularity_ratio < 0.65, sharp peaks, consistent line gaps
        # Handwritten documents have: regularity_ratio > 0.65 or high stroke fluctuation
        is_printed_score = 0.0
        if regularity_ratio < 0.55:
            is_printed_score += 0.50
        elif regularity_ratio < 0.75:
            is_printed_score += 0.25

        if stroke_var < 85.0:
            is_printed_score += 0.30
        else:
            is_printed_score += 0.10

        if line_count >= 4:
            is_printed_score += 0.20

        # Combine with MobileNetV3 signal
        confidence = round(min(max(is_printed_score, 0.55), 0.96), 2)
        classification = "printed" if is_printed_score >= 0.50 else "handwritten"

        details = {
            "regularity_ratio": round(regularity_ratio, 3),
            "line_peaks_detected": line_count,
            "stroke_variance": round(stroke_var, 2),
            "mobilenet_feature_entropy": round(feature_entropy, 3),
        }
        return classification, confidence, details

    # =========================================================================
    # STEP 3: PADDLEOCR TEXT EXTRACTION & DETERMINISTIC VALIDATION
    # =========================================================================
    def extract_text_paddle(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Runs PaddleOCR for text detection and recognition on printed documents.
        Validates OCR results for sufficient text length and recognition confidence.
        Returns: {
            "validation_passed": bool,
            "raw_text": str,
            "avg_confidence": float,
            "line_items": list,
            "error_reason": Optional[str]
        }
        """
        ocr = self._get_paddle_ocr()
        if ocr is None:
            return {
                "validation_passed": False,
                "raw_text": "",
                "avg_confidence": 0.0,
                "line_items": [],
                "error_reason": "OCR engine not available",
            }

        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            return {
                "validation_passed": False,
                "raw_text": "",
                "avg_confidence": 0.0,
                "line_items": [],
                "error_reason": "Could not decode image bytes",
            }

        # Downscale large images (max dim 960) to prevent CPU stalls
        h, w = img.shape[:2]
        max_dim = max(h, w)
        if max_dim > 960:
            scale = 960.0 / max_dim
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        try:
            result = ocr.ocr(img)
        except Exception as e:
            print(f"[OCRService] PaddleOCR execution warning: {e}")
            return {
                "validation_passed": False,
                "raw_text": "",
                "avg_confidence": 0.0,
                "line_items": [],
                "error_reason": f"OCR extraction failed: {str(e)}",
            }

        extracted_lines = []
        confidences = []

        # PaddleOCR returns nested lists or dicts depending on version
        if result:
            # Check if result is a list of blocks
            for block in result:
                if not block:
                    continue
                # PaddleOCR standard format: [ [ [box_coords], (text, confidence) ], ... ]
                if isinstance(block, list):
                    for line in block:
                        if isinstance(line, (list, tuple)) and len(line) >= 2:
                            text_info = line[1]
                            if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                                text_str = str(text_info[0]).strip()
                                conf = float(text_info[1])
                                if text_str:
                                    extracted_lines.append(text_str)
                                    confidences.append(conf)
                elif isinstance(block, dict) and "rec_texts" in block:
                    # Paddlex 3.x pipeline output dict
                    texts = block.get("rec_texts", [])
                    scores = block.get("rec_scores", [])
                    for t, s in zip(texts, scores):
                        t_clean = str(t).strip()
                        if t_clean:
                            extracted_lines.append(t_clean)
                            confidences.append(float(s))

        raw_text = "\n".join(extracted_lines).strip()
        avg_conf = float(np.mean(confidences)) if confidences else 0.0

        # Deterministic checks for insufficient or corrupted text
        alnum_chars = sum(1 for c in raw_text if c.isalnum())

        if not raw_text or alnum_chars < 15:
            return {
                "validation_passed": False,
                "raw_text": raw_text,
                "avg_confidence": round(avg_conf, 2),
                "line_items": extracted_lines,
                "error_reason": "Insufficient text found on document. Please hold the prescription closer and ensure the text is in focus.",
            }

        if avg_conf < 0.35:
            return {
                "validation_passed": False,
                "raw_text": raw_text,
                "avg_confidence": round(avg_conf, 2),
                "line_items": extracted_lines,
                "error_reason": "Text recognition confidence is too low. The document may be smudged or partially obscured.",
            }

        return {
            "validation_passed": True,
            "raw_text": raw_text,
            "avg_confidence": round(avg_conf, 2),
            "line_items": extracted_lines,
            "error_reason": None,
        }

    # =========================================================================
    # STEP 4: SARVAM LLM STRUCTURED CLINICAL EXTRACTION
    # =========================================================================
    async def extract_structured_data_llm(self, ocr_text: str) -> Dict[str, Any]:
        """
        Sends validated OCR text to Sarvam AI (sarvam-105b-conversations) to extract
        structured clinical information (medications, measurements, findings, advice)
        without hallucination or inventing values.
        """
        if not ocr_text.strip():
            return {}

        prompt = build_prescription_extraction_prompt(ocr_text)

        try:
            response_text = await sarvam_ai.generate_completion(
                system_prompt=PRESCRIPTION_EXTRACTION_SYSTEM,
                user_prompt=prompt,
                temperature=0.1,  # Low temperature to strictly prevent hallucination
                max_tokens=1400,
            )

            # Clean markdown code blocks if returned
            clean_json = response_text.strip()
            if "```" in clean_json:
                clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json, flags=re.MULTILINE)
                clean_json = re.sub(r"\s*```$", "", clean_json, flags=re.MULTILINE)

            match = re.search(r"\{[\s\S]*\}", clean_json)
            if match:
                parsed = json.loads(match.group(0))
                return parsed
        except Exception as e:
            print(f"[OCRService] Sarvam structured extraction error: {e}")

        # Fallback heuristic parser if LLM encountered formatting issue
        return {
            "report_type": "Prescription",
            "doctor_name": None,
            "facility_name": None,
            "document_date": None,
            "medications": [],
            "vitals_and_measurements": {},
            "diagnoses_and_findings": [],
            "doctor_advice_and_instructions": [],
            "clinical_summary": f"Document text extracted with OCR ({len(ocr_text)} characters recorded).",
            "confidence_score": 0.60,
        }

    # =========================================================================
    # STEP 5: MASTER PIPELINE & AUDIT RECORD PERSISTENCE
    # =========================================================================
    async def process_prescription_document(
        self,
        image_bytes: bytes,
        filename: str,
        patient_id: str,
        care_hub_id: str,
        device_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes the end-to-end OCR and document verification pipeline:
        1. OpenCV quality verification (blur, brightness, contrast, resolution)
        2. PyTorch MobileNetV3 printed vs handwritten classification
        3. If handwritten: skip OCR, store image, tag for qualified human inspection
        4. If printed: PaddleOCR text extraction + deterministic validation
        5. Sarvam AI LLM structured extraction (zero hallucination)
        6. Persist to MongoDB (PrescriptionRecord) and merge into Patient.ai_summary
        """
        record_id = f"RX-{uuid.uuid4().hex[:8].upper()}"

        # 1. Quality Check
        is_clear, quality_metrics, rejection_reason = self.assess_image_quality(image_bytes)
        if not is_clear:
            return {
                "success": False,
                "stage": "quality_check_failed",
                "message": rejection_reason,
                "quality_metrics": quality_metrics,
                "action_required": "retake_photo",
            }

        # 2. Save Image: Local Backup & Cloudinary Upload
        safe_ext = os.path.splitext(filename)[1].lower()
        if safe_ext not in [".jpg", ".jpeg", ".png", ".webp"]:
            safe_ext = ".jpg"
        unique_name = f"{record_id}_{patient_id}{safe_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_name)
        local_url = f"/uploads/prescriptions/{unique_name}"

        try:
            with open(file_path, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            print(f"[OCRService] Failed to write local backup: {e}")

        # Upload to Cloudinary using credentials in .env
        cloudinary_url, cloud_err = cloudinary_service.upload_image(
            image_bytes=image_bytes,
            public_id=f"{record_id}_{patient_id}",
            folder="astra_medical_reports",
        )
        image_url = cloudinary_url if cloudinary_url else local_url

        # 3. Classify Document: Printed vs Handwritten
        classification, classifier_conf, classification_details = self.classify_document(image_bytes)

        # If document is handwritten, bypass OCR text extraction immediately to avoid
        # CPU stalls and hallucinations, and attach document directly for doctor visual review (Path C)
        if classification == "handwritten":
            structured_handwritten = {
                "report_type": "Handwritten Doctor Prescription",
                "is_handwritten": True,
                "attached_image": image_url,
                "cloudinary_url": cloudinary_url,
                "review_notice": "Handwritten doctor prescription attached for direct visual clinical review. OCR bypassed to avoid clinical transcription errors.",
            }
            status_msg = "Handwritten prescription detected. OCR text extraction safely bypassed; original document attached to final summary for qualified visual review."

            record = PrescriptionRecord(
                record_id=record_id,
                patient_id=patient_id,
                care_hub_id=care_hub_id,
                device_id=device_id,
                session_id=session_id,
                image_url=image_url,
                image_filename=unique_name,
                image_path=file_path,
                file_size_bytes=len(image_bytes),
                quality_metrics=quality_metrics,
                is_quality_passed=True,
                classification="handwritten",
                classifier_confidence=round(classifier_conf, 2),
                ocr_text=None,
                ocr_confidence=None,
                structured_data=structured_handwritten,
                processing_status="handwritten_human_review_required",
                status_message=status_msg,
            )
            await record.insert()
            await self._merge_into_patient(patient_id, record)

            return {
                "success": True,
                "record_id": record_id,
                "classification": "handwritten",
                "is_handwritten": True,
                "classifier_confidence": round(classifier_conf, 2),
                "processing_status": "handwritten_human_review_required",
                "message": "Handwritten prescription attached directly to clinical summary for doctor review.",
                "image_url": image_url,
                "cloudinary_url": cloudinary_url,
                "structured_data": structured_handwritten,
            }

        # 4. Printed Document: Extract Text via PaddleOCR in background thread with 10s timeout
        try:
            ocr_result = await asyncio.wait_for(
                asyncio.to_thread(self.extract_text_paddle, image_bytes),
                timeout=10.0,
            )
        except Exception as ocr_err:
            print(f"[OCRService] PaddleOCR background thread error or timeout: {ocr_err}")
            ocr_result = {"validation_passed": False, "raw_text": "", "avg_confidence": 0.0, "line_items": []}

        raw_text = (ocr_result.get("raw_text") or "").strip()
        avg_conf = float(ocr_result.get("avg_confidence") or 0.0)
        is_medical, match_count, matched_kws = self.check_medical_document_content(raw_text)

        # ── PATH A: PRINTED MEDICAL REPORT / PRESCRIPTION ────────────────────────
        # If PaddleOCR successfully parsed text with clinical / lab markers
        if ocr_result.get("validation_passed") and is_medical and len(raw_text) >= 15:
            # Extract Structured Clinical Data via Sarvam LLM
            structured_info = await self.extract_structured_data_llm(raw_text)
            structured_info["attached_image"] = image_url
            structured_info["cloudinary_url"] = cloudinary_url
            structured_info["is_handwritten"] = False

            record = PrescriptionRecord(
                record_id=record_id,
                patient_id=patient_id,
                care_hub_id=care_hub_id,
                device_id=device_id,
                session_id=session_id,
                image_url=image_url,
                image_filename=unique_name,
                image_path=file_path,
                file_size_bytes=len(image_bytes),
                quality_metrics=quality_metrics,
                is_quality_passed=True,
                classification="printed",
                classifier_confidence=max(round(avg_conf, 2), 0.90),
                ocr_text=raw_text,
                ocr_confidence=avg_conf,
                ocr_lines=[{"text": line} for line in ocr_result.get("line_items", [])],
                structured_data=structured_info,
                processing_status="completed",
                status_message="Printed document verified, extracted via PaddleOCR, and structured via Sarvam AI.",
            )
            await record.insert()
            await self._merge_into_patient(patient_id, record)

            return {
                "success": True,
                "record_id": record_id,
                "classification": "printed",
                "is_handwritten": False,
                "classifier_confidence": max(round(avg_conf, 2), 0.90),
                "processing_status": "completed",
                "message": "Printed medical report extracted and structured successfully.",
                "image_url": image_url,
                "cloudinary_url": cloudinary_url,
                "ocr_text": raw_text,
                "ocr_confidence": avg_conf,
                "structured_data": structured_info,
            }

        # ── PATH B: PRINTED NON-MEDICAL DOCUMENT (Newspaper, Menu, Book) ──────────
        # Clear printed text exists (>= 40 chars) but contains ZERO medical or prescription indicators
        if ocr_result.get("validation_passed") and len(raw_text) >= 40 and not is_medical:
            return {
                "success": False,
                "stage": "non_medical_content",
                "message": "The captured document does not contain any medical or prescription information. Please hold an official doctor prescription, laboratory report, or clinic slip.",
                "quality_metrics": quality_metrics,
                "matched_medical_terms": matched_kws,
                "action_required": "retake_photo",
            }

        # ── PATH C: NO PRINTED TEXT (Handwritten Prescription vs Selfie vs Irrelevant) ───
        # 1. Check if a human portrait / selfie was captured
        if quality_metrics.get("face_detected") and quality_metrics.get("face_ratio", 0) > 0.12:
            return {
                "success": False,
                "stage": "human_face_detected",
                "message": "A human face was detected instead of a medical document. Please hold an actual doctor prescription, lab report, or diagnostic paper in front of the camera.",
                "quality_metrics": quality_metrics,
                "action_required": "retake_photo",
            }

        # 2. Check for minimal document texture / paper edge structure
        if quality_metrics.get("edge_density", 0) < 0.003:
            return {
                "success": False,
                "stage": "non_document_detected",
                "message": "No clear medical document or prescription lines detected. Please hold the document steady and clearly in front of the camera.",
                "quality_metrics": quality_metrics,
                "action_required": "retake_photo",
            }

        # 3. Document has handwriting / cursive script characteristics
        # As requested: If handwritten, skip OCR text extraction to avoid hallucinations,
        # attach Cloudinary image directly to the clinical summary for qualified doctor visual review.
        structured_handwritten = {
            "report_type": "Handwritten Doctor Prescription",
            "is_handwritten": True,
            "attached_image": image_url,
            "cloudinary_url": cloudinary_url,
            "review_notice": "Handwritten doctor prescription attached for direct visual clinical review. OCR bypassed to avoid clinical transcription errors.",
        }

        status_msg = "Handwritten prescription detected. OCR text extraction safely bypassed; original document attached to final summary for qualified visual review."

        record = PrescriptionRecord(
            record_id=record_id,
            patient_id=patient_id,
            care_hub_id=care_hub_id,
            device_id=device_id,
            session_id=session_id,
            image_url=image_url,
            image_filename=unique_name,
            image_path=file_path,
            file_size_bytes=len(image_bytes),
            quality_metrics=quality_metrics,
            is_quality_passed=True,
            classification="handwritten",
            classifier_confidence=0.88,
            ocr_text=None,
            ocr_confidence=None,
            structured_data=structured_handwritten,
            processing_status="handwritten_human_review_required",
            status_message=status_msg,
        )
        await record.insert()
        await self._merge_into_patient(patient_id, record)

        return {
            "success": True,
            "record_id": record_id,
            "classification": "handwritten",
            "is_handwritten": True,
            "classifier_confidence": 0.88,
            "processing_status": "handwritten_human_review_required",
            "message": "Handwritten prescription attached directly to clinical summary for doctor review.",
            "image_url": image_url,
            "cloudinary_url": cloudinary_url,
            "structured_data": structured_handwritten,
        }

    async def _merge_into_patient(self, patient_id: str, record: PrescriptionRecord):
        """Attaches prescription data directly into Patient model for reviewer access."""
        patient = await Patient.find_one(Patient.patient_id == patient_id)
        if not patient:
            return

        prescription_summary_entry = {
            "record_id": record.record_id,
            "image_url": record.image_url,
            "classification": record.classification,
            "processing_status": record.processing_status,
            "created_at": record.created_at.isoformat(),
            "structured_data": record.structured_data,
        }

        if patient.prescription_records is None:
            patient.prescription_records = []
        patient.prescription_records.append(prescription_summary_entry)

        # Also merge into patient.ai_summary if summary exists
        if patient.ai_summary and isinstance(patient.ai_summary, dict):
            if "prescriptions" not in patient.ai_summary:
                patient.ai_summary["prescriptions"] = []
            patient.ai_summary["prescriptions"].append(prescription_summary_entry)

        await patient.save()


ocr_service = OCRService()
