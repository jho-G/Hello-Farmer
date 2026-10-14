"""Google Gemini LLM provider for Hello Farmer.

Primary LLM engine using Google Gemini API (gemini-3.5-flash / gemini-3.8-flash)
with JSON structured schema output, location-aware hybrid agricultural reasoning,
15-second timeout, and schema repair retry.
"""
import asyncio
import json
import logging
import re
from typing import Any

try:
    from app.config import settings
    from app.llm.base import BaseLLMProvider, LLMAnswer
    from app.llm.prompts import (
        REPAIR_PROMPT,
        build_system_prompt,
        format_user_prompt,
    )
except ImportError:
    from backend.app.config import settings
    from backend.app.llm.base import BaseLLMProvider, LLMAnswer
    from backend.app.llm.prompts import (
        REPAIR_PROMPT,
        build_system_prompt,
        format_user_prompt,
    )

logger = logging.getLogger("hello_farmer.llm.gemini")


class GeminiLLMProvider(BaseLLMProvider):
    """Google Gemini LLM provider generating structured agronomic answers."""

    def __init__(self, api_key: str | None = None, model_name: str | None = None):
        self.api_key = api_key or getattr(settings, "GEMINI_API_KEY", None)
        raw_m = model_name or getattr(settings, "GEMINI_LLM_MODEL", None) or getattr(settings, "LLM_MODEL", "gemini-3.5-flash")

        # Automatically map deprecated or unavailable model IDs to verified available Gemini models
        if "gemini-2.5-flash" in raw_m or "gemini-flash-latest" in raw_m:
            raw_m = "gemini-3.5-flash"

        self.model_name = raw_m
        self._genai_client = None
        self._legacy_model = None
        self._initialized = False

    def _init_client(self):
        """Initialize Google GenAI client (prefer modern google-genai, fallback to legacy)."""
        if self._initialized:
            return

        if not self.api_key or self.api_key == "your_gemini_api_key_here":
            logger.warning("GEMINI_API_KEY not configured. Gemini provider will not execute live queries.")
            return

        # 1. Try modern google-genai SDK
        try:
            from google import genai
            self._genai_client = genai.Client(api_key=self.api_key)
            self._initialized = True
            logger.info("Initialized modern google-genai for LLM (%s)", self.model_name)
            return
        except ImportError:
            logger.debug("google-genai not installed, attempting legacy SDK fallback.")
        except Exception as e:
            logger.warning("Failed to initialize google-genai client for LLM: %s", e)

        # 2. Try legacy google.generativeai SDK
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self._legacy_model = genai.GenerativeModel(
                model_name=self.model_name,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.2,
                },
            )
            self._initialized = True
            logger.info("Initialized legacy google.generativeai for LLM (%s)", self.model_name)
        except Exception as e:
            logger.error("Failed to initialize Gemini LLM client: %s", e)

    async def generate_response(
        self,
        transcript: str,
        retrieved_passages: list[dict[str, Any]],
        conversation_history: list[dict[str, str]],
        farmer_context: dict[str, Any],
        weather_info: dict[str, Any] | None = None,
        language: str = "am",
    ) -> LLMAnswer:
        """Call Gemini Flash with system prompt, passages, and bounded timeout."""
        self._init_client()
        if not self._genai_client and not self._legacy_model:
            raise RuntimeError("Gemini client is not initialized or API key is missing.")

        lang_code = "om" if language in ("om", "oromo") else "am"
        system_instruction = build_system_prompt(lang_code)
        user_prompt = format_user_prompt(
            transcript=transcript,
            retrieved_passages=retrieved_passages,
            conversation_history=conversation_history,
            farmer_context=farmer_context,
            weather_info=weather_info,
            language=lang_code,
        )

        full_prompt = f"{system_instruction}\n\n{user_prompt}"
        timeout_sec = getattr(settings, "GEMINI_TIMEOUT_SECONDS", 15.0)

        # Attempt 1
        try:
            raw_text = await asyncio.wait_for(
                self._async_generate(full_prompt, system_instruction),
                timeout=timeout_sec,
            )
            return self._parse_json_response(raw_text, language=lang_code, retrieved_passages=retrieved_passages)
        except (asyncio.TimeoutError, json.JSONDecodeError, ValueError) as err:
            logger.warning("Gemini attempt 1 failed (%s), retrying with schema repair prompt...", err)

        # Attempt 2 (Repair prompt)
        repair_full = f"{full_prompt}\n\n{REPAIR_PROMPT}"
        raw_text_retry = await asyncio.wait_for(
            self._async_generate(repair_full, system_instruction),
            timeout=timeout_sec,
        )

        return self._parse_json_response(raw_text_retry, language=lang_code, retrieved_passages=retrieved_passages)

    async def _async_generate(self, prompt: str, system_instruction: str) -> str:
        """Run Gemini generation in asyncio thread executor."""
        loop = asyncio.get_running_loop()

        if self._genai_client:
            from google.genai import types

            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
                system_instruction=system_instruction,
            )

            # Try candidate models with graceful fallback if model experiences high demand (503)
            candidate_models = [self.model_name, "gemini-3.5-flash-lite", "gemini-3.8-flash"]

            def _call_client():
                last_exc = None
                for m in candidate_models:
                    try:
                        resp = self._genai_client.models.generate_content(
                            model=m,
                            contents=prompt,
                            config=config,
                        )
                        return resp.text
                    except Exception as exc:
                        last_exc = exc
                        if "503" in str(exc) or "404" in str(exc):
                            logger.info("Model '%s' returned %s, trying alternative '%s'", m, exc, candidate_models[-1])
                            continue
                        raise exc
                if last_exc:
                    raise last_exc
                raise RuntimeError("No candidate model succeeded")

            return await loop.run_in_executor(None, _call_client)

        elif self._legacy_model:
            response = await loop.run_in_executor(
                None,
                lambda: self._legacy_model.generate_content(prompt),
            )
            return response.text

        raise RuntimeError("No active Gemini client available.")

    def _parse_json_response(
        self,
        text: str,
        language: str = "am",
        retrieved_passages: list[dict[str, Any]] | None = None,
    ) -> LLMAnswer:
        """Parse and validate JSON response into pydantic LLMAnswer."""
        clean_text = text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        # Extract json object if wrapped in explanatory text
        if "{" in clean_text and "}" in clean_text:
            start_idx = clean_text.find("{")
            end_idx = clean_text.rfind("}") + 1
            clean_text = clean_text[start_idx:end_idx]

        data = json.loads(clean_text)

        has_passages = bool(retrieved_passages and len(retrieved_passages) > 0)
        default_mode = "rag_grounded" if has_passages else "location_aware_model_answer"
        evidence_mode = data.get("evidence_mode", default_mode)

        sources = data.get("sources", []) or data.get("sources_used", [])
        if not sources and retrieved_passages:
            sources = [
                {"chunk_id": p.get("chunk_id", ""), "title": p.get("title", "Resource"), "source_tier": p.get("source_tier", "tier_1")}
                for p in retrieved_passages[:3]
            ]

        confidence_val = data.get("confidence", 0.95)
        try:
            conf_float = float(confidence_val)
        except (ValueError, TypeError):
            conf_float = 0.95

        return LLMAnswer(
            answer=data.get("answer", "").strip(),
            answer_en_gloss=data.get("answer_en_gloss", "").strip(),
            language=data.get("language", language),
            grounded=bool(data.get("grounded", True)),
            evidence_mode=evidence_mode,
            sources=sources,
            sources_used=sources,
            location_used=data.get("location_used"),
            confidence=conf_float,
            follow_up_question=data.get("follow_up_question"),
            safety_note=data.get("safety_note"),
            needs_referral=bool(data.get("needs_referral", False)),
            topic=data.get("topic", "general"),
            provider="gemini",
            model=self.model_name,
        )
