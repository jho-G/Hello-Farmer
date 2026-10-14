"""Google Gemini Text-to-Speech (TTS) Provider.

Primary voice generation engine for Hello Farmer telephony and web audio pipelines.
Generates natural conversational speech using Gemini TTS (gemini-3.8-flash-tts) with
consistent speaker identity across greetings, questions, agricultural answers, and closings.

Features:
- Telephony-compliant real audio resampling from 24 kHz WAV down to 8 kHz 16-bit mono PCM
- Configurable prebuilt voices (e.g. 'Kore', 'Puck', 'Fenrir', 'Aoede')
- Multi-lingual support: natural Amharic (አማርኛ) and Afaan Oromo pronunciation
- SHA-256 caching for reusable static phrases
- Automatic bounded fallback to Edge-TTS / Google TTS upon quota exhaustion (429) or transient error
"""
import asyncio
import logging
import time
from typing import Optional

try:
    from app.audio.convert import audio_stream_to_pcm8k
    from app.config import settings
    from app.tts.base import BaseTTSProvider
    from app.tts.normalizer import normalize_text_for_tts
except ImportError:
    from backend.app.audio.convert import audio_stream_to_pcm8k
    from backend.app.config import settings
    from backend.app.tts.base import BaseTTSProvider
    from backend.app.tts.normalizer import normalize_text_for_tts

logger = logging.getLogger("hello_farmer.tts.gemini")


class GeminiTTSProvider(BaseTTSProvider):
    """Gemini TTS provider with telephony PCM resampling and Edge-TTS fallback."""

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
        voice_name: str | None = None,
        cache_dir: str = "backend/cache/tts",
    ):
        super().__init__(cache_dir=cache_dir)
        self.api_key = api_key or getattr(settings, "GEMINI_API_KEY", None)
        self.model_name = model_name or getattr(settings, "GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
        self.voice_name = voice_name or getattr(settings, "GEMINI_TTS_VOICE", "Kore")

        self._genai_client = None
        self._fallback_provider: Optional[BaseTTSProvider] = None
        self._is_configured = False

        self._init_client()

    def _init_client(self):
        """Initialize modern google-genai client for TTS."""
        if not self.api_key or self.api_key == "your_gemini_api_key_here":
            logger.warning("GEMINI_API_KEY not configured for Gemini TTS provider.")
            return

        try:
            from google import genai
            self._genai_client = genai.Client(api_key=self.api_key)
            self._is_configured = True
            logger.info("Initialized Gemini TTS client (model=%s, voice=%s)", self.model_name, self.voice_name)
        except Exception as e:
            logger.error("Failed to initialize google-genai client for TTS: %s", e)

    def _get_fallback_provider(self) -> BaseTTSProvider:
        """Lazy load configured fallback TTS provider (Edge-TTS)."""
        if self._fallback_provider is None:
            try:
                try:
                    from app.tts.edge_tts_provider import EdgeTTSProvider
                except ImportError:
                    from backend.app.tts.edge_tts_provider import EdgeTTSProvider
                self._fallback_provider = EdgeTTSProvider(cache_dir=str(self.cache_dir))
            except Exception as e:
                logger.warning("Could not initialize EdgeTTSProvider fallback: %s", e)
                try:
                    from app.tts.fallback_synth import FallbackSynthProvider
                except ImportError:
                    from backend.app.tts.fallback_synth import FallbackSynthProvider
                self._fallback_provider = FallbackSynthProvider()
        return self._fallback_provider

    async def _synthesize_raw(self, text: str, voice: str | None = None, language: str = "am") -> bytes:
        """Synthesize text via Gemini TTS API and resample to 8 kHz 16-bit mono PCM."""
        if not text or not text.strip():
            return b""

        # Normalize numerals and abbreviations into spoken words
        clean_text = normalize_text_for_tts(text, language=language)
        valid_voices = {"Puck", "Charon", "Kore", "Fenrir", "Aoede"}
        selected_voice = voice if (voice and voice in valid_voices) else self.voice_name

        if not self._is_configured or not self._genai_client:
            logger.warning("Gemini TTS is not configured. Delegating to fallback TTS provider.")
            fallback = self._get_fallback_provider()
            return await fallback._synthesize_raw(clean_text, voice=None, language=language)

        t0 = time.perf_counter()

        try:
            from google.genai import types

            loop = asyncio.get_running_loop()

            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config={
                    "voice_config": {
                        "prebuilt_voice_config": {
                            "voice_name": selected_voice,
                        }
                    }
                },
            )

            def _sync_tts_call():
                return self._genai_client.models.generate_content(
                    model=self.model_name,
                    contents=clean_text,
                    config=config,
                )

            timeout_sec = getattr(settings, "GEMINI_TIMEOUT_SECONDS", 15.0)
            response = await asyncio.wait_for(
                loop.run_in_executor(None, _sync_tts_call),
                timeout=timeout_sec,
            )

            # Extract 24 kHz WAV audio bytes from inline data
            if not response.candidates or not response.candidates[0].content.parts:
                raise ValueError("Gemini TTS returned response without audio parts.")

            audio_part = response.candidates[0].content.parts[0]
            inline_data = getattr(audio_part, "inline_data", None)
            if not inline_data or not inline_data.data:
                raise ValueError("Gemini TTS audio part contains no inline data.")

            raw_audio_bytes = inline_data.data
            gen_latency_ms = (time.perf_counter() - t0) * 1000.0

            # Real telephony resampling: 24 kHz WAV -> 8 kHz 16-bit mono linear PCM
            t_resample = time.perf_counter()
            pcm8k = audio_stream_to_pcm8k(raw_audio_bytes)
            resample_latency_ms = (time.perf_counter() - t_resample) * 1000.0

            total_ms = (time.perf_counter() - t0) * 1000.0
            logger.info(
                "Gemini TTS [%s, voice=%s] generated %d bytes in %.1fms (resample=%.1fms, total=%.1fms)",
                self.model_name,
                selected_voice,
                len(pcm8k),
                gen_latency_ms,
                resample_latency_ms,
                total_ms,
            )
            return pcm8k

        except Exception as err:
            err_str = str(err)
            err_lower = err_str.lower()
            is_quota = "429" in err_str or "quota" in err_lower or "resource_exhausted" in err_lower

            logger.warning(
                "Gemini TTS synthesis failed (%s): %s. Delegating to fallback TTS provider.",
                "QUOTA_EXHAUSTED" if is_quota else "API_ERROR",
                err_str,
            )

            # Delegate to fallback provider (Edge-TTS)
            fallback = self._get_fallback_provider()
            try:
                fallback_pcm = await fallback._synthesize_raw(clean_text, voice=None, language=language)
                logger.info(
                    "Fallback TTS [%s] succeeded: produced %d bytes PCM8k",
                    fallback.__class__.__name__,
                    len(fallback_pcm),
                )
                return fallback_pcm
            except Exception as fb_err:
                logger.error("Fallback TTS provider also failed: %s", fb_err)
                return b""
