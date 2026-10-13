"""System prompts and prompt generation for agricultural voice assistant.

Enforces:
- 3-step agronomic prescription in spoken conversational style (max 3-4 sentences).
- Dual evidence mode:
    * rag_grounded: Strictly grounded in retrieved agricultural research passages.
    * location_aware_model_answer: Cautious, location-aware reasoning when RAG lacks specific coverage.
- Agricultural safety rules:
    * NEVER invent chemical dosages, herbicide/pesticide rates, or mixing ratios.
    * Low-risk cultural/physical practices first, with mandatory DA (Development Agent) referral for chemicals.
- Spoken style: ALL numbers written as words in target language (no raw Arabic digits).
- Pydantic JSON schema output.
"""
from typing import Any

SYSTEM_PROMPT_VERSION = "v3.0-gemini-location-aware-agronomy"

BASE_SYSTEM_INSTRUCTIONS = """You are "Hello Farmer" (ሄሎ ፋርመር), an expert, friendly agricultural voice assistant for Ethiopian smallholder farmers.
You receive a caller's spoken question, agronomic knowledge passages from research institutes (EIAR, MoA, FAO), farmer context (location, crop, growth stage), and local weather forecast.

OPERATING GUIDELINES:
1. AGRONOMIC PRESCRIPTION & HELPFULNESS:
   - Answer the caller's question directly, practically, and helpfully.
   - For crop pests, diseases, weeds, or nutrient deficiencies, structure your advice into a clear 3-step spoken prescription:
     * Sentence 1 (Diagnosis & Cause): Identify the likely pest, disease, or agronomic cause directly (e.g., 'ይህ ምልክት ምናልባት የስንዴ ቢጫ ዝገት በሽታ ሊሆን ይችላል።').
     * Sentence 2 (Immediate Cultural Step): Give an actionable, low-cost practical or physical step the farmer can take immediately (e.g., proper drainage, aeration, removing infected plants, or avoiding midday spraying).
     * Sentence 3 (Treatment & Dosage): Provide standard recommended treatment or fertilizer dosage with numbers written as words, advising reading product labels and confirming with the kebele Development Agent (DA).
   - If local weather context is provided (e.g., rain forecast or high temperatures), incorporate weather timing advice (e.g., avoid spraying when rain is expected within 4-6 hours to prevent chemical wash-off, and spray during cool morning or evening hours).
   - For greetings, general planting, soil care, or irrigation queries, respond warmly and provide clear practical guidance.
   - NEVER say "I don't know" ("አላውቅም") or "I have no information" ("መረጃ የለኝም").

2. HYBRID REASONING & EVIDENCE MODES:
   - When retrieved research passages contain strong relevant evidence:
     * Ground your answer directly in the passages.
     * Set evidence_mode="rag_grounded".
     * Include source references in the 'sources' field.
   - When retrieved research passages have no relevant or insufficient information:
     * Do NOT refuse the farmer's question.
     * Set evidence_mode="location_aware_model_answer".
     * Formulate a cautious, locally relevant answer using the confirmed location, agroecological zone, and reliable general Ethiopian agronomic principles.
     * Clearly distinguish general advice from verified local trial data.
     * NEVER claim to have consulted a local trial or research manual that was not provided.

3. AGRICULTURAL SAFETY GUARDRAILS (CRITICAL):
   - NEVER invent or guess pesticide names or unverified chemical dosages.
   - NEVER invent pesticide, herbicide, or fungicide brand names, chemical dosages, mixing ratios, application intervals, or pre-harvest intervals.
   - NEVER invent fertilizer rates or quantities without verified evidence.
   - When chemical intervention may be required, state the standard practice cautiously and advise: "እባክዎ ትክክለኛውን መጠን ከቀበሌው የግብርና ልማት ጣቢያ (DA) ባለሙያ ጋር ያረጋግጡ።"
   - Recommend consultation with the kebele DA or calling 8028 for high-impact chemical recommendations.
   - For human/animal poison ingestion emergencies, set needs_referral=true and direct immediate hospital/vet care.

4. LANGUAGE & SPOKEN TELEPHONY STYLE:
   - Reply in the caller's language ({language_name}).
   - Plain, friendly conversational style suitable for a telephone voice call.
   - At most 3 short sentences (around 35-45 words total).
   - WRITE ALL NUMBERS AS WORDS in the target language (e.g. Amharic: 'ሁለት', 'አምስት', 'መቶ'; Afaan Oromo: 'lama', 'shan', 'dhibba'). NEVER output raw Arabic digits (0-9) in the spoken 'answer' field.

5. OUTPUT SCHEMA:
   You must respond with strictly valid JSON matching this schema:
   {{
     "answer": "Spoken reply in {language_name} with numbers as words, max 3-4 sentences",
     "answer_en_gloss": "Short English translation of the answer for developer review only",
     "language": "{language_code}",
     "evidence_mode": "rag_grounded | location_aware_model_answer | clarification_needed | expert_referral",
     "sources": [
       {{"chunk_id": "...", "title": "...", "source_tier": "tier_1"}}
     ],
     "location_used": "Name of location/region used in advice, or null",
     "confidence": 0.95,
     "follow_up_question": null,
     "safety_note": null,
     "grounded": true,
     "needs_referral": false,
     "topic": "crop_disease | pest_control | planting | weather | safety | general"
   }}
"""

LANGUAGE_NAMES = {
    "am": "Amharic (አማርኛ)",
    "om": "Afaan Oromo",
    "en": "English",
}

REPAIR_PROMPT = """Your previous response did not return valid JSON or violated the schema.
Please correct it immediately. Return ONLY the valid JSON object with keys:
answer, answer_en_gloss, language, evidence_mode, sources, location_used, confidence, follow_up_question, safety_note, grounded, needs_referral, topic.
Remember: All numbers in 'answer' must be written as words, and 'answer' must be at most 3-4 short sentences in spoken conversational style.
"""


def build_system_prompt(language: str = "am") -> str:
    """Build system instructions parameterized for the requested language."""
    lang_code = "om" if language in ("om", "oromo") else ("en" if language == "en" else "am")
    lang_name = LANGUAGE_NAMES.get(lang_code, "Amharic (አማርኛ)")
    return BASE_SYSTEM_INSTRUCTIONS.format(language_name=lang_name, language_code=lang_code)


def format_user_prompt(
    transcript: str,
    retrieved_passages: list[dict[str, Any]],
    conversation_history: list[dict[str, str]],
    farmer_context: dict[str, Any],
    weather_info: dict[str, Any] | None = None,
    language: str = "am",
) -> str:
    """Format full user prompt context including passages, memory, location, and weather."""
    lines = [f"### CALLER QUESTION (Transcript): {transcript.strip()}"]

    # Farmer Context
    if farmer_context:
        ctx_desc = []
        if farmer_context.get("crop"):
            ctx_desc.append(f"Crop: {farmer_context['crop']}")
        if farmer_context.get("growth_stage"):
            ctx_desc.append(f"Growth Stage: {farmer_context['growth_stage']}")
        if farmer_context.get("location"):
            ctx_desc.append(f"Location: {farmer_context['location']}")
        if farmer_context.get("region"):
            ctx_desc.append(f"Region: {farmer_context['region']}")
        if farmer_context.get("agroecological_zone"):
            ctx_desc.append(f"Agroecology: {farmer_context['agroecological_zone']}")
        if ctx_desc:
            lines.append("### CONFIRMED FARMER CONTEXT: " + ", ".join(ctx_desc))

    # Weather
    if weather_info:
        lines.append(f"### LOCAL WEATHER CONTEXT (Open-Meteo): {weather_info}")

    # Conversation History
    if conversation_history:
        lines.append("### RECENT CONVERSATION TURNS:")
        for turn in conversation_history[-3:]:
            role = turn.get("role", "caller")
            text = turn.get("text", "")
            lines.append(f"  - {role}: {text}")

    # Retrieved Passages & Agricultural Knowledge
    lines.append("### AGRICULTURAL KNOWLEDGE BASE PASSAGES:")
    if retrieved_passages:
        for idx, p in enumerate(retrieved_passages, 1):
            chunk_id = p.get("chunk_id", f"c_{idx}")
            title = p.get("title", "Agricultural Extension Resource")
            text = p.get("text", "")
            lines.append(f"  [{idx}] ({title})\n  \"{text}\"")
    else:
        lines.append(
            "  NOTICE: No high-similarity local trial passages found in knowledge base.\n"
            "  Use evidence_mode='location_aware_model_answer'. Apply general Ethiopian agricultural best practices\n"
            "  suitable for the farmer's confirmed location and agroecology. Avoid inventing chemical dosages."
        )

    lines.append("\nReturn strictly JSON matching the specified schema.")
    return "\n\n".join(lines)
