from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.services.sarvam_service import sarvam_ai
from app.services.local_tts_service import local_tts

router = APIRouter(prefix="/translation", tags=["Medical Translation Machine"])

# The 11 official supported languages in Astra Healthcare
SUPPORTED_LANGUAGES = [
    {"code": "en-IN", "name": "English", "native": "English", "script": "Latin", "voice": "English"},
    {"code": "hi-IN", "name": "Hindi", "native": "हिन्दी", "script": "Devanagari", "voice": "Hindi"},
    {"code": "od-IN", "name": "Odia", "native": "ଓଡ଼ିଆ", "script": "Odia", "voice": "Odia"},
    {"code": "bn-IN", "name": "Bengali", "native": "বাংলা", "script": "Bengali", "voice": "Bengali"},
    {"code": "te-IN", "name": "Telugu", "native": "తెలుగు", "script": "Telugu", "voice": "Telugu"},
    {"code": "ta-IN", "name": "Tamil", "native": "தமிழ்", "script": "Tamil", "voice": "Tamil"},
    {"code": "mr-IN", "name": "Marathi", "native": "मराठी", "script": "Devanagari", "voice": "Marathi"},
    {"code": "gu-IN", "name": "Gujarati", "native": "ગુજરાતી", "script": "Gujarati", "voice": "Gujarati"},
    {"code": "kn-IN", "name": "Kannada", "native": "ಕನ್ನಡ", "script": "Kannada", "voice": "Kannada"},
    {"code": "ml-IN", "name": "Malayalam", "native": "മലയാളം", "script": "Malayalam", "voice": "Malayalam"},
    {"code": "pa-IN", "name": "Punjabi", "native": "ਪੰਜਾਬੀ", "script": "Gurmukhi", "voice": "Punjabi"},
]

CLINICAL_PRESETS = [
    {
        "category": "🩺 Triage & Chief Complaints",
        "questions": [
            "Where does it hurt the most? Please point to the area.",
            "How many days or hours have you been experiencing this problem?",
            "Do you have a fever, chills, shivering, or body pain?",
            "Are you experiencing any shortness of breath or chest tightness?",
            "Do you feel dizzy, nauseous, or feel like vomiting?",
            "Is the pain sharp, burning, heavy, or throbbing?",
        ]
    },
    {
        "category": "💊 Medicines, History & Vitals",
        "questions": [
            "Do you have diabetes (sugar), high blood pressure, or thyroid?",
            "Are you currently taking any medicines on a daily basis?",
            "Do you have any known allergies to any medicines or injections?",
            "Have you undergone any surgery or hospitalization before?",
            "Did you take any medicine or painkiller for this today?",
        ]
    },
    {
        "category": "📋 Verification & Nurse Checks",
        "questions": [
            "Please confirm your full name and age.",
            "I will check your blood pressure, pulse, and oxygen level now.",
            "Please take a deep breath in through your mouth and breathe out.",
            "Please sit down comfortably on this chair and rest for two minutes.",
            "Did you bring any old doctor prescriptions or blood test reports?",
        ]
    },
    {
        "category": "👨‍⚕️ Doctor Advice & Instructions",
        "questions": [
            "Take this medicine twice a day, once in morning and once at night after food.",
            "Do not stop taking this medicine without consulting the doctor.",
            "Drink plenty of boiled warm water and eat light, non-spicy food.",
            "Please visit the hospital laboratory for blood and urine tests.",
            "Please come back for a follow-up consultation in 5 days.",
        ]
    }
]

LANG_CODE_MAP = {l["code"].lower(): l["name"] for l in SUPPORTED_LANGUAGES}
LANG_NAME_MAP = {l["name"].lower(): l["code"] for l in SUPPORTED_LANGUAGES}


class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "en-IN"
    target_lang: str = "hi-IN"
    context: Optional[str] = "clinical"


class SpeakRequest(BaseModel):
    text: str
    lang_code: str = "hi-IN"
    speaker: str = "priya"
    engine: Optional[str] = "auto"


@router.get("/languages")
async def get_languages():
    """Returns the 11 supported Indian languages with metadata."""
    return {"languages": SUPPORTED_LANGUAGES}


@router.get("/presets")
async def get_clinical_presets():
    """Returns curated clinical questions and instructions for healthcare communication."""
    return {"presets": CLINICAL_PRESETS}


@router.post("/translate")
async def translate_text(body: TranslateRequest):
    """
    Translates medical text or questions between any of the 11 supported languages.
    """
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    src = body.source_lang.strip()
    tgt = body.target_lang.strip()

    src_name = LANG_CODE_MAP.get(src.lower(), src)
    tgt_name = LANG_CODE_MAP.get(tgt.lower(), tgt)

    try:
        translated = await sarvam_ai.translate(
            text=body.text.strip(),
            source_lang=src,
            target_lang=tgt,
        )
        return {
            "success": True,
            "original_text": body.text.strip(),
            "translated_text": translated,
            "source_lang": src,
            "target_lang": tgt,
            "source_lang_name": src_name,
            "target_lang_name": tgt_name,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@router.post("/speak")
async def speak_text(body: SpeakRequest):
    """
    Generates natural audio speech for translated text.
    Uses Sarvam bulbul:v3 for natural Indic speech with local Kokoro-82M fallback.
    """
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    clean_text = body.text.strip()
    lang_code = body.lang_code or "hi-IN"
    speaker = body.speaker or "priya"
    engine = (body.engine or "auto").lower()

    audio = None
    engine_used = "sarvam"

    # Try Sarvam first for natural Indic pronunciation
    if engine in ("auto", "sarvam"):
        try:
            audio = await sarvam_ai.text_to_speech(clean_text, lang_code=lang_code, speaker=speaker)
            if audio:
                engine_used = "sarvam"
        except Exception as e:
            print(f"[Translation] Sarvam TTS error: {e}")

    # Fallback to local Kokoro if Sarvam failed or if local was explicitly requested
    if not audio:
        try:
            audio = await local_tts.text_to_speech(clean_text, lang_code=lang_code)
            if audio:
                engine_used = "local_kokoro"
        except Exception as e:
            print(f"[Translation] Local TTS error: {e}")

    if not audio:
        return {
            "success": False,
            "audio_base64": None,
            "engine_used": "browser_fallback",
            "message": "TTS audio synthesis unavailable, use browser speech synthesis fallback.",
        }

    return {
        "success": True,
        "audio_base64": audio,
        "engine_used": engine_used,
        "lang_code": lang_code,
    }


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    lang_code: Optional[str] = Form(None),
):
    """
    Converts spoken patient or doctor audio into text using Sarvam saaras:v3.
    """
    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) < 300:
        raise HTTPException(status_code=400, detail="Audio file empty or too short.")

    try:
        transcript = await sarvam_ai.speech_to_text(
            audio_bytes=audio_bytes,
            filename=file.filename or "recording.webm",
            content_type=file.content_type or "audio/webm",
            lang_code=lang_code if (lang_code and lang_code != "unknown") else None,
        )

        return {
            "success": bool(transcript),
            "transcript": transcript or "",
            "lang_code": lang_code,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech transcription failed: {str(e)}")
