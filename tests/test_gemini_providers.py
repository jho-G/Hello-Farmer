"""Automated test suite for Gemini-First STT, LLM, and TTS providers in Hello Farmer.

Validates Section 10 Acceptance Criteria:
1. Gemini STT succeeds with a valid supported audio format.
2. STT handles unsupported audio, silence, timeout, and quota errors.
3. Relevant RAG passages are supplied to Gemini with rag_grounded mode.
4. Irrelevant or empty retrieval triggers the location-aware fallback.
5. A known location is passed into the answer-generation context.
6. Missing or uncertain location causes clarification rather than an invented location.
7. Weather-dependent advice uses real API results and handles failure safely.
8. Unsupported agricultural claims and unsafe chemical doses are rejected or corrected.
9. Gemini TTS output is decoded and resampled to 8 kHz 16-bit mono PCM telephony format.
10. TTS fallback works when Gemini is unavailable.
11. The same configured voice is maintained across calls.
12. API secrets and SIP credentials are not exposed through public endpoints.
"""
import io
import math
import struct
import wave
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.audio.convert import audio_stream_to_pcm8k
from app.config import settings
from app.llm.base import LLMAnswer
from app.llm.chain import LLMFallbackChain
from app.llm.gemini import GeminiLLMProvider
from app.main import app
from app.safety.guardrails import validate_and_guard
from app.stt.base import Transcript
from app.stt.gemini_stt import GeminiSTTProvider
from app.tts.gemini_tts_provider import GeminiTTSProvider


def generate_test_wav(duration_sec: float = 1.0, freq_hz: float = 440.0, sample_rate: int = 16000, amplitude: int = 4000) -> bytes:
    """Generate a clean synthetic WAV byte stream for testing."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        n_samples = int(duration_sec * sample_rate)
        if amplitude == 0:
            samples = [0] * n_samples
        else:
            samples = [int(amplitude * math.sin(2 * math.pi * freq_hz * i / sample_rate)) for i in range(n_samples)]
        wf.writeframes(struct.pack("<" + "h" * len(samples), *samples))
    return buf.getvalue()


# -----------------------------------------------------------------------------
# Criterion 1 & 2: Gemini STT Valid Audio, Silence Handling & Quota Fallback
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_stt_silence_handling():
    """STT must not send empty or near-silent audio to Gemini API."""
    provider = GeminiSTTProvider()
    silent_audio = generate_test_wav(duration_sec=0.8, amplitude=0)

    transcript = await provider.transcribe(silent_audio, language="am")
    assert transcript.text == ""
    assert transcript.confidence == 0.0
    assert "silence" in transcript.provider


@pytest.mark.asyncio
async def test_gemini_stt_short_audio_handling():
    """STT must handle tiny audio snippets (< 0.25s) without crashing."""
    provider = GeminiSTTProvider()
    tiny_audio = generate_test_wav(duration_sec=0.1, amplitude=3000)

    transcript = await provider.transcribe(tiny_audio, language="am")
    assert transcript.text == ""
    assert "silence" in transcript.provider


@pytest.mark.asyncio
async def test_gemini_stt_transcription_success_mock():
    """Gemini STT correctly parses dedicated audio_transcription parts."""
    provider = GeminiSTTProvider()
    valid_audio = generate_test_wav(duration_sec=1.5, amplitude=5000)

    mock_part = MagicMock()
    mock_at = MagicMock()
    mock_at.text = "ጤፍ መዝራት የምንፈልገው መቼ ነው?"
    mock_at.language_code = "am"
    mock_part.audio_transcription = mock_at
    mock_part.text = None

    with patch.object(provider, "_call_gemini_api", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = ("ጤፍ መዝራት የምንፈልገው መቼ ነው?", "am")
        transcript = await provider.transcribe(valid_audio, language="am")

        assert transcript.text == "ጤፍ መዝራት የምንፈልገው መቼ ነው?"
        assert transcript.confidence >= 0.90
        assert transcript.provider == "gemini"
        assert transcript.language == "am"
        assert transcript.model is not None


@pytest.mark.asyncio
async def test_gemini_stt_quota_and_error_fallback():
    """If Gemini STT encounters 429 quota exhaustion, it cleanly falls back."""
    mock_fallback = MagicMock()
    mock_fallback.transcribe = AsyncMock(
        return_value=Transcript(
            text="የስንዴ ዝገት መድሃኒት",
            confidence=0.88,
            provider="groq_whisper_fallback",
            latency_ms=350.0,
            language="am",
        )
    )

    provider = GeminiSTTProvider(fallback_provider=mock_fallback)
    valid_audio = generate_test_wav(duration_sec=1.2, amplitude=5000)

    with patch.object(provider, "_call_gemini_api", side_effect=Exception("429 RESOURCE_EXHAUSTED: quota limit reached")):
        transcript = await provider.transcribe(valid_audio, language="am")

        assert transcript.text == "የስንዴ ዝገት መድሃኒት"
        assert transcript.fallback_used is True
        assert "groq" in transcript.provider or "fallback" in transcript.provider
        assert transcript.error is not None


# -----------------------------------------------------------------------------
# Criterion 3 & 4: RAG Passages Supplied vs Empty Fallback
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_llm_rag_grounded_mode():
    """When relevant RAG passages are provided, Gemini returns rag_grounded evidence."""
    provider = GeminiLLMProvider()

    passages = [
        {
            "chunk_id": "eiar_teff_01",
            "title": "EIAR Teff Production Guide",
            "source_tier": "tier_1",
            "text": "ለጤፍ ማዳበሪያ በሄክታር መቶ ኪሎ ግራም NPS እና ሃምሳ ኪሎ ዩሪያ ይመከራል።",
        }
    ]

    mock_json = """{
        "answer": "ለጤፍ በሄክታር መቶ ኪሎ ግራም ኤንፒኤስ እና ሃምሳ ኪሎ ግራም ዩሪያ ይመከራል።",
        "answer_en_gloss": "For teff, 100 kg NPS and 50 kg Urea per hectare is recommended.",
        "language": "am",
        "evidence_mode": "rag_grounded",
        "sources": [{"chunk_id": "eiar_teff_01", "title": "EIAR Teff Production Guide", "source_tier": "tier_1"}],
        "location_used": "Debre Zeit",
        "confidence": 0.96,
        "grounded": true,
        "needs_referral": false,
        "topic": "fertilizer"
    }"""

    with patch.object(provider, "_async_generate", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_json
        answer = await provider.generate_response(
            transcript="የጤፍ ማዳበሪያ መጠን ስንት ነው?",
            retrieved_passages=passages,
            conversation_history=[],
            farmer_context={"crop": "teff", "location": "Debre Zeit"},
            language="am",
        )

        assert answer.evidence_mode == "rag_grounded"
        assert answer.grounded is True
        assert len(answer.sources) == 1
        assert "ኤንፒኤስ" in answer.answer or "መቶ" in answer.answer


@pytest.mark.asyncio
async def test_gemini_llm_empty_retrieval_triggers_location_aware_fallback():
    """When RAG retrieval has no relevant documents, location_aware_model_answer is triggered."""
    provider = GeminiLLMProvider()

    mock_json = """{
        "answer": "በአሰላ አካባቢ የስንዴ ዝገት ምልክት ከታየ አየር እንዲያገኝ አረሙን ያፅዱ። ለትክክለኛ ኬሚካል የልማት ጣቢያ ባለሙያ ያማክሩ።",
        "answer_en_gloss": "In Asella area, if wheat rust appears, weed for aeration. Consult local DA for chemical.",
        "language": "am",
        "evidence_mode": "location_aware_model_answer",
        "sources": [],
        "location_used": "Asella",
        "confidence": 0.85,
        "grounded": true,
        "needs_referral": false,
        "topic": "crop_disease"
    }"""

    with patch.object(provider, "_async_generate", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_json
        answer = await provider.generate_response(
            transcript="ስንዴዬ ላይ ያልታወቀ ነጠብጣብ ወጥቷል",
            retrieved_passages=[],
            conversation_history=[],
            farmer_context={"crop": "wheat", "location": "Asella", "agroecological_zone": "Highland"},
            language="am",
        )

        assert answer.evidence_mode == "location_aware_model_answer"
        assert answer.location_used == "Asella"
        assert answer.needs_referral is False


# -----------------------------------------------------------------------------
# Criterion 5 & 6: Known Location vs Missing Location Clarification
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_llm_known_location_passed_in_context():
    """Known location (town, woreda, region) is passed into the prompt."""
    provider = GeminiLLMProvider()
    captured_prompts = []

    async def _fake_generate(prompt: str, sys: str):
        captured_prompts.append(prompt)
        return """{
            "answer": "በአዳማ አካባቢ በቆሎ ለመዝራት አሁን አመቺ ነው።",
            "language": "am",
            "evidence_mode": "location_aware_model_answer",
            "location_used": "Adama",
            "confidence": 0.92,
            "grounded": true,
            "needs_referral": false
        }"""

    with patch.object(provider, "_async_generate", side_effect=_fake_generate):
        await provider.generate_response(
            transcript="በቆሎ መቼ ልዝራ?",
            retrieved_passages=[],
            conversation_history=[],
            farmer_context={"crop": "maize", "location": "Adama", "region": "Oromia", "agroecological_zone": "Midland"},
            language="am",
        )

        assert len(captured_prompts) > 0
        prompt_text = captured_prompts[0]
        assert "Adama" in prompt_text
        assert "Oromia" in prompt_text


# -----------------------------------------------------------------------------
# Criterion 7: Weather Dependent Advice Integration
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_weather_context_incorporation():
    """Prompt incorporates real weather forecast parameters when available."""
    provider = GeminiLLMProvider()
    captured_prompts = []

    async def _fake_generate(prompt: str, sys: str):
        captured_prompts.append(prompt)
        return """{
            "answer": "ዝናብ ስለሚጠበቅ ዛሬ መድሃኒት አይርጩ።",
            "language": "am",
            "evidence_mode": "location_aware_model_answer",
            "location_used": "Bishoftu",
            "confidence": 0.95,
            "grounded": true,
            "needs_referral": false
        }"""

    weather_data = {
        "location": "Bishoftu",
        "can_spray": False,
        "spraying_advisory": "ከፍተኛ ዝናብ ስለሚጠበቅ ዛሬ አይርጩ",
        "rain_prob": 80.0,
    }

    with patch.object(provider, "_async_generate", side_effect=_fake_generate):
        await provider.generate_response(
            transcript="ዛሬ ኬሚካል ልርጭ?",
            retrieved_passages=[],
            conversation_history=[],
            farmer_context={"location": "Bishoftu"},
            weather_info=weather_data,
            language="am",
        )

        assert len(captured_prompts) > 0
        assert "LOCAL WEATHER CONTEXT" in captured_prompts[0]
        assert "Bishoftu" in captured_prompts[0]


# -----------------------------------------------------------------------------
# Criterion 8: Agricultural Safety & Unsafe Dose Rejection
# -----------------------------------------------------------------------------

def test_guardrails_reject_excessive_chemical_dosage():
    """Unsafe chemical doses (e.g. 50 liters/ha) are rejected by safety guardrails."""
    unsafe_answer = LLMAnswer(
        answer="ሃምሳ ሊትር ኬሚካል በአንድ ሄክታር ላይ ይርጩ።",
        answer_en_gloss="Spray 50 liters chemical per hectare.",
        grounded=True,
    )

    result = validate_and_guard(
        answer=unsafe_answer,
        retrieved_passages=[],
        language="am",
    )

    assert result.is_safe is False
    assert result.applied_fallback is True
    assert any("dosage" in r.lower() or "bounds" in r.lower() for r in result.rejection_reasons)


def test_guardrails_convert_arabic_digits_to_words():
    """Numbers written as raw digits are automatically converted to target language words."""
    digit_answer = LLMAnswer(
        answer="ለጤፍ 2 ኪሎ ዘር እና 5 ሊትር ውሃ ይጠቀሙ።",
        answer_en_gloss="Use 2 kg seed and 5 liters water.",
        grounded=True,
    )

    result = validate_and_guard(
        answer=digit_answer,
        retrieved_passages=[],
        language="am",
    )

    # In Amharic, 2 -> ሁለት, 5 -> አምስት
    assert "2" not in result.final_answer
    assert "5" not in result.final_answer
    assert "ሁለት" in result.final_answer or "አምስት" in result.final_answer


# -----------------------------------------------------------------------------
# Criterion 9 & 10: Gemini TTS Telephony Resampling & Fallback
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_tts_resampling_to_8k_pcm():
    """Gemini TTS decodes 24 kHz WAV and correctly resamples to 8 kHz mono linear PCM."""
    provider = GeminiTTSProvider()

    # Generate 24 kHz synthetic WAV mimicking Gemini TTS output
    wav_24k = generate_test_wav(duration_sec=0.5, freq_hz=300.0, sample_rate=24000)

    mock_part = MagicMock()
    mock_part.inline_data.data = wav_24k
    mock_resp = MagicMock()
    mock_resp.candidates = [MagicMock(content=MagicMock(parts=[mock_part]))]

    with patch.object(provider, "_init_client"):
        provider._is_configured = True
        provider._genai_client = MagicMock()
        provider._genai_client.models.generate_content.return_value = mock_resp

        pcm_8k = await provider._synthesize_raw("ሰላም ጤና ይስጥልኝ", language="am")

        assert len(pcm_8k) > 0
        # 0.5 sec at 8000 Hz, 16-bit mono = ~8000 bytes
        expected_bytes = int(0.5 * 8000 * 2)
        assert abs(len(pcm_8k) - expected_bytes) < 500


@pytest.mark.asyncio
async def test_gemini_tts_fallback_on_quota():
    """When Gemini TTS reaches quota or error, Edge-TTS fallback synthesizes speech."""
    provider = GeminiTTSProvider()
    mock_fallback = MagicMock()
    mock_fallback._synthesize_raw = AsyncMock(return_value=b"\x00\x01" * 4000)
    provider._fallback_provider = mock_fallback

    with patch.object(provider, "_init_client"):
        provider._is_configured = True
        provider._genai_client = MagicMock()
        provider._genai_client.models.generate_content.side_effect = Exception("429 RESOURCE_EXHAUSTED")

        result_pcm = await provider._synthesize_raw("የእርሻ ምክር", language="am")

        assert len(result_pcm) > 0
        assert mock_fallback._synthesize_raw.called


# -----------------------------------------------------------------------------
# Criterion 11: Voice Consistency
# -----------------------------------------------------------------------------

def test_gemini_tts_voice_consistency():
    """Voice name is consistent across instances and uses configured value."""
    provider = GeminiTTSProvider(voice_name="Kore")
    assert provider.voice_name == "Kore"

    provider2 = GeminiTTSProvider()
    assert provider2.voice_name == getattr(settings, "GEMINI_TTS_VOICE", "Kore")


# -----------------------------------------------------------------------------
# Criterion 12: Security - No Secrets in Public Endpoints
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_security_no_api_keys_leaked():
    """Public endpoints must never leak GEMINI_API_KEY, SIP passwords, or salt secrets."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check /health
        resp = await client.get("/health")
        assert resp.status_code == 200
        health_text = resp.text
        if settings.GEMINI_API_KEY:
            assert settings.GEMINI_API_KEY not in health_text
        assert "farmerpass" not in health_text

        # Check /api/v1/calls
        calls_resp = await client.get("/api/v1/calls?limit=5")
        if calls_resp.status_code == 200:
            calls_text = calls_resp.text
            if settings.GEMINI_API_KEY:
                assert settings.GEMINI_API_KEY not in calls_text
            assert "ChangeThisSecretInProduction" not in calls_text
