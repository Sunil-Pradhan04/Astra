"""
RAG-based Clinical Triage Service
-----------------------------------
Architecture:
- Embedding Engine: OpenAI (text-embedding-3-small, 1536 dim) for Pinecone disease vector search ONLY.
- LLM Intelligence Engine: Sarvam AI (sarvam-105b-conversations) everywhere for all clinical reasoning:
    * Symptom extraction from free-text dialogue
    * Phase 2: Targeted differential follow-up question generation
    * Phase 3: Clinical detail deep-dive question generation
    * Final structured consultation summary generation

All questions stored in English (canonical memory).
Displayed and spoken in patient's preferred Indic language (Hindi, Odia, English).
"""

import json
import re
import httpx
from typing import Dict, Any, Optional, List
from openai import AsyncOpenAI
from pinecone import Pinecone as PineconeClient
from app.core.config import settings
from app.core.prompts import (
    RAG_FOLLOWUP_SYSTEM,
    build_rag_followup_prompt,
    DETAIL_QUESTIONS_SYSTEM,
    build_detail_questions_prompt,
    FINAL_SUMMARY_SYSTEM,
    build_final_summary_prompt,
    SYMPTOM_EXTRACTION_SYSTEM,
    build_symptom_extraction_prompt,
)

SARVAM_BASE_URL = "https://api.sarvam.ai"
SARVAM_LLM_MODEL = "sarvam-105b-conversations"


def _clean_json_response(raw: str) -> Any:
    """Strips markdown code fences and parses JSON safely."""
    cleaned = raw.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()
    return json.loads(cleaned)


class RagTriageService:
    """
    Service combining OpenAI embeddings (for Pinecone vector index search)
    with Sarvam AI LLM (sarvam-105b-conversations) for all clinical reasoning.
    """

    def __init__(self):
        self._openai: Optional[AsyncOpenAI] = None
        self._pinecone_index = None
        self._initialized = False

    def _ensure_init(self):
        """Initializes OpenAI embedding client and Pinecone vector index."""
        if not self._initialized:
            if not settings.OPENAI_API_KEY:
                raise RuntimeError("OPENAI_API_KEY not configured in .env (required for Pinecone embeddings)")
            if not settings.PINECONE_API_KEY:
                raise RuntimeError("PINECONE_API_KEY not configured in .env")

            # OpenAI is used ONLY for text embeddings
            self._openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            pc = PineconeClient(api_key=settings.PINECONE_API_KEY)
            self._pinecone_index = pc.Index(settings.PINECONE_INDEX)
            self._initialized = True
            print(f"[RagTriageService] Initialized with Pinecone index '{settings.PINECONE_INDEX}' (OpenAI embeddings + Sarvam AI LLM)")

    # ─────────────────────────────────────────────────────────────────────
    # SARVAM AI LLM ENGINE (Used everywhere for text generation & reasoning)
    # ─────────────────────────────────────────────────────────────────────

    async def _call_sarvam_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 800,
        timeout: float = 45.0
    ) -> str:
        """
        Executes a chat completion call to Sarvam AI's LLM (sarvam-105b-conversations).
        """
        if not settings.SARVAM_AI_API_KEY:
            raise RuntimeError("SARVAM_AI_API_KEY not configured in .env")

        headers = {
            "api-subscription-key": settings.SARVAM_AI_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "model": SARVAM_LLM_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(
                f"{SARVAM_BASE_URL}/v1/chat/completions",
                headers=headers,
                json=payload
            )
            if res.status_code != 200:
                raise RuntimeError(f"Sarvam AI LLM API returned {res.status_code}: {res.text}")

            data = res.json()
            return data["choices"][0]["message"]["content"].strip()

    # ─────────────────────────────────────────────────────────────────────
    # 1.  PINECONE VECTOR RETRIEVAL (ONLY place OpenAI is used - embeddings)
    # ─────────────────────────────────────────────────────────────────────

    async def retrieve_candidate_diseases(
        self,
        symptoms_text: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Embeds the patient's symptom summary with OpenAI text-embedding-3-small (1536 dim)
        and retrieves the top candidate disease entries from Pinecone.
        """
        self._ensure_init()

        # OpenAI is used ONLY for embedding generation
        emb_response = await self._openai.embeddings.create(
            input=[symptoms_text.strip()],
            model="text-embedding-3-small"
        )
        query_vector = emb_response.data[0].embedding

        # Query Pinecone vector database
        query_result = self._pinecone_index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True
        )

        candidates = []
        for match in query_result.matches:
            meta = match.metadata or {}
            candidates.append({
                "disease": meta.get("disease", ""),
                "similarity_score": round(match.score, 4),
                "characteristic_symptoms": meta.get("symptoms", "")
            })

        print(f"[RagTriageService] Retrieved {len(candidates)} candidate diseases from Pinecone via OpenAI embeddings.")
        return candidates

    # ─────────────────────────────────────────────────────────────────────
    # 2.  PHASE 2: RAG FOLLOW-UP QUESTION GENERATION (Sarvam AI LLM)
    # ─────────────────────────────────────────────────────────────────────

    async def generate_rag_followup_questions(
        self,
        symptoms_summary: str,
        candidate_diseases: List[Dict[str, Any]],
        already_asked_intents: List[str],
        lang_name: str = "English",
        lang_code: str = "en-IN"
    ) -> List[Dict[str, Any]]:
        """
        Sends patient symptoms + Pinecone candidate diseases to Sarvam AI LLM.
        Returns 3 targeted follow-up questions to discriminate between candidate diseases.
        Each question contains:
          - question_text_en (canonical English)
          - question_text (in patient's language)
          - clinical_intent
          - target_differential
        """
        system_prompt = RAG_FOLLOWUP_SYSTEM
        user_prompt = build_rag_followup_prompt(
            symptoms_summary=symptoms_summary,
            candidate_diseases=candidate_diseases,
            already_asked_intents=already_asked_intents,
            lang_name=lang_name,
            lang_code=lang_code,
        )

        try:
            raw = await self._call_sarvam_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                max_tokens=800
            )
            parsed = _clean_json_response(raw)
            questions = parsed.get("followup_questions", [])
            print(f"[RagTriageService] Sarvam AI generated {len(questions)} RAG follow-up questions.")
            return questions
        except Exception as e:
            print(f"[RagTriageService] Error generating RAG follow-up questions with Sarvam AI: {e}")
            # Safe localized fallbacks
            if "hi" in lang_code:
                return [
                    {
                        "question_text_en": "Have you noticed any fever or chills along with your symptoms?",
                        "question_text": "क्या आपको अपने लक्षणों के साथ बुखार या ठंड लगने की समस्या हुई है?",
                        "clinical_intent": "Screen for systemic infection signs",
                        "target_differential": "Infectious differential"
                    },
                    {
                        "question_text_en": "Do any specific activities or positions make your symptoms worse or better?",
                        "question_text": "क्या किसी विशेष काम या स्थिति से आपके लक्षण बढ़ते या कम होते हैं?",
                        "clinical_intent": "Assess aggravating and relieving factors",
                        "target_differential": "Symptom characterization"
                    },
                    {
                        "question_text_en": "Have you taken any medicines for these symptoms?",
                        "question_text": "क्या आपने इन लक्षणों के लिए कोई दवाई ली है?",
                        "clinical_intent": "Prior medication history",
                        "target_differential": "Treatment history"
                    }
                ]
            elif "od" in lang_code:
                return [
                    {
                        "question_text_en": "Have you noticed any fever or chills along with your symptoms?",
                        "question_text": "ଆପଣଙ୍କର ଲକ୍ଷଣ ସହିତ ଜ୍ୱର କିମ୍ବା ଥଣ୍ଡା ଲାଗିବା ଅନୁଭବ ହୋଇଛି କି?",
                        "clinical_intent": "Screen for systemic infection signs",
                        "target_differential": "Infectious differential"
                    },
                    {
                        "question_text_en": "Do any specific activities make your symptoms worse or better?",
                        "question_text": "କୌଣସି କାର୍ଯ୍ୟ କଲେ ଆପଣଙ୍କ ସମସ୍ୟା ବଢ଼ୁଛି କିମ୍ବା କମୁଛି କି?",
                        "clinical_intent": "Assess aggravating and relieving factors",
                        "target_differential": "Symptom characterization"
                    },
                    {
                        "question_text_en": "Have you taken any medicines for these symptoms?",
                        "question_text": "ଆପଣ ଏହି ଲକ୍ଷଣଗୁଡିକ ପାଇଁ କୌଣସି ଔଷଧ ଖାଇଛନ୍ତି କି?",
                        "clinical_intent": "Prior medication history",
                        "target_differential": "Treatment history"
                    }
                ]
            else:
                return [
                    {
                        "question_text_en": "Have you noticed any fever or chills along with your symptoms?",
                        "question_text": "Have you noticed any fever or chills along with your symptoms?",
                        "clinical_intent": "Screen for systemic infection signs",
                        "target_differential": "Infectious differential"
                    },
                    {
                        "question_text_en": "Do any specific activities make your symptoms worse or better?",
                        "question_text": "Do any specific activities make your symptoms worse or better?",
                        "clinical_intent": "Assess aggravating and relieving factors",
                        "target_differential": "Symptom characterization"
                    },
                    {
                        "question_text_en": "Have you taken any medications for these symptoms?",
                        "question_text": "Have you taken any medications for these symptoms?",
                        "clinical_intent": "Prior medication history",
                        "target_differential": "Treatment history"
                    }
                ]

    # ─────────────────────────────────────────────────────────────────────
    # 3.  PHASE 3: DETAIL QUESTION PLAN (Sarvam AI LLM)
    # ─────────────────────────────────────────────────────────────────────

    async def generate_detail_questions(
        self,
        symptoms_summary: str,
        candidate_diseases: List[Dict[str, Any]],
        lang_name: str = "English",
        lang_code: str = "en-IN"
    ) -> List[Dict[str, Any]]:
        """
        Generates Phase 3 clinical detail questions using Sarvam AI LLM:
        duration, location, severity, pattern, aggravating factors, prior medications,
        chronic conditions.
        """
        system_prompt = DETAIL_QUESTIONS_SYSTEM
        user_prompt = build_detail_questions_prompt(
            symptoms_summary=symptoms_summary,
            candidate_diseases=candidate_diseases,
            lang_name=lang_name,
            lang_code=lang_code,
        )

        try:
            raw = await self._call_sarvam_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2,
                max_tokens=800
            )
            parsed = _clean_json_response(raw)
            questions = parsed.get("detail_questions", [])
            print(f"[RagTriageService] Sarvam AI generated {len(questions)} Phase-3 detail questions.")
            return questions
        except Exception as e:
            print(f"[RagTriageService] Error generating detail questions with Sarvam AI: {e}")
            # Reliable fallbacks
            if "hi" in lang_code:
                return [
                    {"question_text_en": "How long have you been experiencing these symptoms?",
                     "question_text": "आपको यह लक्षण कितने समय से महसूस हो रहे हैं?",
                     "clinical_intent": "Onset and duration", "detail_type": "duration"},
                    {"question_text_en": "Can you point to exactly where you feel the discomfort in your body?",
                     "question_text": "क्या आप बता सकते हैं कि शरीर में ठीक किस जगह तकलीफ हो रही है?",
                     "clinical_intent": "Anatomical location", "detail_type": "location"},
                    {"question_text_en": "On a scale of 1 to 10, how severe is the pain or discomfort right now?",
                     "question_text": "1 से 10 के पैमाने पर, दर्द या परेशानी अभी कितनी गंभीर है?",
                     "clinical_intent": "Severity rating", "detail_type": "severity"},
                    {"question_text_en": "Is the discomfort constant or does it come and go throughout the day?",
                     "question_text": "क्या यह तकलीफ लगातार बनी रहती है या दिन में आती-जाती रहती है?",
                     "clinical_intent": "Symptom pattern", "detail_type": "pattern"},
                    {"question_text_en": "Have you taken any medicines for this? Do you have any existing health conditions like diabetes or heart disease?",
                     "question_text": "क्या आपने इसके लिए कोई दवा ली है? क्या आपको पहले से कोई बीमारी जैसे शुगर या बीपी है?",
                     "clinical_intent": "Medication and medical history", "detail_type": "history"},
                ]
            elif "od" in lang_code:
                return [
                    {"question_text_en": "How long have you been experiencing these symptoms?",
                     "question_text": "ଆପଣ କେତେ ଦିନ ହେଲାଣି ଏହି ସମସ୍ୟା ଅନୁଭବ କରୁଛନ୍ତି?",
                     "clinical_intent": "Onset and duration", "detail_type": "duration"},
                    {"question_text_en": "Can you point to exactly where you feel the discomfort in your body?",
                     "question_text": "ଆପଣଙ୍କ ଶରୀରର କେଉଁ ସ୍ଥାନରେ ଯନ୍ତ୍ରଣା ବା ଅସୁବିଧା ହେଉଛି?",
                     "clinical_intent": "Anatomical location", "detail_type": "location"},
                    {"question_text_en": "On a scale of 1 to 10, how severe is the pain or discomfort right now?",
                     "question_text": "୧ ରୁ ୧୦ ମଧ୍ୟରେ, ବର୍ତ୍ତମାନ ଯନ୍ତ୍ରଣା କେତେ ତୀବ୍ର ଅଛି?",
                     "clinical_intent": "Severity rating", "detail_type": "severity"},
                    {"question_text_en": "Is the discomfort constant or does it come and go throughout the day?",
                     "question_text": "ଏହି କଷ୍ଟ ସବୁବେଳେ ରହୁଛି କି ଆସି ଯାଉଛି?",
                     "clinical_intent": "Symptom pattern", "detail_type": "pattern"},
                    {"question_text_en": "Have you taken any medicines for this? Do you have any existing health conditions like diabetes or heart disease?",
                     "question_text": "ଆପଣ ଏଥିପାଇଁ କୌଣସି ଔଷଧ ନେଇଛନ୍ତି କି? କୌଣସି ପୁରୁଣା ରୋଗ ଅଛି କି?",
                     "clinical_intent": "Medication and medical history", "detail_type": "history"},
                ]
            else:
                return [
                    {"question_text_en": "How long have you been experiencing these symptoms?",
                     "question_text": "How long have you been experiencing these symptoms?",
                     "clinical_intent": "Onset and duration", "detail_type": "duration"},
                    {"question_text_en": "Can you point to exactly where you feel the discomfort in your body?",
                     "question_text": "Can you point to exactly where you feel the discomfort in your body?",
                     "clinical_intent": "Anatomical location", "detail_type": "location"},
                    {"question_text_en": "On a scale of 1 to 10, how severe is the pain or discomfort right now?",
                     "question_text": "On a scale of 1 to 10, how severe is the pain or discomfort right now?",
                     "clinical_intent": "Severity rating", "detail_type": "severity"},
                    {"question_text_en": "Is the discomfort constant or does it come and go throughout the day?",
                     "question_text": "Is the discomfort constant or does it come and go throughout the day?",
                     "clinical_intent": "Symptom pattern", "detail_type": "pattern"},
                    {"question_text_en": "Have you taken any medicines for this? Do you have any existing health conditions like diabetes or heart disease?",
                     "question_text": "Have you taken any medicines for this? Do you have any existing health conditions like diabetes or heart disease?",
                     "clinical_intent": "Medication and medical history", "detail_type": "history"},
                ]

    # ─────────────────────────────────────────────────────────────────────
    # 4.  FINAL SUMMARY GENERATION (Sarvam AI LLM)
    # ─────────────────────────────────────────────────────────────────────

    async def generate_final_summary(
        self,
        memory: Dict[str, Any],
        prescription_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Reads full conversation memory (all questions + patient answers in English)
        and generates a comprehensive, granular clinical summary using Sarvam AI LLM.
        Rigorously extracts:
        - Detailed breakdown of EVERY symptom (name, exact duration, severity/pain score, anatomical location, pattern, triggers/sensitivity)
        - Pain and Sensitivity Scale (score 1-10, intensity, photophobia/cold/movement sensitivities)
        - Ruled-out / denied symptoms
        - Affected anatomical regions
        - Aggravating & relieving factors
        - Medications taken & existing chronic history
        - Suspected disease differentials from vector search
        - Red flag emergency indicators
        - Doctor-ready synthesized clinical notes
        """
        lang_name = memory.get("language_name", "English")
        lang_code = memory.get("language", "en-IN")
        questions = memory.get("questions", [])
        candidate_diseases = memory.get("rag_candidates", [])

        # Retrieve prescription data if not explicitly provided
        if not prescription_data:
            prescription_data = memory.get("prescription_result") or memory.get("prescription_data")

        # Build full dialogue history in English
        turns = []
        for q in questions:
            if q.get("flag") == "asked" and q.get("patient_answer_en"):
                turns.append({
                    "question": q.get("question_text_en", ""),
                    "answer": q.get("patient_answer_en", "")
                })

        system_prompt = FINAL_SUMMARY_SYSTEM
        user_prompt = build_final_summary_prompt(
            dialogue_turns=turns,
            candidate_diseases=candidate_diseases,
            lang_name=lang_name,
            lang_code=lang_code,
            prescription_data=prescription_data,
        )

        try:
            raw = await self._call_sarvam_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=1500
            )
            summary = _clean_json_response(raw)

            # Ensure backward-compatible aliases for legacy readers
            if "overall_severity" in summary and "severity" not in summary:
                summary["severity"] = summary["overall_severity"]
            if "overall_duration" in summary and "onset_and_duration" not in summary:
                summary["onset_and_duration"] = summary["overall_duration"]

            # Sanitize placeholders (remove "Not available") and map report data
            summary = self._sanitize_clinical_summary(summary, prescription_data)

            print(f"[RagTriageService] Sarvam AI clinical summary generated. Urgency: {summary.get('triage_urgency')}, Symptoms count: {len(summary.get('symptoms', []))}")
            return summary
        except Exception as e:
            print(f"[RagTriageService] Error generating detailed final summary with Sarvam AI: {e}")
            concluding_msg = "धन्यवाद। आपके लक्षण विस्तार से दर्ज कर लिए गए हैं और स्वास्थ्य कार्यकर्ता जल्द ही आपकी समीक्षा करेंगे।" if "hi" in lang_code else (
                "ଧନ୍ୟବାଦ। ଆପଣଙ୍କ ଲକ୍ଷଣ ବିସ୍ତୃତ ଭାବରେ ରେକର୍ଡ କରାଯାଇଛି ଏବଂ ସ୍ୱାସ୍ଥ୍ୟକର୍ମୀ ଶୀଘ୍ର ଆପଣଙ୍କୁ ଦେଖିବେ।" if "od" in lang_code else
                "Thank you. Your symptoms have been thoroughly recorded. A healthcare professional will examine you shortly."
            )
            fallback_summary = {
                "chief_complaints": memory.get("symptoms_summary") or "Symptom details recorded via kiosk interrogation",
                "overall_duration": None,
                "onset_and_duration": None,
                "overall_severity": "Moderate",
                "severity": "Moderate",
                "triage_urgency": "Routine",
                "urgency_reason": "Standard triage review required",
                "pain_and_sensitivity": {
                    "score": None,
                    "intensity": "Moderate",
                    "sensitivity_triggers": None
                },
                "symptoms": [
                    {"name": memory.get("symptoms_summary") or "Reported symptoms", "duration": None, "severity": "Moderate", "location": None, "pattern": None, "triggers": None, "report_correlation": None}
                ],
                "ruled_out": [],
                "affected_body_areas": [],
                "aggravating_and_relieving": {"aggravating": None, "relieving": "Rest"},
                "medications_and_history": {"medications_taken": None, "chronic_conditions": None, "allergies": None},
                "suspected_conditions": [],
                "red_flags": [],
                "clinical_notes": "Patient interview completed. Please review session memory for full details.",
                "concluding_message_en": "Thank you. Your symptoms have been thoroughly recorded. A healthcare professional will examine you shortly.",
                "concluding_message": concluding_msg,
            }
            return self._sanitize_clinical_summary(fallback_summary, prescription_data)

    def _sanitize_clinical_summary(self, summary: Dict[str, Any], prescription_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Cleans placeholder strings (e.g. 'Not available', 'None reported', 'N/A') so that
        only verified clinical information is displayed. Also ensures all data from attached
        printed medical reports is cross-mapped directly under relevant symptoms.
        """
        if not isinstance(summary, dict):
            return summary

        placeholder_pattern = re.compile(
            r"^(not available|not reported|not specified|none reported|none stated|none|n/a|unknown|unspecified|not rated|not provided)$",
            re.IGNORECASE
        )

        def clean_val(val):
            if isinstance(val, str) and placeholder_pattern.match(val.strip()):
                return None
            return val

        # Clean top-level fields
        for k in ["overall_duration", "onset_and_duration", "urgency_reason"]:
            if k in summary:
                summary[k] = clean_val(summary[k])

        # Clean pain and sensitivity
        if isinstance(summary.get("pain_and_sensitivity"), dict):
            ps = summary["pain_and_sensitivity"]
            for k in ["score", "intensity", "sensitivity_triggers"]:
                if k in ps:
                    ps[k] = clean_val(ps[k])

        # Clean medications and history
        if isinstance(summary.get("medications_and_history"), dict):
            mh = summary["medications_and_history"]
            for k in ["medications_taken", "chronic_conditions", "allergies"]:
                if k in mh:
                    mh[k] = clean_val(mh[k])

        # Clean and map symptoms
        symptoms = summary.get("symptoms", [])
        if isinstance(symptoms, list):
            for s in symptoms:
                if isinstance(s, dict):
                    for f in ["duration", "severity", "location", "pattern", "triggers"]:
                        if f in s:
                            s[f] = clean_val(s[f])
                    if "report_correlation" in s:
                        s["report_correlation"] = clean_val(s["report_correlation"])

            # Automated Cross-Mapping with Attached Report Evidence
            if prescription_data and prescription_data.get("classification") == "printed":
                structured = prescription_data.get("structured_data", {})
                vitals = structured.get("vitals_and_measurements", {})
                diagnoses = structured.get("diagnoses_and_findings", [])
                medications = structured.get("medications", [])

                for s in symptoms:
                    if not isinstance(s, dict):
                        continue
                    s_name = (s.get("name") or "").lower()

                    # If no report correlation already populated by LLM
                    if not s.get("report_correlation"):
                        correlations = []
                        # Check Blood Pressure
                        if any(w in s_name for w in ["pressure", "bp", "hypotension", "hypertension", "dizziness", "faint", "weakness"]):
                            for vk, vv in vitals.items():
                                if any(bp_k in vk.lower() for bp_k in ["bp", "blood_pressure", "systolic", "diastolic", "pressure"]):
                                    correlations.append(f"Report records BP: {vv}")
                            for d in diagnoses:
                                if any(bp_k in str(d).lower() for bp_k in ["hypotension", "hypertension", "bp"]):
                                    correlations.append(f"Report diagnosis: {d}")

                        # Check Fever / Temperature
                        if any(w in s_name for w in ["fever", "temp", "chill", "pyrexia", "hot"]):
                            for vk, vv in vitals.items():
                                if any(tk in vk.lower() for tk in ["temp", "temperature", "fever"]):
                                    correlations.append(f"Report records Temperature: {vv}")

                        # Check Pulse / Heart Rate
                        if any(w in s_name for w in ["pulse", "heart", "palpitation", "tachycardia"]):
                            for vk, vv in vitals.items():
                                if any(pk in vk.lower() for pk in ["pulse", "heart_rate", "pr"]):
                                    correlations.append(f"Report records Pulse: {vv}")

                        # Check Sugar / Diabetes
                        if any(w in s_name for w in ["sugar", "diabetes", "glucose", "thirst"]):
                            for vk, vv in vitals.items():
                                if any(sk in vk.lower() for sk in ["sugar", "glucose", "hba1c", "fbs", "rbs"]):
                                    correlations.append(f"Report records Glucose: {vv}")

                        # Check related medications
                        for med in medications:
                            med_str = med if isinstance(med, str) else med.get("name", "")
                            if "fever" in s_name and any(p in med_str.lower() for p in ["paracetamol", "pcm", "dolo", "crocin"]):
                                correlations.append(f"Prescribed medication: {med_str}")
                            if ("pressure" in s_name or "bp" in s_name) and any(b in med_str.lower() for b in ["amlodipine", "telmisartan", "atenolol", "fludrocortisone"]):
                                correlations.append(f"Prescribed medication: {med_str}")

                        if correlations:
                            s["report_correlation"] = "; ".join(correlations)

        # Attach prescription record reference
        if prescription_data:
            summary["attached_prescription"] = {
                "classification": prescription_data.get("classification", "printed"),
                "is_handwritten": prescription_data.get("classification") == "handwritten" or prescription_data.get("is_handwritten") is True,
                "image_url": prescription_data.get("image_url") or prescription_data.get("structured_data", {}).get("attached_image"),
                "cloudinary_url": prescription_data.get("cloudinary_url") or prescription_data.get("structured_data", {}).get("cloudinary_url"),
                "structured_data": prescription_data.get("structured_data", {}),
            }

        return summary

    # ─────────────────────────────────────────────────────────────────────
    # 5.  EXTRACT SYMPTOMS FROM FREE-TEXT ANSWER (Sarvam AI LLM)
    # ─────────────────────────────────────────────────────────────────────

    async def extract_symptom_summary(self, answers_en: List[str]) -> str:
        """
        Combines the patient's Phase-1 free-text answers (translated to English)
        and extracts a clean, clinical symptom list using Sarvam AI LLM for Pinecone retrieval.
        """
        combined = " ".join(a for a in answers_en if a).strip()
        if not combined:
            return ""

        system_prompt = SYMPTOM_EXTRACTION_SYSTEM
        user_prompt = build_symptom_extraction_prompt(combined)

        try:
            raw = await self._call_sarvam_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=150
            )
            symptom_list = raw.strip()
            print(f"[RagTriageService] Sarvam AI extracted symptoms: {symptom_list}")
            return symptom_list
        except Exception as e:
            print(f"[RagTriageService] Error extracting symptoms with Sarvam AI: {e}")
            return combined


# Global singleton instance
rag_triage = RagTriageService()
