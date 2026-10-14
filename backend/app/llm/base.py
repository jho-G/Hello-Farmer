"""Abstract interface for LLM providers."""
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class LLMAnswer(BaseModel):
    answer: str
    answer_en_gloss: str = ""
    language: str = "am"
    grounded: bool = True
    evidence_mode: str = "rag_grounded"  # rag_grounded | location_aware_model_answer | clarification_needed | expert_referral
    sources: list[dict[str, Any]] = Field(default_factory=list)
    sources_used: list[dict[str, Any]] = Field(default_factory=list)
    location_used: str | None = None
    confidence: float = 0.95
    follow_up_question: str | None = None
    safety_note: str | None = None
    needs_referral: bool = False
    topic: str | None = "general"
    provider: str | None = None
    model: str | None = None


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate_response(
        self,
        transcript: str,
        retrieved_passages: list[dict[str, Any]],
        conversation_history: list[dict[str, str]],
        farmer_context: dict[str, Any],
        weather_info: dict[str, Any] | None = None,
        language: str = "am"
    ) -> LLMAnswer:
        """Generate grounded, safe answer obeying all agricultural system prompt rules."""
