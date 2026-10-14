"""Abstract interface for Speech-to-Text (STT) providers."""
from abc import ABC, abstractmethod

from pydantic import BaseModel


class Transcript(BaseModel):
    text: str
    confidence: float = 0.0
    provider: str = "unknown"
    model: str | None = None
    latency_ms: float = 0.0
    language: str = "am"
    detected_language: str | None = None
    fallback_used: bool = False
    error: str | None = None
    processing_duration_sec: float | None = None


class BaseSTTProvider(ABC):
    @abstractmethod
    async def transcribe(self, wav_path_or_bytes: str | bytes, language: str = "am") -> Transcript:
        """Transcribe speech audio into text.

        Args:
            wav_path_or_bytes: Filepath or raw WAV/PCM audio bytes.
            language: Target ISO language code ('am' or 'om').

        Returns:
            Transcript containing text, confidence score, provider name, and latency.
        """
