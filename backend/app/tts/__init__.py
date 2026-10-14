"""TTS provider factory."""
try:
    from app.config import settings
    from app.tts.base import BaseTTSProvider
    from app.tts.edge_tts_provider import EdgeTTSProvider
    from app.tts.fallback_synth import FallbackSynthProvider
    from app.tts.gemini_tts_provider import GeminiTTSProvider
except ImportError:
    from backend.app.config import settings
    from backend.app.tts.base import BaseTTSProvider
    from backend.app.tts.edge_tts_provider import EdgeTTSProvider
    from backend.app.tts.fallback_synth import FallbackSynthProvider
    from backend.app.tts.gemini_tts_provider import GeminiTTSProvider


def get_tts_provider(provider_type: str | None = None) -> BaseTTSProvider:
    """Return configured TTS provider with automatic fallback (Gemini-first)."""
    ptype = (provider_type or getattr(settings, "TTS_PROVIDER", "gemini")).lower()
    if ptype == "fallback":
        return FallbackSynthProvider()
    elif ptype == "gemini":
        try:
            return GeminiTTSProvider()
        except Exception:
            return EdgeTTSProvider()
    elif ptype == "edge_tts":
        try:
            return EdgeTTSProvider()
        except Exception:
            return FallbackSynthProvider()

    # Default to Gemini if configured, otherwise EdgeTTS
    if getattr(settings, "GEMINI_API_KEY", None):
        return GeminiTTSProvider()
    return EdgeTTSProvider()

