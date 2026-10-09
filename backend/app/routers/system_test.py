import time
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel

from app.dependencies.auth import get_current_admin
from app.services.sarvam_service import sarvam_ai, get_lang_meta
from app.services.local_tts_service import local_tts
from app.services.rag_triage_service import rag_triage
from app.services.ocr_service import ocr_service
from app.urgency import urgency_detector

router = APIRouter(prefix="/test", tags=["System Component Test Sandbox"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class TestAgentQuestionRequest(BaseModel):
    phase: int = 1                     # 1 = primary symptom, 2 = follow-up gap analysis
    language: str = "hindi"            # hindi, odia, english, tamil, etc.
    stated_symptoms: Optional[str] = None
    tts_engine: str = "local"          # local | sarvam


# ── Helper: TTS Synthesizer for Test Lab ──────────────────────────────────────

async def _synthesize_test_speech(
    text: str,
    lang_code: str,
    speaker: str = "priya",
    engine: str = "local"
) -> tuple[Optional[str], str]:
    engine_norm = (engine or "local").strip().lower()
    if engine_norm == "local":
        try:
            audio = await local_tts.text_to_speech(text, lang_code)
            if audio:
                return audio, "local"
        except Exception as e:
            print(f"[TestLab] Local Kokoro TTS failed: {e}")
        audio = await sarvam_ai.text_to_speech(text, lang_code, speaker)
        return audio, "sarvam"
    else:
        try:
            audio = await sarvam_ai.text_to_speech(text, lang_code, speaker)
            if audio:
                return audio, "sarvam"
        except Exception as e:
            print(f"[TestLab] Sarvam TTS failed: {e}")
        audio = await local_tts.text_to_speech(text, lang_code)
        return audio, "local"


# ═════════════════════════════════════════════════════════════════════════════
# 1. TEST AGENT: QUESTION GENERATION
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/agent-question")
async def test_generate_agent_question(
    data: TestAgentQuestionRequest,
    admin = Depends(get_current_admin),
):
    """
    Stateless sandbox endpoint to test Agent question generation in any language.
    Does NOT require a patient ID or database session.
    """
    t0 = time.time()
    lang_meta = get_lang_meta(data.language)
    lang_code = lang_meta["code"]
    lang_name = lang_meta["name"]
    speaker = lang_meta["speaker"]

    if data.phase == 1:
        # Primary symptom question
        q_data = await sarvam_ai.generate_primary_question(
            1,
            data.language,
            stated_symptoms=data.stated_symptoms
        )
        q_text = q_data["question_text"]
        q_en = q_data["question_text_en"]
        intent = "Open symptom disclosure & primary complaint elicitation"
    else:
        # Follow-up gap question
        symptoms_context = data.stated_symptoms or "Fever and generalized pain"
        q_data = await sarvam_ai.generate_primary_question(
            2,
            data.language,
            stated_symptoms=symptoms_context
        )
        q_text = q_data["question_text"]
        q_en = q_data["question_text_en"]
        intent = "Differential exploration and symptom progression gap analysis"

    # Synthesize audio speech
    audio_base64, engine_used = await _synthesize_test_speech(
        text=q_text,
        lang_code=lang_code,
        speaker=speaker,
        engine=data.tts_engine or "local"
    )

    elapsed_ms = round((time.time() - t0) * 1000)

    return {
        "success": True,
        "phase": data.phase,
        "language": lang_name,
        "language_code": lang_code,
        "question_text": q_text,
        "question_text_en": q_en,
        "clinical_intent": intent,
        "audio_base64": audio_base64,
        "tts_engine_used": engine_used,
        "generation_latency_ms": elapsed_ms,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 2. TEST AGENT: ANSWER SIMULATION & CLINICAL DATA EXTRACTION
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/agent-simulate-answer")
async def test_simulate_agent_answer(
    answer_text: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
    language: str = Form("hindi"),
    question_asked: Optional[str] = Form(None),
    tts_engine: str = Form("local"),
    admin = Depends(get_current_admin),
):
    """
    Stateless sandbox endpoint to simulate a patient's response (via voice audio or text),
    execute the full AI extraction pipeline (STT -> Translation -> Urgency NLP -> Gap Analysis),
    and return the structured extracted data.
    ZERO database writes or patient ID requirements.
    """
    t_start = time.time()
    timings = {}

    lang_meta = get_lang_meta(language)
    lang_code = lang_meta["code"]
    lang_name = lang_meta["name"]

    raw_answer = ""
    is_voice = False

    # 1. Voice Speech-To-Text (if audio file uploaded)
    if audio_file and hasattr(audio_file, "read"):
        t_stt = time.time()
        try:
            audio_bytes = await audio_file.read()
            if audio_bytes and len(audio_bytes) > 200:
                stt_result = await sarvam_ai.speech_to_text(audio_bytes=audio_bytes, language_code=lang_code)
                raw_answer = stt_result.get("transcript", "").strip()
                is_voice = True
        except Exception as e:
            print(f"[TestLab] STT audio processing error: {e}")
        timings["stt_ms"] = round((time.time() - t_stt) * 1000)

    if not raw_answer and answer_text:
        raw_answer = answer_text.strip()

    if not raw_answer:
        raise HTTPException(status_code=400, detail="Please provide either voice audio recording or text answer to test.")

    # 2. Translation to English for clinical canonical processing
    t_tr = time.time()
    answer_en = raw_answer
    if lang_code not in ["en-IN", "en"]:
        try:
            trans_result = await sarvam_ai.translate(
                input_text=raw_answer,
                source_lang_code=lang_code,
                target_lang_code="en-IN"
            )
            answer_en = trans_result.get("translated_text", raw_answer)
        except Exception as e:
            print(f"[TestLab] Translation warning: {e}")
            answer_en = raw_answer
    timings["translation_ms"] = round((time.time() - t_tr) * 1000)

    # 3. Urgency Signal Detection (Local Regex + NLP Embeddings)
    t_urg = time.time()
    try:
        urg_obj = urgency_detector.detect_urgency(answer_en)
        if hasattr(urg_obj, "model_dump"):
            urgency_dict = urg_obj.model_dump()
        elif hasattr(urg_obj, "dict"):
            urgency_dict = urg_obj.dict()
        else:
            urgency_dict = {}
    except Exception as e:
        print(f"[TestLab] Urgency check failure: {e}")
        urgency_dict = {}

    sig_detected = urgency_dict.get("urgency_signal_detected", False)
    signals = urgency_dict.get("signals", [])
    action = urgency_dict.get("action", "")
    detected_signals = [s.get("matched_phrase") or s.get("signal_id") for s in signals if isinstance(s, dict)]

    # Rule-based Emergency keywords
    critical_keywords = [
        "chest pain", "heart attack", "unconscious", "stroke", "severe bleeding", 
        "difficulty breathing", "choking", "cyanosis", "cannot breathe", "fainted"
    ]
    is_critical_red = any(kw in answer_en.lower() for kw in critical_keywords)

    if is_critical_red or "HIGH_PRIORITY" in str(action).upper() or "EMERGENCY" in str(action).upper():
        urgency_level = "red"
        urgency_score = 0.95
    elif sig_detected or urgency_dict.get("requires_human_review", False):
        urgency_level = "yellow"
        urgency_score = 0.65
    else:
        urgency_level = "green"
        urgency_score = 0.15

    matched_conditions = detected_signals
    timings["urgency_detection_ms"] = round((time.time() - t_urg) * 1000)

    # 4. Clinical Entity Extraction & Detail Gap Analysis
    t_gap = time.time()
    gap_analysis = await rag_triage.analyze_clinical_gaps(
        phase1_answers_en=[answer_en],
        lang_name=lang_name,
        lang_code=lang_code
    )
    symptoms_extracted = gap_analysis.get("symptoms_identified", [])
    already_stated = gap_analysis.get("already_stated_details", {})
    gap_questions = gap_analysis.get("gap_questions", [])[:4]
    timings["clinical_gap_analysis_ms"] = round((time.time() - t_gap) * 1000)

    # 5. Determine Next Recommended Agent Question
    next_question = None
    next_question_en = None
    next_intent = None
    next_audio_base64 = None

    if urgency_level == "red":
        next_intent = "IMMEDIATE EMERGENCY ESCALATION — Critical Red Urgency Detected"
        next_question_en = "Immediate medical attention required! A critical urgency symptom has been detected. Proceed to the emergency desk immediately."
        next_question = "तत्काल चिकित्सा सहायता आवश्यक है! गंभीर लक्षण का पता चला है। कृपया तुरंत इमरजेंसी काउंटर पर डॉक्टर से मिलें।"
    elif gap_questions and len(gap_questions) > 0:
        top_gap = gap_questions[0]
        next_question = top_gap.get("question_text")
        next_question_en = top_gap.get("question_text_en")
        next_intent = f"Fill clinical detail gap: {top_gap.get('gap_type', 'onset/duration')} ({top_gap.get('clinical_intent', '')})"
    else:
        next_intent = "Symptom clarification complete — Ready to formulate consultation summary"
        next_question_en = "Thank you. Please hold on while we summarize your symptoms for the doctor."
        next_question = "धन्यवाद। कृपया प्रतीक्षा करें, हम डॉक्टर के लिए आपके लक्षणों का सारांश तैयार कर रहे हैं।"

    # Generate audio for the next follow-up question
    if next_question:
        try:
            next_audio_base64, _ = await _synthesize_test_speech(
                text=next_question,
                lang_code=lang_code,
                speaker=lang_meta["speaker"],
                engine=tts_engine or "local"
            )
        except Exception:
            pass

    total_latency_ms = round((time.time() - t_start) * 1000)
    timings["total_pipeline_ms"] = total_latency_ms

    return {
        "success": True,
        "input_type": "voice_recording" if is_voice else "text_input",
        "language_evaluated": lang_name,
        "language_code": lang_code,
        "question_context": question_asked or "Initial Symptom Inquiry",
        "raw_patient_response": raw_answer,
        "translated_english": answer_en,
        "extracted_data": {
            "symptoms_identified": symptoms_extracted,
            "clinical_details_stated": already_stated,
            "urgency_evaluation": {
                "level": urgency_level,
                "score": urgency_score,
                "is_urgent": urgency_level in ["red", "yellow"],
                "detected_signals": detected_signals,
                "matched_conditions": matched_conditions,
            },
            "unfilled_clinical_gaps": [
                {
                    "gap_type": g.get("gap_type"),
                    "target_symptom": g.get("target_symptom"),
                    "clinical_intent": g.get("clinical_intent"),
                }
                for g in gap_questions
            ],
        },
        "next_agent_action": {
            "intent": next_intent,
            "formulated_question": next_question,
            "formulated_question_en": next_question_en,
            "audio_base64": next_audio_base64,
        },
        "performance_metrics": timings,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 3. TEST OCR: MEDICAL DOCUMENT INSPECTION & EXTRACTION
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/ocr-inspection")
async def test_ocr_document_inspection(
    image_file: UploadFile = File(...),
    admin = Depends(get_current_admin),
):
    """
    Stateless sandbox endpoint to test OCR document processing:
    1. OpenCV image quality inspection (blur, brightness, contrast, resolution)
    2. PyTorch MobileNet / texture classification (Printed vs Handwritten)
    3. PaddleOCR text extraction (raw text, lines, confidence, medical keyword matching)
    4. Sarvam AI LLM structured clinical extraction (medications, vitals, findings, advice)
    ZERO database writes or permanent storage.
    """
    t_start = time.time()
    timings = {}

    image_bytes = await image_file.read()
    if len(image_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Invalid or empty image file uploaded.")

    filename = image_file.filename or "test_document.jpg"

    # Step 1: Quality Check
    t_qc = time.time()
    is_clear, quality_metrics, rejection_reason = ocr_service.assess_image_quality(image_bytes)
    timings["quality_assessment_ms"] = round((time.time() - t_qc) * 1000)

    # Step 2: Classify Document (Printed vs Handwritten)
    t_cls = time.time()
    classification, classifier_conf, classification_details = ocr_service.classify_document(image_bytes)
    timings["classification_ms"] = round((time.time() - t_cls) * 1000)

    # Step 3: Text Extraction
    t_ocr = time.time()
    ocr_result = ocr_service.extract_text_paddle(image_bytes)
    raw_ocr_text = ocr_result.get("raw_text", "")
    line_items = ocr_result.get("line_items", [])
    avg_confidence = ocr_result.get("avg_confidence", 0.0)
    ocr_error = ocr_result.get("error_reason")
    timings["paddle_ocr_ms"] = round((time.time() - t_ocr) * 1000)

    # Step 4: Structured LLM Extraction
    t_llm = time.time()
    structured_data = {}
    try:
        if raw_ocr_text and len(raw_ocr_text.strip()) > 10:
            if hasattr(ocr_service, "extract_structured_data_llm"):
                structured_data = await ocr_service.extract_structured_data_llm(raw_ocr_text)
            elif hasattr(ocr_service, "extract_structured_clinical_data"):
                structured_data = await ocr_service.extract_structured_clinical_data(raw_ocr_text)
        elif classification == "handwritten":
            structured_data = {
                "report_type": "Handwritten Doctor Prescription",
                "doctor_name": None,
                "facility_name": None,
                "document_date": None,
                "medications": [],
                "vitals_and_measurements": {},
                "diagnoses_and_findings": ["Handwritten prescription detected — OCR bypassed to avoid clinical errors."],
                "doctor_advice_and_instructions": ["Visual inspection recommended by qualified clinical staff."],
                "clinical_summary": "Handwritten doctor prescription detected. Bypassed OCR text extraction for doctor visual inspection.",
                "confidence_score": classifier_conf,
            }
        else:
            structured_data = {
                "report_type": "Unknown Document",
                "medications": [],
                "vitals_and_measurements": {},
                "diagnoses_and_findings": [],
                "doctor_advice_and_instructions": [],
                "clinical_summary": "Insufficient text detected on document for structured clinical analysis.",
                "confidence_score": 0.0,
            }
    except Exception as e:
        print(f"[TestLab] Structured LLM extraction error: {e}")
        structured_data = {
            "report_type": "Document (Extraction Fallback)",
            "medications": [],
            "vitals_and_measurements": {},
            "diagnoses_and_findings": [f"Extraction note: {str(e)}"],
            "doctor_advice_and_instructions": [],
            "clinical_summary": f"Text extracted ({len(raw_ocr_text)} characters). LLM formatting fallback.",
            "confidence_score": 0.40,
        }
    timings["structured_llm_ms"] = round((time.time() - t_llm) * 1000)

    total_latency_ms = round((time.time() - t_start) * 1000)
    timings["total_pipeline_ms"] = total_latency_ms

    # Identify matched medical keywords from dictionary for transparency
    text_lower = raw_ocr_text.lower()
    from app.services.ocr_service import MEDICAL_KEYWORDS
    matched_medical_terms = sorted([kw for kw in MEDICAL_KEYWORDS if kw in text_lower])[:20]

    return {
        "success": True,
        "filename": filename,
        "file_size_bytes": len(image_bytes),
        "quality_assessment": {
            "is_quality_passed": is_clear,
            "rejection_reason": rejection_reason,
            "metrics": quality_metrics,
        },
        "document_classification": {
            "type": classification,
            "confidence": classifier_conf,
            "details": classification_details,
        },
        "raw_ocr_extraction": {
            "raw_text": raw_ocr_text,
            "total_characters": len(raw_ocr_text),
            "total_lines": len(line_items),
            "average_confidence": round(avg_confidence, 2),
            "matched_medical_keywords": matched_medical_terms,
            "error_reason": ocr_error,
        },
        "structured_clinical_extraction": structured_data,
        "performance_metrics": timings,
    }
