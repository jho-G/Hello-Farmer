"""LLM Fallback Chain.

Orchestrates primary LLM call through configured provider and executes graceful failover:
Primary (Gemini) -> Groq -> OpenRouter -> Ollama -> Spoken Safe Fallback.
"""
import logging
from typing import Any

try:
    from app.config import settings
    from app.llm.base import BaseLLMProvider, LLMAnswer
    from app.llm.gemini import GeminiLLMProvider
    from app.llm.groq import GroqLLMProvider
    from app.llm.ollama import OllamaLLMProvider
    from app.llm.openrouter import OpenRouterLLMProvider
except ImportError:
    from backend.app.config import settings
    from backend.app.llm.base import BaseLLMProvider, LLMAnswer
    from backend.app.llm.gemini import GeminiLLMProvider
    from backend.app.llm.groq import GroqLLMProvider
    from backend.app.llm.ollama import OllamaLLMProvider
    from backend.app.llm.openrouter import OpenRouterLLMProvider

logger = logging.getLogger("hello_farmer.llm.chain")

SAFE_FALLBACK_TEXTS = {
    "am": "ይቅርታ፣ ለዚህ ጥያቄ በቂ የተረጋገጠ መረጃ አላገኘሁም። እባክዎ የአካባቢዎን የግብርና ልማት ጣቢያ ባለሙያ ያማክሩ ወይም በስምንት ዜሮ ሁለት ስምንት ይደውሉ።",
    "om": "Dhiifama, gaaffii kanaaf ragaan amansiisaan gahaan hin jiru. Maaloo ogeessa misooma qonnaa naannoo keessanii gaafadhaa yookiin bilbila saddeet-duwwaa-lama-saddeet irratti bilbilaa.",
}


class LLMFallbackChain(BaseLLMProvider):
    """Executes provider chain with automatic fallback to safe referral."""

    def __init__(self):
        self.gemini = GeminiLLMProvider()
        self.groq = GroqLLMProvider()
        self.openrouter = OpenRouterLLMProvider()
        self.ollama = OllamaLLMProvider()

    async def generate_response(
        self,
        transcript: str,
        retrieved_passages: list[dict[str, Any]],
        conversation_history: list[dict[str, str]],
        farmer_context: dict[str, Any],
        weather_info: dict[str, Any] | None = None,
        language: str = "am",
    ) -> LLMAnswer:
        providers = [
            ("gemini", self.gemini),
            ("groq", self.groq),
            ("openrouter", self.openrouter),
            ("ollama", self.ollama),
        ]

        # Prioritize configured provider (Gemini-first)
        primary_name = getattr(settings, "LLM_PROVIDER", "gemini").lower()
        fallback_name = getattr(settings, "LLM_FALLBACK_PROVIDER", "groq").lower()

        # Build prioritized list: primary first, fallback second, remaining next
        ordered_tuples = []
        for name, prov in providers:
            if name == primary_name:
                ordered_tuples.insert(0, (name, prov))
            elif name == fallback_name:
                ordered_tuples.append((name, prov))
            else:
                ordered_tuples.append((name, prov))

        # Ensure primary is always head
        ordered = []
        seen = set()
        for name, prov in [p for p in ordered_tuples if p[0] == primary_name] + ordered_tuples:
            if name not in seen:
                seen.add(name)
                ordered.append((name, prov))

        errors = []
        for name, provider in ordered:
            try:
                answer = await provider.generate_response(
                    transcript=transcript,
                    retrieved_passages=retrieved_passages,
                    conversation_history=conversation_history,
                    farmer_context=farmer_context,
                    weather_info=weather_info,
                    language=language,
                )
                if answer and answer.answer.strip():
                    if name != primary_name:
                        logger.info("⚡ LLM Fallback succeeded with provider: %s", name)
                    return answer
                else:
                    logger.warning("Provider %s returned empty response.", name)
            except Exception as e:
                err_str = f"{name}: {str(e)}"
                errors.append(err_str)
                logger.warning("LLM provider %s failed: %s. Trying next provider...", name, e)

        # All providers exhausted: return safe spoken referral
        logger.error("All LLM providers failed. Errors: %s", "; ".join(errors))
        safe_text = SAFE_FALLBACK_TEXTS.get(language, SAFE_FALLBACK_TEXTS["am"])
        return LLMAnswer(
            answer=safe_text,
            answer_en_gloss="Safe fallback: all providers failed. Please consult local DA or call 8028.",
            grounded=False,
            evidence_mode="expert_referral",
            sources=[],
            sources_used=[],
            location_used=None,
            needs_referral=True,
            topic="general",
            confidence=0.5,
            provider="safe_fallback",
        )
