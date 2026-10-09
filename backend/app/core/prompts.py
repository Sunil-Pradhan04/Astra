"""
Centralized AI Prompts Repository — Astra Healthcare Backend
============================================================
This file contains all LLM prompts utilized across the application.
You can directly review, tune, and modify the clinical instructions,
system personas, and prompt structures here.

LLM Engine: Sarvam AI (sarvam-105b-conversations)
"""

import json
from typing import List, Dict, Any, Optional


# ==============================================================================
# SECTION 1: LANGUAGE TRANSLATION PROMPTS (Indic <-> English)
# ==============================================================================

TRANSLATION_TO_ENGLISH_SYSTEM = (
    "You are an expert clinical medical translator at a primary healthcare triage system. "
    "Translate the patient's statement accurately and cleanly into clear, natural English. "
    "Maintain the exact medical meaning, symptom nuances, and emotional tone. "
    "Output ONLY the English translation without any notes, conversational preambles, explanations, or quotes."
)

def build_translate_to_english_prompt(text: str, source_lang: str = "Indic") -> str:
    """Builds prompt to translate patient speech/text to clinical English."""
    return (
        f"Translate the following patient statement from {source_lang} into English:\n\n"
        f"\"{text.strip()}\"\n\n"
        f"English translation:"
    )


TRANSLATION_TO_INDIC_SYSTEM = (
    "You are a compassionate clinical healthcare translator at a medical kiosk. "
    "Translate the provided English clinical question or statement into natural, polite, "
    "culturally respectful phrasing in the requested target Indic language and script. "
    "Output ONLY the translated text without any English words, notes, explanations, or quotes."
)

def build_translate_to_indic_prompt(text_en: str, target_lang_name: str = "Hindi") -> str:
    """Builds prompt to translate English question/message to patient's preferred language."""
    return (
        f"Translate the following clinical text into natural, polite {target_lang_name} in its native script:\n\n"
        f"\"{text_en.strip()}\"\n\n"
        f"{target_lang_name} translation:"
    )


# ==============================================================================
# SECTION 2: PHASE 1 — OPEN SYMPTOM DISCOVERY PROMPTS
# ==============================================================================

PRIMARY_QUESTION_1_SYSTEM = (
    "You are a compassionate clinical AI triage assistant at a healthcare kiosk. "
    "Communicate courteously and clearly in the patient's preferred language."
)

PRIMARY_QUESTION_2_SYSTEM = (
    "You are a compassionate, conversational clinical AI triage assistant at a healthcare kiosk. "
    "Acknowledge the symptoms the patient just described warmly and respectfully. "
    "Then ask them interactively whether they are facing any other problems, symptoms, or discomfort, and invite them to share if so."
)

def build_primary_question_prompt(
    question_number: int,
    lang_name: str,
    q_en: str,
    stated_symptoms: Optional[str] = None
) -> str:
    """Builds prompt for generating starting discovery questions (Q1 / Q2)."""
    if question_number == 1:
        return (
            f"The patient speaks {lang_name}.\n"
            f"Ask the patient clearly, warmly, and empathetically: '{q_en}'\n"
            f"Output ONLY the question in {lang_name} script with natural, respectful phrasing. "
            f"Do NOT include English translation, notes, or quotes."
        )
    else:
        symptoms_mention = f"'{stated_symptoms}'" if stated_symptoms else "their reported symptoms"
        return (
            f"The patient speaks {lang_name}.\n"
            f"The patient previously mentioned experiencing {symptoms_mention}.\n"
            f"Translate and adapt the following interactive inquiry into natural, polite {lang_name} in its native script:\n"
            f"'{q_en}'\n"
            f"Requirements:\n"
            f"- Acknowledge the symptoms they stated.\n"
            f"- Ask if they are facing any other problems, pain, or difficulties besides those.\n"
            f"- If yes, invite them to speak freely.\n"
            f"Output ONLY the translated question in {lang_name} script with respectful, conversational phrasing. "
            f"Do NOT include English translation, notes, or quotes."
        )


# ==============================================================================
# SECTION 3: FREE-TEXT CLINICAL SYMPTOM EXTRACTION PROMPT
# ==============================================================================

SYMPTOM_EXTRACTION_SYSTEM = (
    "You are a clinical symptom extractor. "
    "From the patient's narrative, extract a concise comma-separated list of clinical symptoms in English. "
    "Output ONLY the symptom list. No explanations, no JSON, no full sentences."
)

def build_symptom_extraction_prompt(narrative_en: str) -> str:
    """Builds prompt to extract structured symptom list from free-text dialogue."""
    return (
        f"Patient narrative:\n"
        f"{narrative_en.strip()}\n\n"
        f"Extract clinical symptoms as a comma-separated list:"
    )


# ==============================================================================
# SECTION 4: RULE-BASED CLINICAL DETAIL GAP ANALYSIS & FOLLOW-UP PROMPTS
# ==============================================================================

CLINICAL_GAP_ANALYSIS_SYSTEM = (
    "You are an expert Clinical Diagnostic Assistant at an automated healthcare kiosk. "
    "A patient has reported their presenting symptoms during the initial discovery questions. "
    "Your objective is to identify all clinical detail gaps regarding the reported symptoms. "
    "Specifically evaluate the 6 fundamental clinical dimensions:\n"
    "1. DURATION & TIMELINE: When did each symptom begin, how long has it lasted, and has it progressed over time?\n"
    "2. PLACE & LOCATION: Where precisely on the body is the discomfort located, and does it radiate or spread?\n"
    "3. DEPTH, SENSATION & SEVERITY: What is the character/depth of the sensation (e.g. sharp, dull throbbing, crushing, burning, tickle), and what is the severity rating on a 1 to 10 scale?\n"
    "4. DIURNAL TIMING & PATTERN: Is there any specific diurnal timing (e.g. evening fever spikes with chills, nocturnal cough, morning stiffness), and is it continuous or episodic?\n"
    "5. TRIGGERS & RELIEVING FACTORS: What activities or factors aggravate it (exertion, cold air, eating, posture), and what eases or relieves it?\n"
    "6. PRIOR MEDICATIONS & MEDICAL HISTORY: Has the patient taken any medicines (e.g. Paracetamol, antibiotics), and do they have chronic conditions (e.g. hypertension, diabetes)?\n\n"
    "CRITICAL RULES:\n"
    "- If the patient ALREADY clearly stated any of the above parameters in their narrative, do NOT ask for it again.\n"
    "- Formulate AT MOST 4 (maximum 4) empathetic, highly targeted follow-up questions to fill the missing gaps.\n"
    "- Each question must be in canonical English ('question_text_en') and translated into the patient's language ('question_text') in native script.\n"
    "- Respond ONLY with a valid JSON object matching the requested schema."
)

def build_clinical_gap_prompt(
    phase1_narrative_en: str,
    lang_name: str,
    lang_code: str
) -> str:
    """Builds prompt to analyze clinical gaps in stated symptoms and formulate rule-based follow-up questions."""
    return f"""PATIENT'S STATED SYMPTOMS & PRESENTING DISCLOSURE (English):
"{phase1_narrative_en.strip()}"

PATIENT'S SPOKEN LANGUAGE: {lang_name} ({lang_code})

TASK:
1. Extract all clinical symptoms mentioned by the patient.
2. Note which clinical details the patient already provided.
3. Identify the missing detail gaps across:
   - duration
   - place_location
   - depth_severity
   - diurnal_timing
   - triggers_relieving
   - medications_history
4. Formulate AT MOST 4 (maximum 4) targeted follow-up questions to fill these clinical gaps.
5. Translate each question into {lang_name} in its native script. Always provide 'question_text_en' in clear English.

Return this exact JSON structure:
{{
  "symptoms_identified": ["<symptom 1>", "<symptom 2>"],
  "already_stated_details": {{
    "<symptom>": "<details patient already gave>"
  }},
  "gap_questions": [
    {{
      "gap_type": "duration | place_location | depth_severity | diurnal_timing | triggers_relieving | medications_history",
      "target_symptom": "<symptom name or 'General'>",
      "clinical_intent": "<short clinical intent description>",
      "question_text_en": "<clear, compassionate clinical question in English>",
      "question_text": "<natural, polite question in {lang_name} script>"
    }}
  ]
}}"""


RAG_FOLLOWUP_SYSTEM = (
    "You are an expert Clinical Diagnostic AI at a primary healthcare kiosk. "
    "Analyze the patient's symptoms against the retrieved candidate diseases. "
    "Generate EXACTLY 3 targeted, patient-friendly follow-up questions to help "
    "differentiate between the top candidate diseases. "
    "NEVER ask about symptoms the patient has ALREADY described or denied. "
    "Respond ONLY with a strictly valid JSON object without markdown formatting or preamble."
)

def build_rag_followup_prompt(
    symptoms_summary: str,
    candidate_diseases: List[Dict[str, Any]],
    already_asked_intents: List[str],
    lang_name: str,
    lang_code: str
) -> str:
    """Builds prompt for Phase 2 differential follow-up question generation."""
    return f"""Patient Symptom Summary (English):
"{symptoms_summary}"

Already Asked / Covered Intents (do NOT repeat these):
{json.dumps(already_asked_intents, indent=2)}

Top Candidate Diseases from Pinecone (vector similarity search):
{json.dumps(candidate_diseases, indent=2)}

Language for Patient Questions: {lang_name} (code: {lang_code})

TASK:
1. Identify discriminating symptoms NOT yet asked about from the candidate diseases.
2. Formulate exactly 3 targeted follow-up questions.
3. If {lang_name} is not English, write question_text in {lang_name} script.
   Always include question_text_en (English version) regardless of language.

Return this exact JSON structure:
{{
  "followup_questions": [
    {{
      "question_text_en": "<question in English for memory storage>",
      "question_text": "<question in {lang_name} for patient display/TTS>",
      "clinical_intent": "<short clinical intent in English>",
      "target_differential": "<candidate disease this question targets>"
    }}
  ]
}}"""


# ==============================================================================
# SECTION 5: PHASE 3 — CLINICAL DETAIL DEEP-DIVE QUESTIONS PROMPT
# ==============================================================================

DETAIL_QUESTIONS_SYSTEM = (
    "You are an expert Clinical Triage AI. After identifying a patient's suspected conditions, "
    "generate specific clinical detail questions to establish precise diagnostic parameters "
    "(duration, location, severity scale 1-10, timing/pattern, aggravating/relieving factors, "
    "prior medications, and existing health conditions). "
    "Questions should be empathetic and easily understood by a layperson. "
    "Respond ONLY with strictly valid JSON without markdown formatting."
)

def build_detail_questions_prompt(
    symptoms_summary: str,
    candidate_diseases: List[Dict[str, Any]],
    lang_name: str,
    lang_code: str
) -> str:
    """Builds prompt for Phase 3 clinical detail questions (duration, location, severity, etc.)."""
    disease_names = [c.get("disease", "") for c in candidate_diseases[:3]] if candidate_diseases else ["General Clinical Evaluation"]
    return f"""Patient Reported Symptoms:
"{symptoms_summary}"

Top Suspected Conditions from Vector Search:
{json.dumps(disease_names, indent=2)}

Patient's Language: {lang_name} ({lang_code})

Generate exactly 5 clinical detail questions covering:
1. Duration — How long have they had the symptoms?
2. Location/Body area — Where exactly do they feel the discomfort?
3. Severity — On a scale of 1-10, how severe is it?
4. Pattern — Is it constant, or does it come and go?
5. Prior medication & existing conditions — Any medicines taken? Any known chronic illnesses?

Return this exact JSON:
{{
  "detail_questions": [
    {{
      "question_text_en": "<question in English for memory>",
      "question_text": "<question in {lang_name}>",
      "clinical_intent": "<clinical intent>",
      "detail_type": "duration|location|severity|pattern|history"
    }}
  ]
}}"""


# ==============================================================================
# SECTION 6: FINAL CLINICAL TRIAGE SUMMARY GENERATION PROMPT
# ==============================================================================

FINAL_SUMMARY_SYSTEM = (
    "You are an expert Chief Medical Officer and Clinical AI Triage Engine at a primary healthcare kiosk. "
    "Analyze the patient interview dialogue and any attached medical document data to generate an exhaustive, highly rigorous clinical triage dossier. "
    "MANDATORY CLINICAL ACCURACY AND EXTRACTION DIRECTIVES:\n"
    "1. FIELD 1 — ALL SYMPTOMS OVERVIEW: Provide 'all_symptoms_overview' containing strictly a list of every symptom reported by the patient. Do NOT include disease names or speculative diagnoses here.\n"
    "2. FIELD 2 — SYMPTOM DEEP-DIVE: Under 'symptoms_deep_dive', provide an exhaustive clinical breakdown for EACH identified symptom:\n"
    "   - 'name': Clinical symptom name (e.g. High Fever, Frontal Headache, Dry Cough, Low Blood Pressure).\n"
    "   - 'timeline': Specific onset, progression, and duration (e.g. 'Started 3 days ago, progressive worsening since yesterday').\n"
    "   - 'depth_and_severity': Depth, character, and severity rating (e.g. 'Deep retrosternal dull pressure rated 7/10 depth', 'Mild superficial tickle').\n"
    "   - 'timing_and_diurnal_pattern': Exact temporal timing and diurnal variation. ALWAYS explicitly capture diurnal nuances (e.g. 'Fever spikes specifically in the evening around 5-6 PM with chills, subsides towards morning', 'Cough worsens at night while recumbent').\n"
    "   - 'triggers_and_relieving': Aggravating and relieving factors (e.g. 'Triggered by cold air and exertion; partially relieved by warm liquids and recumbent rest').\n"
    "   - 'patient_disclosed_details': CRITICAL: Comprehensive account of EVERYTHING the patient stated about this symptom during the interrogation. You may synthesize and clarify clinical language, but you MUST NOT MISS A SINGLE DETAIL or statement the patient disclosed.\n"
    "   - 'ocr_report_correlation': If the attached printed medical report contains corroborating findings (e.g. BP 90/60 mmHg, high oral temp 102.4 °F, prescribed Paracetamol), state exact evidence prefixed with 'Extracted from Uploaded Report: <finding>'. If no report match, set to null.\n"
    "3. NO SPECULATIVE DIAGNOSES OR PERCENTAGES: Do NOT output candidate diseases or retrieval percentage match scores (such as 'FLU match 70%'). The attending physician will evaluate symptoms and establish the clinical diagnosis.\n"
    "4. NEVER write placeholder phrases like 'Not available', 'Not reported', 'N/A', 'None stated', or 'Unknown'. Use null for unstated fields.\n"
    "5. Respond ONLY with a strictly valid JSON object without markdown formatting, code fences, or preamble."
)

def build_final_summary_prompt(
    dialogue_turns: List[Dict[str, str]],
    candidate_diseases: List[Dict[str, Any]],
    lang_name: str,
    lang_code: str,
    prescription_data: Optional[Dict[str, Any]] = None,
) -> str:
    """Builds prompt for comprehensive clinical triage report generation with document-symptom mapping."""
    doc_section = ""
    if prescription_data:
        structured = prescription_data.get("structured_data", {})
        doc_class = prescription_data.get("classification", "printed")
        if doc_class == "printed" and structured:
            doc_section = f"""
ATTACHED MEDICAL DOCUMENT FINDINGS (Printed Report / Prescription Extracted by OCR):
- Report Type: {structured.get('report_type', 'Medical Report')}
- Doctor / Clinic: {structured.get('doctor_name') or structured.get('facility_name') or 'Clinical Laboratory'}
- Date of Document: {structured.get('document_date', 'Recent')}
- Diagnoses / Clinical Findings: {json.dumps(structured.get('diagnoses_and_findings', []))}
- Measured Vitals & Lab Values: {json.dumps(structured.get('vitals_and_measurements', {}))}
- Prescribed Medications: {json.dumps(structured.get('medications', []))}
- Doctor Advice / Instructions: {json.dumps(structured.get('doctor_advice_and_instructions', []))}

CRITICAL MAPPING INSTRUCTION:
For each symptom listed in 'symptoms_deep_dive', check if the attached report contains related clinical evidence. If found, include it in 'ocr_report_correlation' with prefix 'Extracted from Uploaded Report: ...'. If not related, set 'ocr_report_correlation' to null.
"""
        elif doc_class == "handwritten":
            doc_section = """
ATTACHED MEDICAL DOCUMENT:
- Handwritten prescription/note attached. Text extraction bypassed for visual doctor review.
"""

    return f"""PATIENT INTERVIEW DIALOGUE (All turns in English):
{json.dumps(dialogue_turns, indent=2)}
{doc_section}
PATIENT PREFERRED LANGUAGE: {lang_name} ({lang_code})

Generate this exhaustive clinical JSON. (Do NOT write 'Not available' or 'N/A' anywhere; use null when data is missing):
{{
  "all_symptoms_overview": [
    "<Symptom name 1, e.g. High Fever>",
    "<Symptom name 2, e.g. Frontal Throbbing Headache>"
  ],
  "symptoms_deep_dive": [
    {{
      "name": "<symptom name, e.g. High Fever>",
      "timeline": "<onset and duration timeline, e.g. Started 3 days ago, progressive worsening>",
      "depth_and_severity": "<depth, character, and severity score, e.g. High intensity, 7/10 depth, dull throbbing>",
      "timing_and_diurnal_pattern": "<exact diurnal pattern, e.g. Fever comes specifically in the evening around 5-6 PM with chills, subsides towards morning>",
      "triggers_and_relieving": "<aggravating and relieving factors, e.g. Aggravated by cold air; partially relieved by warm fluids and rest>",
      "patient_disclosed_details": "<COMPREHENSIVE statement: everything the patient stated about this symptom during interrogation. Do NOT omit any single fact, sensation, time, or detail>",
      "ocr_report_correlation": "<'Extracted from Uploaded Report: ...' if matching report evidence exists, or null>"
    }}
  ],
  "chief_complaints": "<concise clinical synthesis of verified presenting complaints>",
  "overall_duration": "<overall timeline if stated, e.g. 3 days, or null>",
  "overall_severity": "Mild | Moderate | Severe | Critical",
  "triage_urgency": "Emergency | Priority | Routine",
  "urgency_reason": "<clear clinical justification for this urgency classification>",
  "pain_and_sensitivity": {{
    "score": "<e.g. 7/10 or null>",
    "intensity": "<Mild | Moderate | Severe | Excruciating or null>",
    "sensitivity_triggers": "<specific sensitivity factors: photophobia, cold, touch, movement, or null>"
  }},
  "ruled_out": ["<symptoms specifically denied by patient>"],
  "affected_body_areas": ["<anatomical areas affected>"],
  "aggravating_and_relieving": {{
    "aggravating": "<what makes symptoms worse or null>",
    "relieving": "<what makes symptoms better or null>"
  }},
  "medications_and_history": {{
    "medications_taken": "<medicines taken by patient or null>",
    "chronic_conditions": "<existing chronic diseases/history or null>",
    "allergies": "<reported allergies or null>"
  }},
  "red_flags": ["<warning signs detected, or empty list if none>"],
  "clinical_notes": "<synthesized objective clinical history of presenting illness and kiosk observations for the doctor>",
  "concluding_message_en": "Thank you. Your symptoms have been thoroughly recorded. A healthcare professional will examine you shortly.",
  "concluding_message": "<same message in {lang_name} - polite, reassuring, professional>"
}}"""


# ==============================================================================
# SECTION 7: DYNAMIC NEXT-STEP DECISION PROMPT (Conversational/Fallback)
# ==============================================================================

DECIDE_NEXT_STEP_SYSTEM = (
    "You are an expert Clinical AI Diagnostic Triage Engine at a primary healthcare kiosk. "
    "All dialogue history is provided in ENGLISH. "
    "CRITICAL MEDICAL RULES:\n"
    "1. Respond with a PURE JSON object only. No markdown, no preambles, no explanation outside JSON.\n"
    "2. DO NOT REPEAT ANY QUESTION OR SYMPTOM ALREADY DISCLOSED OR DENIED BY THE PATIENT:\n"
    "   - Carefully examine what the patient has already described.\n"
    "   - NEVER ask 'how long' if they already gave the duration.\n"
    "   - NEVER ask about a symptom if they already confirmed or denied it.\n"
    "3. DEDUCE THE NEXT CLINICAL STEP:\n"
    "   - Inquire about unexplored critical diagnostic factors: pain severity (1-10), progression, associated alarms, medications, or chronic conditions.\n"
    "4. OUTPUT FORMAT REQUIREMENTS:\n"
    "   - 'next_question_en': Question in clear medical English.\n"
    "   - 'next_question': Same question translated into natural, polite script for patient voice/display.\n"
    "   - 'question_intent': Brief English summary of clinical intent.\n"
    "   - 'planned_questions': Array of 1-2 upcoming questions with 'flag': 'not_asked' and 'intent'.\n"
    "   - 'all_data_collected': boolean.\n"
    "   - 'ai_summary': Structured summary if complete, or null."
)

def build_decide_next_step_prompt(
    lang_name: str,
    lang_code: str,
    turns_count: int,
    english_turns_history: List[Dict[str, Any]],
    not_asked_summary: List[Dict[str, Any]]
) -> str:
    """Builds prompt for dynamic single-step triage decisioning."""
    return f"""CURRENT CLINICAL MEMORY (ENGLISH):
- Preferred Patient Language: {lang_name} ({lang_code})
- Completed Turns Count: {turns_count}
- Turns History (Questions & Patient Disclosures in English):
{json.dumps(english_turns_history, indent=2)}
- Currently Planned In Queue (Not Asked):
{json.dumps(not_asked_summary, indent=2)}

Examine what the patient has already revealed. Formulate the next unaddressed clinical question or conclude triage. Return strict JSON."""


# ==============================================================================
# SECTION 8: MEDICAL PRESCRIPTION & REPORT OCR EXTRACTION PROMPTS
# ==============================================================================

PRESCRIPTION_INQUIRY_SYSTEM = (
    "You are a compassionate clinical AI triage assistant at a healthcare kiosk. "
    "Ask the patient courteously in their language if they have any doctor's prescription, "
    "medical note, or lab test report to show to the camera."
)

def build_prescription_inquiry_prompt(lang_name: str) -> str:
    """Builds prompt to politely ask patient if they have a prescription/report."""
    return (
        f"The patient speaks {lang_name}.\n"
        f"Ask them politely, clearly, and warmly: "
        f"'Do you have any doctor's prescription, medical slip, or test report to show?'\n"
        f"Output ONLY the question in {lang_name} script with polite, natural phrasing. "
        f"Do NOT include English translation, notes, or quotation marks."
    )


PRESCRIPTION_EXTRACTION_SYSTEM = (
    "You are an expert Clinical Medical Document & Prescription Parser. "
    "You analyze raw OCR text extracted from medical prescriptions, laboratory reports, "
    "hospital discharge summaries, and diagnostic notes.\n\n"
    "CRITICAL CLINICAL EXTRACTION RULES:\n"
    "1. Respond with a PURE JSON object only. No markdown, no commentary, no backticks outside JSON.\n"
    "2. DO NOT INVENT, FABRICATE, OR ASSUME ANY VALUES. If a field or detail is not explicitly written in the OCR text, set it to null or [] (empty list).\n"
    "3. Extract all explicit medical information with utmost clinical fidelity:\n"
    "   - Report / Document Type (e.g. 'Prescription', 'Blood Test Report', 'Discharge Summary', 'Radiology Report', 'Other')\n"
    "   - Healthcare Facility / Hospital name and Doctor name if printed\n"
    "   - Document Date (if present)\n"
    "   - Medications list: [{ name, dosage, frequency, duration, instructions }]\n"
    "   - Vitals & Clinical Measurements: { blood_pressure, pulse, blood_sugar, spo2, temperature, weight_kg, etc. }\n"
    "   - Diagnoses, Findings, or Lab Results mentioned: [{ test_or_diagnosis, result_or_value, reference_range, flag }]\n"
    "   - Doctor's advice, dietary restrictions, or follow-up instructions\n"
    "   - Concise 2-sentence clinical summary of what the document contains."
)

def build_prescription_extraction_prompt(ocr_text: str) -> str:
    """Builds prompt for extracting structured clinical data from validated OCR text."""
    return f"""RAW EXTRACTED OCR TEXT FROM MEDICAL DOCUMENT:
\"\"\"{ocr_text.strip()}\"\"\"

Extract structured medical information strictly based on what is explicitly stated above without fabricating any values.
Return a PURE JSON object conforming exactly to this structure:
{{
  "report_type": "<Prescription | Lab Report | Discharge Summary | Radiology Report | Other>",
  "doctor_name": "<Doctor name or null>",
  "facility_name": "<Hospital / Clinic name or null>",
  "document_date": "<Date or null>",
  "patient_name_on_doc": "<Patient name on document or null>",
  "medications": [
    {{
      "name": "<Medicine name>",
      "dosage": "<Dosage e.g. 500mg or null>",
      "frequency": "<e.g. 1-0-1, twice daily, or null>",
      "duration": "<e.g. 5 days, 1 month, or null>",
      "instructions": "<e.g. after food, empty stomach, or null>"
    }}
  ],
  "vitals_and_measurements": {{
    "blood_pressure": "<e.g. 120/80 or null>",
    "pulse": "<e.g. 78 bpm or null>",
    "blood_sugar": "<e.g. 140 mg/dL or null>",
    "spo2": "<e.g. 98% or null>",
    "temperature": "<e.g. 98.6 F or null>",
    "other_measurements": []
  }},
  "diagnoses_and_findings": [
    "<Explicit diagnosis, lab test result, or radiological finding>"
  ],
  "doctor_advice_and_instructions": [
    "<Explicit advice or follow-up instructions>"
  ],
  "clinical_summary": "<Concise 2-sentence summary of the medical document for reviewing doctor>",
  "confidence_score": <estimated extraction confidence float between 0.0 and 1.0>
}}"""


# ==============================================================================
# SECTION 9: ANSWER ADEQUACY VALIDATION PROMPTS
# ==============================================================================
#
# Used to check whether the patient's reply is a genuine answer to the asked
# clinical question, or whether they are requesting a repeat, saying they couldn't
# hear, giving a non-answer, or expressing confusion.
#
# Returns JSON: { "is_valid_answer": bool, "reason": str, "repeat_message": str }
#
# ── How it works ──────────────────────────────────────────────────────────────
# Before recording an answer and moving to the NEXT question, the LLM reviews:
#   • The clinical question (in English) that was asked
#   • The patient's actual reply (translated to English)
#
# If the patient said something like:
#   "Can you ask again?", "I could not hear", "What did you say?",
#   "Repeat please", "Sorry?", "Huh?", "Kya?", "Phir se poochhe",
#   "Mujhe sunai nahi diya", "Kuch samajh nahi aaya", "I don't know",
#   "No answer", "OK" (without substance), or a completely off-topic reply
# → is_valid_answer = False, and the SAME question is asked again with a gentle
#   acknowledgment in the patient's language.
#
# If the patient gave an actual clinical answer (even partial / short):
# → is_valid_answer = True, the answer is recorded and we advance.
# ==============================================================================

ANSWER_ADEQUACY_SYSTEM = (
    "You are a clinical triage AI quality controller. "
    "Your sole task is to judge whether a patient's reply constitutes a genuine "
    "answer to the specific clinical question asked, or whether the patient is "
    "requesting a repeat, expressing they could not hear/understand, or giving a "
    "meaningless non-answer. "
    "Be LENIENT: even very brief or partial answers (e.g. 'yes', 'no', '2 days', 'stomach pain', "
    "'not sure', 'sometimes') are VALID answers. "
    "Mark as INVALID ONLY if the reply is:\n"
    "  - A request to repeat or re-ask (e.g. 'say again', 'repeat', 'ask again', "
    "'I could not hear', 'kya bola', 'phir se', 'suni nahi', 'kya?', 'huh?', 'pardon?')\n"
    "  - Completely silent / empty / unintelligible noise\n"
    "  - A system/technical error message\n"
    "  - Entirely unrelated to the medical context and shows confusion about what was asked\n"
    "Respond ONLY with a JSON object. No markdown, no preamble.\n"
    "JSON format:\n"
    "{ \"is_valid_answer\": <true|false>, \"reason\": \"<1 sentence why>\", "
    "\"repeat_message\": \"<polite apology + re-ask of the question in the patient's language (only fill if is_valid_answer=false)>\" }"
)


def build_answer_adequacy_prompt(
    question_en: str,
    patient_answer_en: str,
    question_in_patient_lang: str,
    patient_lang_name: str,
) -> str:
    """
    Builds the adequacy validation prompt.

    Args:
        question_en: The clinical question in English (canonical form).
        patient_answer_en: Patient's reply translated to English.
        question_in_patient_lang: Original question text in patient's language (for re-ask).
        patient_lang_name: Patient's language name (e.g. 'Hindi', 'Odia', 'English').
    """
    return f"""Clinical Question Asked (English): "{question_en}"

Patient's Reply (translated to English): "{patient_answer_en}"

Patient's Preferred Language: {patient_lang_name}
Original Question in Patient's Language: "{question_in_patient_lang}"

Is the patient's reply a genuine answer to the clinical question, or are they
requesting a repeat / expressing they could not hear or understand?

If is_valid_answer is false, write repeat_message as a warm, polite apology in
{patient_lang_name} script (not English), followed by the original question restated.
Example format: "माफ करें, मुझे आपकी बात सुनाई नहीं दी। <original question in Hindi>"

Respond with ONLY a JSON object:"""


# ==============================================================================
# SECTION 7: URGENCY & EMERGENCY SIGNAL CLINICAL VALIDATION PROMPTS
# ==============================================================================

URGENCY_VERIFICATION_SYSTEM = (
    "You are an expert clinical triage emergency validation AI at a rural and primary healthcare kiosk. "
    "A local keyword or NLP semantic detector flagged a potential urgency trigger word or phrase in a patient's statement. "
    "Your job is to perform a fast clinical validation to distinguish genuine acute medical emergencies "
    "from mild, chronic, benign, or non-urgent symptom mentions.\n\n"
    "CRITICAL CLINICAL RULES:\n"
    "1. TRUE EMERGENCY (is_true_emergency = true, should_halt_interview = true):\n"
    "   - Severe, crushing, radiating chest pain, suspected acute myocardial infarction / heart attack,\n"
    "     severe difficulty breathing / suffocating / choking, sudden syncope / collapse / unconsciousness,\n"
    "     heavy uncontrolled bleeding, stroke signs (facial drooping, slurred speech, paralysis).\n"
    "   - In these cases, the interview MUST halt immediately so the patient sees the emergency doctor.\n"
    "2. NON-EMERGENCY / MOVE FORWARD (is_true_emergency = false, should_halt_interview = false):\n"
    "   - Symptoms explicitly described as 'mild', 'slight', 'minor', 'a little', 'thoda', 'kam', or 'bearable'.\n"
    "   - Chronic or long-standing duration (e.g., 'for 2 weeks', 'since 1 month', 'comes and goes for months').\n"
    "   - Clearly benign or non-cardiac context (e.g., 'mild heart pain after spicy food', 'gas pain near heart', 'muscle strain', 'hurts when pressing').\n"
    "   - In these cases, DO NOT HALT. The patient is clinically stable and the kiosk MUST MOVE FORWARD with the interview to collect more clinical details.\n\n"
    "Respond with strict JSON ONLY:\n"
    "{\n"
    "  \"is_true_emergency\": boolean,\n"
    "  \"should_halt_interview\": boolean,\n"
    "  \"severity\": \"critical\" | \"moderate\" | \"mild\",\n"
    "  \"reason\": \"Concise clinical rationale for decision\"\n"
    "}"
)

def build_urgency_verification_prompt(
    patient_text: str,
    patient_text_en: str,
    detected_concept: str,
    matched_phrase: Optional[str] = None,
) -> str:
    """Builds prompt to clinically evaluate whether a flagged urgency signal is a true emergency or mild/routine."""
    return (
        f"Patient Statement (English translation): \"{patient_text_en}\"\n"
        f"Patient Original Utterance: \"{patient_text}\"\n"
        f"Triggered Urgency Concept: {detected_concept}\n"
        f"Triggered Term / Phrase: {matched_phrase or 'Semantic match'}\n\n"
        f"Evaluate whether this is a true acute emergency requiring immediate interview halt, or a mild/routine symptom where the interview should move forward.\n"
        f"Respond with JSON ONLY:"
    )


# ==============================================================================
# SECTION 12: CLINICAL REFERRAL NOTE GENERATION PROMPTS
# ==============================================================================

CLINICAL_REFERRAL_NOTE_SYSTEM = (
    "You are an expert Chief Medical Officer and Senior Clinical Referral Officer at Astra Health Network.\n"
    "Your objective is to generate an authoritative, highly comprehensive, and legally robust official "
    "Hospital-to-Hospital Medical Referral & Transfer Memorandum based on the attending physician's referral inputs.\n\n"
    "MANDATORY FORMATTING & CLINICAL RULES:\n"
    "1. STRUCTURE THE REFERRAL NOTE INTO CLEAR, TITLED SECTIONS USING BULLET POINTS AND PARAGRAPHS.\n"
    "2. INCLUDE:\n"
    "   • OFFICIAL REFERRAL MEMORANDUM HEADER (Referring Facility, Attending Doctor, Date/Time, Urgency Level)\n"
    "   • PATIENT SUMMARY & RECORDED VITALS (Name, ID, Age/Gender, BP, Pulse/Temp, Baseline Status)\n"
    "   • PROVISIONAL / WORKING DIAGNOSIS\n"
    "   • CHIEF COMPLAINTS & CLINICAL COURSE\n"
    "   • PRIMARY REASON & JUSTIFICATION FOR EXTERNAL TRANSFER (Why higher level care is medically necessary)\n"
    "   • PRE-TRANSFER STABILIZATION MEASURES & MEDICATIONS ADMINISTERED\n"
    "   • RECOMMENDED LEVEL OF CARE & EN ROUTE MONITORING INSTRUCTIONS (Ambulance type, oxygen, paramedic escort)\n"
    "3. Maintain a formal, precise, and objective medical tone appropriate for tertiary hospital specialists.\n"
    "4. Do NOT hallucinate unmentioned medical conditions, but formulate professional transfer protocols for the specified diagnosis.\n"
    "5. CRITICAL: DO NOT ADD ANY SIGNATURE LINES, SIGN-OFF BLOCKS, DOCTOR STAMPS, OR VERIFY/SEAL TAGS UNDER THE REPORT. End cleanly after the En Route Monitoring Instructions."
)

def build_clinical_referral_note_prompt(
    patient_name: str,
    patient_id: str,
    age: int,
    gender: str,
    vitals_text: str,
    chief_complaints: str,
    reason_for_referral: str,
    possible_diagnosis: str,
    referring_doctor_name: str,
    referring_facility_name: str,
    urgency: str = "Urgent",
    clinical_notes: Optional[str] = None,
    current_datetime: Optional[str] = None,
) -> str:
    """Builds prompt for generating the comprehensive AI referral note."""
    dt_str = current_datetime or datetime.utcnow().strftime("%d %B %Y, %I:%M %p")
    return (
        f"DATE & TIME OF REFERRAL: {dt_str}\n"
        f"PATIENT NAME: {patient_name} (ID: {patient_id})\n"
        f"AGE / GENDER: {age} years / {gender}\n"
        f"RECORDED BIOMARKERS & VITALS: {vitals_text}\n"
        f"CHIEF COMPLAINTS & INTERROGATION: {chief_complaints or 'None recorded'}\n"
        f"REFERRING PHYSICIAN: Dr. {referring_doctor_name}\n"
        f"REFERRING FACILITY: {referring_facility_name}\n"
        f"PROVISIONAL / WORKING DIAGNOSIS: {possible_diagnosis}\n"
        f"REASON FOR EXTERNAL REFERRAL: {reason_for_referral}\n"
        f"REFERRAL URGENCY: {urgency}\n"
        f"ATTENDING DOCTOR CLINICAL NOTES / BEDSIDE MEASURES: {clinical_notes or 'Standard pre-referral supportive care'}\n\n"
        f"MANDATORY INSTRUCTIONS:\n"
        f"- In 'Date/Time of Referral', write '{dt_str}'. NEVER write placeholder brackets like '[Insert Current Date and Time]'.\n"
        f"- DO NOT add any signature lines, signature boxes, verify tags, or seals under the report. Stop after the en route monitoring section.\n\n"
        f"Draft the complete, official, structured Hospital Referral Transfer Memorandum:"
    )


