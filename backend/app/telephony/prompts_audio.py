"""Pre-rendered prompt audio loader for Asterisk telephony.

Loads and caches pre-rendered 8 kHz 16-bit mono linear PCM prompt audio
from backend/cache/prompts/ for zero-latency telephony playback.
"""
from pathlib import Path

import soundfile as sf

PROMPT_CACHE: dict[str, bytes] = {}
PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "cache" / "prompts"


def get_prompt_pcm(name: str, language: str = "am") -> bytes:
    """Retrieve raw 8 kHz 16-bit mono linear PCM audio bytes for a prompt.

    Args:
        name: Prompt name key (e.g. 'greeting', 'consent', 'one_moment', 'safe_fallback', 'goodbye', 'error')
        language: 'am' or 'om'

    Returns:
        Raw 8 kHz 16-bit signed linear mono PCM bytes ready for AudioSocket streaming.
    """
    key = f"{name}_{language}"
    if key in PROMPT_CACHE:
        return PROMPT_CACHE[key]

    # Target filename: e.g. greeting_am.wav
    filename = f"{name}_{language}.wav"
    filepath = PROMPTS_DIR / filename

    if not filepath.exists():
        # Fallback to Amharic version of the specific prompt
        filepath = PROMPTS_DIR / f"{name}_am.wav"
        if not filepath.exists():
            # Fallback to root prompt file without language
            filepath = PROMPTS_DIR / f"{name}.wav"
            if not filepath.exists():
                # Only use greeting_bilingual if the requested prompt was actually a greeting
                if name.startswith("greeting"):
                    filepath = PROMPTS_DIR / "greeting_bilingual.wav"
                else:
                    filepath = None

    if filepath and filepath.exists():
        try:
            data, sr = sf.read(str(filepath), dtype="int16")
            pcm_bytes = data.tobytes()
            PROMPT_CACHE[key] = pcm_bytes
            return pcm_bytes
        except Exception:
            return b""

    return b""
