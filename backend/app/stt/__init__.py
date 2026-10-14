from app.config import settings
from app.stt.base import BaseSTTProvider
from app.stt.cascade_stt import CascadingSTTProvider
from app.stt.gemini_stt import GeminiSTTProvider
from app.stt.groq_stt import GroqSTTProvider
from app.stt.hf_stt import HuggingFaceSTTProvider
from app.stt.router_stt import MultilingualSTTRouter
from app.stt.whisper_local import WhisperLocalSTTProvider


def get_stt_provider(provider_type: str | None = None) -> BaseSTTProvider:
    ptype = (provider_type or getattr(settings, "STT_PROVIDER", "multilingual")).lower()
    if ptype in ("router", "multilingual", "multi", "hf", "huggingface", "hohe"):
        return MultilingualSTTRouter()
    elif ptype == "groq":
        return GroqSTTProvider()
    elif ptype == "gemini":
        return GeminiSTTProvider()
    elif ptype == "whisper_local":
        return WhisperLocalSTTProvider()
    return MultilingualSTTRouter()

