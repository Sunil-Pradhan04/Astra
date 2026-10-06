import io
import os
import base64
import asyncio
import warnings
import logging
from typing import Optional
import soundfile as sf
import numpy as np

# Suppress noisy PyTorch and HuggingFace Hub warnings during model init
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
logging.getLogger("transformers").setLevel(logging.ERROR)
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)

class LocalTTSService:
    """
    Local Text-to-Speech service using hexgrad/Kokoro-82M.
    Free, zero-API-cost, local model execution.
    """
    def __init__(self):
        self._pipelines = {}
        self._lock = asyncio.Lock()

    def _load_pipeline(self, kokoro_code: str):
        if kokoro_code not in self._pipelines:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                from kokoro import KPipeline
                self._pipelines[kokoro_code] = KPipeline(lang_code=kokoro_code, repo_id="hexgrad/Kokoro-82M")
        return self._pipelines[kokoro_code]

    def _synthesize_sync(self, text: str, lang_code: str, speed: float = 1.0) -> Optional[str]:
        # Determine language code for Kokoro
        # 'h' for Hindi, 'a' for American English, 'b' for British English
        # Odia script phonemes fall back to Indic Hindi pipeline or English
        norm = (lang_code or "hi-IN").lower()
        if "en" in norm or norm == "english":
            kokoro_code = "a"
            voice = "af_heart"
        elif "od" in norm or norm == "odia":
            kokoro_code = "h"
            voice = "hf_alpha"
        else:
            kokoro_code = "h"
            voice = "hf_alpha"

        pipeline = self._load_pipeline(kokoro_code)
        clean_text = text.replace("*", "").replace("#", "").replace("[", "").replace("]", "").strip()

        generator = pipeline(clean_text, voice=voice, speed=speed)
        audio_segments = []
        for _, _, audio in generator:
            audio_segments.append(audio)

        if not audio_segments:
            return None

        full_audio = np.concatenate(audio_segments) if len(audio_segments) > 1 else audio_segments[0]
        
        buffer = io.BytesIO()
        sf.write(buffer, full_audio, 24000, format='WAV')
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode('utf-8')

    async def text_to_speech(self, text: str, lang_code: str = "hi-IN", speed: float = 1.0) -> Optional[str]:
        """
        Synthesizes text to base64 WAV audio on a thread to avoid blocking the event loop.
        """
        if not text or not text.strip():
            return None

        try:
            # Run CPU-bound Kokoro inference in a worker thread
            return await asyncio.to_thread(self._synthesize_sync, text, lang_code, speed)
        except Exception as e:
            print(f"[LocalTTS] Inference error: {e}")
            return None


local_tts = LocalTTSService()
