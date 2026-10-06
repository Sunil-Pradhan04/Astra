import httpx
import json
import base64
from typing import Dict, Any, Optional, List
from app.core.config import settings
from app.core.prompts import (
    TRANSLATION_TO_ENGLISH_SYSTEM,
    build_translate_to_english_prompt,
    TRANSLATION_TO_INDIC_SYSTEM,
    build_translate_to_indic_prompt,
    PRIMARY_QUESTION_1_SYSTEM,
    PRIMARY_QUESTION_2_SYSTEM,
    build_primary_question_prompt,
    DECIDE_NEXT_STEP_SYSTEM,
    build_decide_next_step_prompt,
)

SARVAM_BASE_URL = "https://api.sarvam.ai"

LANGUAGE_MAP = {
    "hindi": {"code": "hi-IN", "name": "Hindi", "speaker": "priya"},
    "tamil": {"code": "ta-IN", "name": "Tamil", "speaker": "priya"},
    "telugu": {"code": "te-IN", "name": "Telugu", "speaker": "priya"},
    "bengali": {"code": "bn-IN", "name": "Bengali", "speaker": "priya"},
    "malayalam": {"code": "ml-IN", "name": "Malayalam", "speaker": "priya"},
    "marathi": {"code": "mr-IN", "name": "Marathi", "speaker": "priya"},
    "gujarati": {"code": "gu-IN", "name": "Gujarati", "speaker": "priya"},
    "kannada": {"code": "kn-IN", "name": "Kannada", "speaker": "priya"},
    "punjabi": {"code": "pa-IN", "name": "Punjabi", "speaker": "priya"},
    "odia": {"code": "od-IN", "name": "Odia", "speaker": "priya"},
    "english": {"code": "en-IN", "name": "English", "speaker": "priya"},
}

def get_lang_meta(lang_key: str) -> dict:
    key = (lang_key or "english").strip().lower()
    return LANGUAGE_MAP.get(key, LANGUAGE_MAP.get("hindi", LANGUAGE_MAP["english"]))


class SarvamAIService:
    def __init__(self):
        self.api_key = settings.SARVAM_AI_API_KEY

    def _headers(self, is_json: bool = True) -> dict:
        h = {"api-subscription-key": self.api_key}
        if is_json:
            h["Content-Type"] = "application/json"
        return h

    async def generate_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 1500,
    ) -> str:
        """
        Generic completion helper for Sarvam AI LLM (sarvam-105b-conversations).
        """
        async with httpx.AsyncClient(timeout=45) as client:
            res = await client.post(
                f"{SARVAM_BASE_URL}/v1/chat/completions",
                headers=self._headers(),
                json={
                    "model": "sarvam-105b-conversations",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            if res.status_code == 200:
                return res.json()["choices"][0]["message"]["content"].strip()
            else:
                raise RuntimeError(f"Sarvam LLM Error {res.status_code}: {res.text}")

    async def translate(self, text: str, source_lang: str, target_lang: str = "en-IN") -> str:
        """
        Translates text between Indic languages and English using Sarvam AI LLM (sarvam-105b-conversations).
        Uses centralized prompts from app.core.prompts.
        Dedicated translation model endpoint is removed; all translations are handled by LLM.
        """
        if not text or not text.strip():
            return ""

        src_raw = (source_lang or "en-IN").strip().lower()
        tgt_raw = (target_lang or "en-IN").strip().lower()

        lang_lookup = {
            "hindi": ("hi-IN", "Hindi"), "hi": ("hi-IN", "Hindi"), "hi-in": ("hi-IN", "Hindi"),
            "tamil": ("ta-IN", "Tamil"), "ta": ("ta-IN", "Tamil"), "ta-in": ("ta-IN", "Tamil"),
            "telugu": ("te-IN", "Telugu"), "te": ("te-IN", "Telugu"), "te-in": ("te-IN", "Telugu"),
            "bengali": ("bn-IN", "Bengali"), "bn": ("bn-IN", "Bengali"), "bn-in": ("bn-IN", "Bengali"),
            "malayalam": ("ml-IN", "Malayalam"), "ml": ("ml-IN", "Malayalam"), "ml-in": ("ml-IN", "Malayalam"),
            "marathi": ("mr-IN", "Marathi"), "mr": ("mr-IN", "Marathi"), "mr-in": ("mr-IN", "Marathi"),
            "gujarati": ("gu-IN", "Gujarati"), "gu": ("gu-IN", "Gujarati"), "gu-in": ("gu-IN", "Gujarati"),
            "kannada": ("kn-IN", "Kannada"), "kn": ("kn-IN", "Kannada"), "kn-in": ("kn-IN", "Kannada"),
            "punjabi": ("pa-IN", "Punjabi"), "pa": ("pa-IN", "Punjabi"), "pa-in": ("pa-IN", "Punjabi"),
            "odia": ("od-IN", "Odia"), "od": ("od-IN", "Odia"), "od-in": ("od-IN", "Odia"),
            "english": ("en-IN", "English"), "en": ("en-IN", "English"), "en-in": ("en-IN", "English"),
        }
        src_code, src_name = lang_lookup.get(src_raw, (src_raw, "Indic"))
        tgt_code, tgt_name = lang_lookup.get(tgt_raw, (tgt_raw, "English"))

        # If already target language, no translation needed
        if src_code == tgt_code or src_name == tgt_name:
            return text.strip()

        # Build prompt from centralized prompts repository
        if tgt_code == "en-IN" or tgt_name == "English":
            system_prompt = TRANSLATION_TO_ENGLISH_SYSTEM
            user_prompt = build_translate_to_english_prompt(text, source_lang=src_name)
        else:
            system_prompt = TRANSLATION_TO_INDIC_SYSTEM
            user_prompt = build_translate_to_indic_prompt(text, target_lang_name=tgt_name)

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                res = await client.post(
                    f"{SARVAM_BASE_URL}/v1/chat/completions",
                    headers=self._headers(),
                    json={
                        "model": "sarvam-105b-conversations",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 250
                    }
                )
                if res.status_code == 200:
                    translated = res.json()["choices"][0]["message"]["content"].strip()
                    if (translated.startswith('"') and translated.endswith('"')) or (translated.startswith("'") and translated.endswith("'")):
                        translated = translated[1:-1].strip()
                    if translated:
                        return translated
                else:
                    print(f"[SarvamService] LLM Translate Error {res.status_code}: {res.text}")
            except Exception as e:
                print(f"[SarvamService] LLM Translate Exception: {e}")

        # Fallback to returning original text if LLM call fails
        return text.strip()

    async def generate_primary_question(self, question_number: int, lang_key: str) -> Dict[str, str]:
        """
        Dynamically generates the primary 2 starting questions using Sarvam LLM:
        - Stored in ENGLISH for clinical memory ledger.
        - Spoken/displayed in patient's preferred language (Hindi, English, Odia).
        """
        meta = get_lang_meta(lang_key)
        lang_name = meta["name"]
        lang_code = meta["code"]

        if question_number == 1:
            intent = "Explain about your symptoms clearly and deeply"
            q_en = "Please explain about your symptoms clearly and deeply."
            system_content = PRIMARY_QUESTION_1_SYSTEM
        else:
            intent = "Did you miss something? Please give more details of what you are feeling and explain your problem"
            q_en = "Did you miss something? Please give more details of what you are feeling and explain your problem."
            system_content = PRIMARY_QUESTION_2_SYSTEM

        prompt_instruction = build_primary_question_prompt(question_number, lang_name, q_en)

        localized_text = None
        if lang_code == "en-IN":
            localized_text = q_en
        else:
            async with httpx.AsyncClient(timeout=30) as client:
                try:
                    res = await client.post(
                        f"{SARVAM_BASE_URL}/v1/chat/completions",
                        headers=self._headers(),
                        json={
                            "model": "sarvam-105b-conversations",
                            "messages": [
                                {"role": "system", "content": system_content},
                                {"role": "user", "content": prompt_instruction}
                            ],
                            "temperature": 0.2,
                            "max_tokens": 150
                        }
                    )
                    if res.status_code == 200:
                        text = res.json()["choices"][0]["message"]["content"].strip()
                        if text.startswith('"') and text.endswith('"'):
                            text = text[1:-1].strip()
                        localized_text = text
                except Exception as e:
                    print(f"[SarvamService] Error generating primary Q{question_number}: {e}")

        # High-quality fallback phrases if network glitch occurs
        fallbacks = {
            1: {
                "hi-IN": "कृपया अपने लक्षणों के बारे में विस्तार और स्पष्ट रूप से बताएं।",
                "ta-IN": "உங்கள் அறிகுறிகளைப் பற்றி விரிவாகவும் தெளிவாகவும் விளக்குங்கள்.",
                "te-IN": "దయచేసి మీ లక్షణాల గురించి స్పష్టంగా మరియు వివరంగా తెలియజేయండి.",
                "bn-IN": "দয়া করে আপনার লক্ষণগুলি স্পষ্টভাবে এবং বিস্তারিতভাবে বলুন।",
                "ml-IN": "ദയവായി നിങ്ങളുടെ ലക്ഷണങ്ങളെക്കുറിച്ച് വ്യക്തമായും വിശദമായും പറയുക.",
                "mr-IN": "कृपया आपल्या लक्षणांबद्दल स्पष्टपणे आणि सविस्तरपणे सांगा.",
                "gu-IN": "કૃપા કરીને તમારા લક્ષણો વિશે વિગતવાર અને સ્પષ્ટપણે જણાવો.",
                "kn-IN": "ದಯವಿಟ್ಟು ನಿಮ್ಮ ರೋಗಲಕ್ಷಣಗಳ ಬಗ್ಗೆ ಸ್ಪಷ್ಟವಾಗಿ ಮತ್ತು ವಿವರವಾಗಿ ತಿಳಿಸಿ.",
                "pa-IN": "ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਲੱਛਣਾਂ ਬਾਰੇ ਵਿਸਤਾਰ ਨਾਲ ਅਤੇ ਸਪਸ਼ਟ ਤੌਰ ਤੇ ਦੱਸੋ।",
                "od-IN": "ଦୟାକରି ଆପଣଙ୍କ ଲକ୍ଷଣ ବିଷୟରେ ବିସ୍ତୃତ ଏବଂ ସ୍ପଷ୍ଟ ଭାବରେ କୁହନ୍ତୁ।",
                "en-IN": "Please explain about your symptoms clearly and deeply.",
            },
            2: {
                "hi-IN": "क्या कुछ छूट गया? कृपया थोड़ा और बताएं कि आप कैसा महसूस कर रहे हैं और क्या समस्या है?",
                "ta-IN": "ஏதேனும் விடுபட்டுள்ளதா? நீங்கள் எவ்வாறு உணர்கிறீர்கள் என்பதை மேலும் விரிவாகக் கூறுங்கள்.",
                "te-IN": "ఏదైనా మిస్ అయ్యిందా? మీరు ఎలా భావిస్తున్నారో మరింత వివరంగా చెప్పండి.",
                "bn-IN": "কিছু কি বাদ পড়েছে? আপনি কেমন অনুভব করছেন তা আরও বিস্তারিতভাবে বলুন।",
                "ml-IN": "എന്തെങ്കിലും വിട്ടുപോയോ? നിങ്ങളുടെ അസ്വസ്ഥതകളെക്കുറിച്ച് കൂടുതൽ വിശദീകരിക്കുക.",
                "mr-IN": "काही राहून गेले आहे का? आपण काय अनुभवत आहात ते अधिक सविस्तरपणे सांगा.",
                "gu-IN": "કંઈ છૂટી ગયું છે? તમે કેવું અનુભવી રહ્યા છો તે વિશે વધુ વિગતો આપો.",
                "kn-IN": "ಏನಾದರೂ ತಪ್ಪಿಹೋಗಿದೆಯೇ? ನೀವು ಹೇಗನಿಸುತ್ತಿದ್ದೀರಿ ಎಂಬುದನ್ನು ಹೆಚ್ಚು ವಿವರವಾಗಿ ವಿವರಿಸಿ.",
                "pa-IN": "ਕੀ ਕੁਝ ਰਹਿ ਗਿਆ? ਕਿਰਪਾ ਕਰਕੇ ਹੋਰ ਦੱਸੋ ਕਿ ਤੁਸੀਂ ਕਿਵੇਂ ਮਹਿਸੂਸ ਕਰ ਰਹੇ ਹੋ।",
                "od-IN": "କିଛି ଛାଡି ଦେଇଛନ୍ତି କି? ଦୟାକରି ଆପଣ କିପରି ଅନୁଭବ କରୁଛନ୍ତି ଏବଂ ଆପଣଙ୍କର ସମସ୍ୟା ବିଷୟରେ ଅଧିକ ବିବରଣୀ ଦିଅନ୍ତୁ।",
                "en-IN": "Did you miss something? Please give more details of what you are feeling and explain your problem.",
            }
        }

        if not localized_text:
            localized_text = fallbacks.get(question_number, {}).get(lang_code, q_en)

        return {
            "question_text_en": q_en,
            "question_text": localized_text,
            "intent": intent,
            "lang_code": lang_code,
        }

    async def decide_next_step(self, memory: dict) -> Dict[str, Any]:
        """
        Receives the entire conversation memory in ENGLISH:
        - All questions asked and patient answers translated into English.
        - Currently planned (not_asked) questions.

        CRITICAL REQUIREMENT:
        The LLM will NEVER ask about symptoms, duration, or details already mentioned or ruled out by the patient.
        It generates:
        - next_question_en: Question in English (stored in memory)
        - next_question: Question translated to patient's preferred language (spoken/displayed)
        - question_intent: Concise clinical intent
        - planned_questions: Upcoming questions with flag='not_asked'
        - all_data_collected: boolean
        - ai_summary: structured summary when triage is complete
        """
        lang_code = memory.get("language", "en-IN")
        lang_name = memory.get("language_name", "English")
        questions_history = memory.get("questions", [])

        # Build clean ENGLISH dialogue history for clinical reasoning
        english_turns_history = []
        for q in questions_history:
            if q.get("flag") == "asked":
                english_turns_history.append({
                    "turn": q.get("id"),
                    "intent": q.get("intent"),
                    "question_asked_en": q.get("question_text_en") or q.get("question_text"),
                    "patient_disclosed_answer_en": q.get("patient_answer_en") or q.get("patient_answer", "(Awaiting response)")
                })

        not_asked_summary = [
            {"id": q.get("id"), "intent": q.get("intent"), "flag": "not_asked"}
            for q in questions_history if q.get("flag") == "not_asked"
        ]

        turns_count = len(english_turns_history)

        system_prompt = DECIDE_NEXT_STEP_SYSTEM
        user_content = build_decide_next_step_prompt(
            lang_name=lang_name,
            lang_code=lang_code,
            turns_count=turns_count,
            english_turns_history=english_turns_history,
            not_asked_summary=not_asked_summary,
        )

        async with httpx.AsyncClient(timeout=45) as client:
            try:
                res = await client.post(
                    f"{SARVAM_BASE_URL}/v1/chat/completions",
                    headers=self._headers(),
                    json={
                        "model": "sarvam-105b-conversations",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_content}
                        ],
                        "temperature": 0.2,
                        "max_tokens": 600
                    }
                )
                if res.status_code == 200:
                    raw = res.json()["choices"][0]["message"]["content"].strip()
                    if raw.startswith("```"):
                        raw = raw.split("```")[1]
                        if raw.startswith("json"):
                            raw = raw[4:]
                    parsed = json.loads(raw.strip())
                    return parsed
                else:
                    print(f"[SarvamService] decide_next_step API Error: {res.status_code} - {res.text}")
            except Exception as e:
                print(f"[SarvamService] Error in decide_next_step: {e}")

        # Fallback if parsing or network glitch occurs
        return {
            "all_data_collected": False,
            "next_question_en": "Have you noticed any other body pain, breathing difficulty, or taken any medications?",
            "next_question": "क्या आपने शरीर में कोई अन्य दर्द, सांस लेने में तकलीफ महसूस की है, या कोई दवा ली है?" if "hi" in lang_code else (
                "ଆପଣ କୌଣସି ଶରୀର ଯନ୍ତ୍ରଣା, ଶ୍ୱାସକ୍ରିୟାରେ କଷ୍ଟ ଅନୁଭବ କରିଛନ୍ତି କିମ୍ବା କୌଣସି ଔଷଧ ନେଇଛନ୍ତି କି?" if "od" in lang_code else
                "Have you noticed any other body pain, breathing difficulty, or taken any medications?"
            ),
            "question_intent": "Inquire about associated discomfort and prior medications",
            "planned_questions": [
                {"intent": "Screen for chronic medical history or allergies", "flag": "not_asked"}
            ],
            "ai_summary": None,
        }

    async def text_to_speech(self, text: str, lang_code: str, speaker: str = "priya") -> Optional[str]:
        """
        Synthesizes text into natural speech using Sarvam bulbul:v3.
        Returns base64 WAV audio string.
        """
        if not text or not text.strip():
            return None

        # Clean text of markdown, asterisks, brackets before speaking
        clean_text = text.replace("*", "").replace("#", "").replace("[", "").replace("]", "").strip()

        async with httpx.AsyncClient(timeout=30) as client:
            try:
                res = await client.post(
                    f"{SARVAM_BASE_URL}/text-to-speech",
                    headers=self._headers(),
                    json={
                        "inputs": [clean_text],
                        "target_language_code": lang_code,
                        "speaker": speaker,
                        "model": "bulbul:v3"
                    }
                )
                if res.status_code == 200:
                    audios = res.json().get("audios", [])
                    if audios:
                        return audios[0]
                else:
                    print(f"[SarvamService] TTS Error: {res.status_code} - {res.text}")
            except Exception as e:
                print(f"[SarvamService] TTS Exception: {e}")
        return None

    async def speech_to_text(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
        lang_code: str = None
    ) -> Optional[str]:
        """
        Transcribes patient spoken audio using Sarvam saaras:v3.
        Includes automatic fallback to auto-detection ('unknown') if language-specific decoding is empty.
        """
        if not audio_bytes or len(audio_bytes) < 500:
            print("[SarvamService] STT: audio_bytes too short or empty.")
            return None

        headers = {"api-subscription-key": self.api_key}
        
        # Sanitize MIME type: strip parameter tokens (e.g. ';codecs=opus', ';charset=...')
        # Map to Sarvam's strictly whitelisted MIME types:
        # ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/opus', 'audio/mp4', 'audio/webm']
        raw_mime = (content_type or "audio/webm").split(";")[0].strip().lower()
        fn = (filename or "audio.webm").lower()

        if "wav" in raw_mime or fn.endswith(".wav"):
            mime = "audio/wav"
            safe_filename = "patient_voice.wav"
        elif "ogg" in raw_mime or fn.endswith(".ogg"):
            mime = "audio/ogg"
            safe_filename = "patient_voice.ogg"
        elif "opus" in raw_mime or fn.endswith(".opus"):
            mime = "audio/opus"
            safe_filename = "patient_voice.opus"
        elif "mp4" in raw_mime or "m4a" in raw_mime or fn.endswith(".mp4") or fn.endswith(".m4a"):
            mime = "audio/mp4"
            safe_filename = "patient_voice.mp4"
        elif "mp3" in raw_mime or "mpeg" in raw_mime or fn.endswith(".mp3"):
            mime = "audio/mpeg"
            safe_filename = "patient_voice.mp3"
        elif "webm" in raw_mime or fn.endswith(".webm"):
            mime = "audio/webm"
            safe_filename = "patient_voice.webm"
        else:
            mime = "audio/webm"
            safe_filename = "patient_voice.webm"

        files = {"file": (safe_filename, audio_bytes, mime)}

        # Attempt 1: With requested language_code
        async with httpx.AsyncClient(timeout=45) as client:
            try:
                data = {"model": "saaras:v3", "mode": "transcribe"}
                if lang_code and lang_code != "unknown":
                    data["language_code"] = lang_code

                res = await client.post(
                    f"{SARVAM_BASE_URL}/speech-to-text",
                    headers=headers,
                    files=files,
                    data=data
                )
                if res.status_code == 200:
                    transcript = res.json().get("transcript", "").strip()
                    if transcript:
                        return transcript

                print(f"[SarvamService] STT attempt 1 returned status {res.status_code}: {res.text}")
            except Exception as e:
                print(f"[SarvamService] STT attempt 1 exception: {e}")

            # Attempt 2: Auto-detect language with language_code='unknown'
            try:
                print("[SarvamService] Retrying STT with language_code='unknown' (auto-detection)...")
                res2 = await client.post(
                    f"{SARVAM_BASE_URL}/speech-to-text",
                    headers=headers,
                    files={"file": (safe_filename, audio_bytes, mime)},
                    data={"model": "saaras:v3", "mode": "transcribe", "language_code": "unknown"}
                )
                if res2.status_code == 200:
                    transcript2 = res2.json().get("transcript", "").strip()
                    if transcript2:
                        return transcript2
                print(f"[SarvamService] STT attempt 2 returned status {res2.status_code}: {res2.text}")
            except Exception as e:
                print(f"[SarvamService] STT attempt 2 exception: {e}")

        return None


sarvam_ai = SarvamAIService()
