# Architecture & Design Decisions (DECISIONS.md)

This document records architectural, algorithmic, and engineering decisions made during the design and implementation of Hello Farmer, along with their rationale and trade-offs.

---

## 1. Background Worker: `arq` over `RQ`
- **Decision**: Use `arq` (asyncio-native Redis job queue) instead of `RQ`.
- **Rationale**:
  - Hello Farmer backend is built completely on `asyncio` (FastAPI, AudioSocket TCP server, async LLM and speech streaming).
  - `RQ` is synchronous and relies on `os.fork()` which does not work natively on Windows without special workarounds, and blocking worker calls interfere with async event loops.
  - `arq` runs directly on `asyncio` and `redis-py` (async), enabling non-blocking execution of post-call summarization, SMS dispatch, and warning evaluations.

---

## 2. Telephony Audio Bridge: AudioSocket over ARI / External Bridges
- **Decision**: Use Asterisk `AudioSocket` (`app_audiosocket` / `res_audiosocket`) streaming raw 8 kHz 16-bit signed linear mono PCM over TCP.
- **Rationale**:
  - Zero SIP/RTP stack complexity inside Python: Asterisk handles SIP endpointing, NAT traversal, codec negotiation (G.711 / PCMA / PCMU), and transrating to linear PCM.
  - AudioSocket protocol is lightweight and standard in Asterisk 16+: a 3-byte frame header (message type, 2-byte payload length) plus a 16-byte UUID connection identifier followed by raw PCM bytes.
  - Runs natively inside our Python `asyncio.start_server` on port 9092.

---

## 3. Database: Single PostgreSQL Instance with `pgvector`
- **Decision**: Single Docker container running `pgvector/pgvector:pg16` handling both relational state and vector embeddings.
- **Rationale**:
  - Simplifies deployment and guarantees ACID consistency between conversation logs, farmer context, knowledge chunks, and embedding vectors.
  - Eliminates the need for a separate vector database (e.g., Chroma or Pinecone) and keeps the stack 100% self-hosted and zero-cost.

---

## 4. LLM & Fallback Strategy
- **Decision**: Primary: Google Gemini Flash (`gemini-2.5-flash` or `gemini-1.5-flash`) via `GEMINI_API_KEY`. Fallback chain: Groq / OpenRouter `:free` models -> Ollama (local) -> Pre-rendered safe fallback audio.
- **Rationale**:
  - Gemini Flash offers native free-tier quotas (15 RPM / 1M TPM on Google AI Studio), excellent multilingual comprehension of Amharic and Afaan Oromo, and low latency.
  - Strict 8-second timeout on LLM generation with automatic retry using a repair prompt before falling back to pre-rendered spoken referral message.
  - Guardrails enforce that the caller hears ONLY verified information from retrieved context, never invented numbers or chemical recipes.

---

## 5. Storage of Farmer Data & Cryptographic Privacy
- **Decision**: Phone numbers are stored as salted SHA-256 hashes (`caller_hash`) by default. Plaintext numbers are NEVER persisted unless explicit spoken consent is granted for SMS or proactive warnings, in which case they are encrypted using AES-256 (Fernet) at rest.
- **Rationale**:
  - Ethiopian rural farmers frequently use shared family or community phones.
  - Privacy-by-default ensures no caller identifiable information is retained without consent.

---

## 6. Zero-Keypress Voice Navigation
- **Decision**: No DTMF menus or keypad prompts. Consent, language choice, and questions are driven entirely by voice and silence/VAD endpointing.
- **Rationale**:
  - Illiteracy and low digital literacy among smallholder farmers make IVR keypad menus a primary source of call abandonment.
  - An intuitive, conversational "just speak" approach lowers barrier to access.

---

## 7. Commercial Licensing & Provider Priority: Google Gemini Primary
- **Decision**: Avoid Meta research models (Meta MMS-1B, MMS-TTS) due to CC-BY-NC (Non-Commercial) licensing restrictions that prohibit commercial deployment. Focus on **Google Gemini** as the primary engine throughout the project (Gemini Multimodal Audio STT, Gemini Flash LLM, Gemini embeddings / RAG reasoning), complemented by permissively licensed open-source tools (e.g., faster-whisper under MIT license).
- **Rationale**:
  - Guarantees clean commercial viability from prototype to production.
  - Gemini Flash provides state-of-the-art multilingual comprehension for Ethiopian languages (Amharic and Afaan Oromo), native multimodal audio transcription, and fast inference.

---

## 8. TTS Architecture & Pre-Rendered Fixed Prompts
- **Decision**: All 15 fixed telephony prompt states (bilingual greetings, consent questions, thinking cues, repeat prompts, safe fallback referrals, timeout goodbyes, and error messages) are pre-rendered into static 8 kHz 16-bit mono linear PCM WAV files in `backend/cache/prompts/` and served with 0ms synthesis latency.
- **Rationale**:
  - Rule 10 & 6.1: Never synthesize fixed prompts dynamically per call.
  - Eliminates network latency, TTS API quota consumption, and runtime failure risks during critical call transitions.
  - Dynamic answers are synthesized via `EdgeTTSProvider` with SHA-256 disk caching, backed by deterministic offline fallback so callers never hear silence.

---

## 9. RAG Embeddings & Strict Source Tier Architecture
- **Decision**: Standardize vector embeddings to 768 dimensions (`vector(768)`) in PostgreSQL `pgvector`, aligned with Gemini `text-embedding-004`. Strictly validate document provenance at ingestion: permit only Tier 1 (MoA/EIAR), Tier 2 (FAO/CGIAR), Tier 3 (Academic), and reject Tier 4 (unvetted/blogs). Restrict synthetic placeholder documents (`tier="placeholder"`) from containing numeric dosages or chemicals.
- **Rationale**:
  - Section 6.4 & Rule 1: Safety over helpfulness. Agricultural dosages must never be hallucinated or grounded in unverified sources.
  - Section 6.4: Questions regarding doses/chemicals must strictly cite Tier 1 or approved Tier 2 material. If evaluated against placeholder documents, the system deterministically triggers the safe fallback referral (to the local development agent or the 8028 hotline).
  - Cross-lingual retrieval allows Amharic and Afaan Oromo queries to map semantically to Ethiopian and international agricultural research documents.

---

## 10. Multi-Layer Agricultural Guardrails & Arabic Digits Sanitization
- **Decision**: Implement a multi-layer guardrail pipeline (`validate_and_guard`) executing before any answer is spoken to callers or returned to the API. Layers: (1) Acute medical/veterinary emergency interception; (2) Grounding validation; (3) Strict source tier verification blocking chemical/dosage advice unless backed by Tier 1/approved Tier 2 sources; (4) Numeric grounding check comparing spoken words/quantities against retrieved context; (5) Automatic Arabic-digit-to-word transliteration; (6) Max 3-sentence length enforcement.
- **Rationale**:
  - Smallholder safety: incorrect chemical application destroys crops or causes chemical poisoning.
  - Spoken phone telephony requires numbers spoken as words ("ሁለት ሊትር", "lama") rather than unpronounceable digit strings.
  - Guarantees 100% compliance with Section 6.5 and 6.6 rules.

---

## 11. AudioSocket Telephony Bridge & Online VAD Speech Endpointing
- **Decision**: Asterisk channels communicate directly with Python asyncio TCP server on port 9092 via `app_audiosocket`. Incoming 8 kHz 16-bit mono linear PCM frames (320 bytes / 20ms) are analyzed online by an RMS energy & silence detector (`VADEndpointer`). Transitions execute: ANSWER -> CONSENT -> LISTEN -> THINK -> SPEAK -> HANGUP.
- **Rationale**:
  - Eliminates external heavy C/C++ audio daemon dependencies while maintaining sub-millisecond wire protocol processing.
  - The "THINK" state streams an immediate "one moment" prompt (`one_moment_am.wav`) so farmers never experience dead air while AI inference executes.
  - Silent/timeout fail-safes prevent orphaned channels or zombie sessions from consuming Asterisk resources.

---

## 12. Weather Integration: Open-Meteo Free API, Caching, and Agronomic Spraying Safety
- **Decision**: Use Open-Meteo free API (`https://api.open-meteo.com/v1/forecast`) for Ethiopian coordinates with Redis and in-memory 60-minute TTL caching, backed by deterministic `MockWeatherProvider`. Integrate place-name resolution with Ethiopian agricultural hubs (Adama, Bishoftu, Asella, Ambo, etc.) and `WeatherRiskAnalyzer` for spraying safety and heavy rainfall detection (>20mm).
- **Rationale**:
  - Open-Meteo is 100% free and open for operational forecasting with no API key requirement, fitting the free-tier mandate.
  - Spraying pesticide or fungicide in wet conditions washes chemicals away; spraying in winds (>15 km/h) causes dangerous drift. Automated risk rules ground answers in actionable safety before farmers waste expensive chemicals.
  - If network or external API drops, `MockWeatherProvider` provides graceful degradation without silence or call termination.

---

## 13. Post-Call SMS & Background Worker Architecture
- **Decision**: Use `arq` async worker on Redis for background job execution (`generate_post_call_summary`, `evaluate_weather_warnings`). Implement `MockSMSProvider` writing to PostgreSQL `sms_messages` table and developer console, with duplicate suppression within 24 hours. The SMS encoding engine (`sms/encoding.py`) differentiates GSM-7 (160 chars) from UCS-2 (70 chars for Ge'ez script) and truncates safely on word boundaries without breaking multi-byte code points.
- **Rationale**:
  - Telephony calls must tear down immediately upon hangup without waiting for slow LLM summarization or SMS network calls.
  - Basic feature phones in Ethiopia have varying support for concatenated SMS; constraining summaries to <= 2 segments prevents message loss and billing explosions in production.
  - Duplicate suppression prevents annoying or costly repeated SMS alerts to farmers for the same call or weather event.

---

## 14. Afaan Oromo End-to-End Multilingual Architecture
- **Decision**: Implement dynamic language identification (`language/detect.py`) resolving caller language using script heuristics (Ge'ez Unicode vs Qubee Latin) and inflected Oromo agricultural keyword roots ("roob", "biif", "midhaan", "boqqoolloo"). The pipeline dynamically switches conversation language, formats spoken prompts, transliterates Qubee numbers to words ("lama", "sadii"), conducts cross-lingual RAG retrieval, and generates Oromo post-call SMS summaries.
- **Rationale**:
  - Over 35 million Ethiopians speak Afaan Oromo as their native language.
  - Zero-keypress spoken voice requires the system to detect language seamlessly from the greeting and caller utterance rather than forcing rigid IVR number selection.
  - Grounded safety rules (no hallucinations, no invented doses, referral to 8028) must hold with equal fidelity in Afaan Oromo.

---

## 15. Heavy-Rainfall Warning Engine (Thin Slice) Architecture
- **Decision**: Implement a thin-slice warning engine focused exclusively on heavy-rainfall hazard detection from weather forecasts against configurable thresholds (LOW: >=20mm, MEDIUM: >=35mm, HIGH: >=50mm, CRITICAL: >=80mm). The targeting engine (`warnings/targeting.py`) strictly enforces opt-in consent (`Farmer.is_opted_in_warnings=True`), geographic matching (woreda/region), a strict daily cap of 1 warning per farmer per 24 hours, and duplicate suppression. Alerts are delivered dually to mock SMS and database `web_notifications`, and a follow-up loop (`warnings/followup.py`) enables returning callers to ask about recent warnings.
- **Rationale**:
  - Floods, waterlogging, and soil erosion during heavy rains represent major causes of crop failure in vertisol/clay soils across Ethiopian highlands.
  - Alert fatigue is a primary reason farmers ignore SMS broadcasts; capping notifications to max 1 per 24 hours prevents spam.
  - Grounded agronomic guidance (e.g. digging drainage ditches / "bo'oo lolaa baasaa") provides immediate practical actions rather than mere panic warnings.

---

## 16. Web Frontend Architecture & Unified AI Core
- **Decision**: The Next.js frontend connects directly to the same backend FastAPI service via rewrite proxy `/api/backend/:path*` -> `http://backend:8000/api/v1/:path*`. The "Ask Hello Farmer" text page calls `process_utterance` directly, guaranteeing identical RAG, LLM reasoning, and guardrails across speech and text. Dynamic views provide Farmer Portal (profile, warnings, advice), Developer Mock SMS Inbox, and Admin Analytics.
- **Rationale**:
  - Eliminates logic duplication between voice telephony and web text: single source of agronomic truth.
  - Allows researchers, reviewers, and agronomists to evaluate AI answers, citations, and source tiers without placing telephony calls.
  - Developer SMS inbox makes mock SMS delivery inspectable without SMS gateways or carrier contracts.

---

## 17. Location-First Agricultural Voice Agent & Notice-Based Recording Architecture
- **Decision**:
  1. **Greeting & Recording Notice**: Play a single, natural spoken greeting that announces recording for service improvement and immediately asks for the caller's town or nearby city, with **NO verbal yes/no consent prompt** ("Do you agree", "say yes or no", or "ይፈቅዳሉ").
  2. **Configurable Recording Policy**: Set `RECORDING_POLICY` (default `"transient_only"`, option `"notice_based_persistent"`). In transient mode, ephemeral 20ms VAD PCM frames are processed in-memory for transcription and immediately discarded without writing audio files to disk. Notice status is tracked in PostgreSQL `calls.recording_consent_status="notice_announced"`.
  3. **Location Resolution & Prefix Cleaning**: Strip Ge'ez attached prepositions ("ከ", "በ") and conversational words ("ነው", "ነኝ", "አካባቢ", "irraa", "keessaa") before matching against 35+ reference Ethiopian hubs. Handle transliterations and historical aliases ("Nazret" -> Adama, "Debre Zeit" -> Bishoftu).
  4. **Strict Ambiguity & Non-Defaulting Guardrail**: If multiple regions match, ask at most one concise clarification: "Which region is that in?" / "በየትኛው ክልል ውስጥ ነው?". If location resolution fails, **NEVER silently default to Addis Ababa**; proceed with appropriately qualified general guidance.
  5. **Location-Aware pgvector RAG Boosting**: Knowledge retrieval applies tiered scoring boosts for locality match (+0.20), regional/zone research center match (+0.12, e.g. Kulumsa, Bako, Melkassa, Adet), and agroecological zone (+0.08, Dega/Weyna Dega/Kolla), while keeping national-level MoA guidance available as a fallback.
  6. **Real-Time Weather Grounding**: When location coordinates are resolved, query Open-Meteo for local forecast, rain, and temperature to ground advice in immediate conditions.
- **Rationale**:
  - Smallholder farmers with limited digital literacy abandon calls when faced with complex consent menus or multi-step account registration.
  - Agricultural recommendations differ significantly across Ethiopian agroecological zones (e.g., highland vertisols vs rift valley sandy loams). RAG evidence must be conditioned on true local research rather than cosmetic LLM prompt insertion.
  - Discarding transient audio respects privacy by default while providing a documented, lawful notice.

---

## 18. Gemini-First Voice AI Architecture (STT, LLM Reasoning, TTS) & Location-Aware Grounding
- **Decision**:
  1. **Gemini as Primary STT (`gemini-3.5-transcribe` / `gemini-3.5-flash`)**:
     - Implemented `GeminiSTTProvider` utilizing modern `google-genai` SDK with fallback to legacy `google.generativeai`.
     - Built telephony audio normalization: 8 kHz / 16 kHz WAV normalization, volume leveling, silence gating (energy RMS < 0.003 or duration < 0.25s automatically returns empty transcript to protect API quota).
     - Domain biasing prompt in authentic Amharic (Ethiopic Fidel) and Afaan Oromo (Latin Qubee).
     - Free-tier protection & rate-limit handling: when Gemini encounters 429 `RESOURCE_EXHAUSTED` (3 RPM limit on free tier) or transient 503, it immediately delegates to configured fallback (`GroqSTTProvider` / `WhisperLocalSTTProvider`) without blocking the caller.
  2. **Hybrid RAG + Location-Aware Answering Pipeline**:
     - RAG remains the first source of truth for agronomic knowledge (Tiers 1-3 verified documents).
     - When RAG evidence is sufficient (`evidence_mode="rag_grounded"`), Gemini formulates a concise 2-3 sentence answer strictly grounded in the retrieved passages.
     - When RAG is insufficient or empty (`evidence_mode="location_aware_model_answer"`), Gemini generates a cautious, location-aware answer using the farmer's confirmed location (region, zone, woreda, agroecological zone), local weather context (Open-Meteo), and general agricultural best practices.
     - Agronomic safety guardrails enforce that Gemini never invents pesticide/herbicide doses, application rates, or unverified fertilizer formulations, routing critical safety issues to local Development Agents (DA) or the 8028 hotline.
  3. **Gemini as Primary TTS (`gemini-3.8-flash-tts`)**:
     - Implemented `GeminiTTSProvider` generating natural speech with prebuilt expressive voice `"Kore"`.
     - Real bandpass audio resampling: converts Gemini's 24 kHz 16-bit mono WAV into Asterisk's required 8 kHz 16-bit signed linear mono PCM via `audio_stream_to_pcm8k`.
     - Seamless fallback to Edge-TTS (`am-ET-AmehaNeural` / `am-ET-MekdesNeural`) and Google TTS when quotas or connectivity limits occur.
  4. **Latency & Observability**:
     - Measured and tracked per-stage latencies (`stt`, `rag`, `llm`, `tts`, `total`).
     - Exposed structured metadata (`evidence_mode`, `location_used`, `sources`, `providers`) in FastAPI endpoints and web interface without exposing sensitive API keys or SIP credentials.
- **Rationale**:
  - Delivers state-of-the-art multilingual voice quality for Ethiopian farmers with low latency.
  - Keeps the entire system modular, resilient against network/quota disruptions, and free-tier compliant.

---

## 19. Conversational Voice Turn-Taking, Full-Duplex Barge-In, Calibrated VAD, and Voice Identity Consistency
- **Decision**:
  1. **Strict 3-Step Opening Flow**:
     - **Step 1 (Greeting & Recording Disclosure)**: Immediate playback of short pre-rendered greeting ("Hello, welcome to Hello Farmer. This call is being recorded to improve our service.") without waiting for caller or asking yes/no confirmation.
     - **Step 2 (Location Collection)**: Asks "Which area are you calling from?" in the active language (`ask_location`), transcribes via Gemini STT, cleans spoken prefixes, resolves structured geography with ambiguity clarification (`clarify_region`), and **never silently defaults to Addis Ababa**.
     - **Step 3 (Agricultural Problem Solicitation)**: Plays `ask_problem` ("What farming problem can I help you with today?") and seamlessly enters the interactive multi-turn loop.
  2. **Calibrated Silence & False-Silence Prompt Elimination**:
     - Tuned `VAD_ENERGY_THRESHOLD=450` and `SPEECH_SILENCE_TIMEOUT_MS=1000ms` (1 second) to protect normal speaking pauses and prevent cutting off farmers.
     - Initial silence timeout set to 8–10 seconds.
     - Replaced nagging filler messages with a maximum of 2 gentle reminders (`MAX_SILENCE_REMINDERS=2`) before graceful goodbye.
  3. **Full-Duplex Barge-In Interruption**:
     - Upgraded `AudioSocketConnection.send_audio(..., allow_barge_in=True)` to inspect incoming 20ms frames while streaming outgoing audio. When caller voice is detected (RMS >= 550 for >= 40ms), playback stops instantly, onset frames are preserved in `barge_in_buffer`, and the conversation loop transitions directly to the listening state without losing syllables.
  4. **100% Unified Voice Identity**:
     - Standardized all 28 fixed prompt WAVs and dynamic answers on Gemini TTS (`gemini-3.8-flash-tts`, prebuilt voice `"Kore"`), eliminating mid-call voice switches.
     - Automated resampling pipeline decodes 24 kHz audio and applies bandpass filtering to 8 kHz 16-bit mono linear PCM.
  5. **Post-Call SMS Summary Integration**:
     - `_finalize_call_record` automatically triggers `trigger_post_call_summary` upon call completion to deliver a concise 2-segment SMS summary of actionable agronomic recommendations in the caller's language.
- **Rationale**:
  - Smallholder farmers with basic phones require natural, uninterrupted turn-taking without confusing menus or jarring voice changes.
  - Barge-in gives farmers control to interrupt long explanations when they already have their answer.
  - Prevents alert fatigue and ensures reliable communication over rural telephony connections.
---

## 20. Free-Tier Priority Strategy: Groq LLM & Edge-TTS/Google TTS for Production MVP
- **Decision**:
  1. **Primary LLM Reasoning**: Prioritize **Groq API** (`qwen/qwen3.8-27b`) as the primary agricultural reasoning provider (`LLM_PROVIDER=groq`), using Google Gemini Flash as an automatic fallback.
  2. **Primary Text-to-Speech (TTS)**: Prioritize **Edge-TTS + Google TTS** as the primary multi-tier speech synthesis engine (`TTS_PROVIDER=edge_tts`), avoiding Gemini TTS free-tier quota exhaustion (`limit: 10 requests/day`).
  3. **Immediate Thinking Acknowledgment**: When a farmer concludes their query, the telephony state machine plays `one_moment` ("አንድ አፍታ ይጠብቁ..." / "Yeroo gabaabaa eegaa...") immediately before launching background RAG + LLM reasoning, eliminating dead silence, keeping the Asterisk RTP stream active, and assuring the caller that their question was received.
- **Rationale**:
  - The Gemini free-tier quota for `gemini-3.8-flash-tts` is restricted to 10 requests per day per project, which quickly exhausts in real-world telephony testing and causes long 429 delays.
  - Groq API provides generous free-tier throughput with sub-second inference latency on `qwen/qwen3.8-27b`, adhering to strict JSON output schemas and grounding agricultural answers accurately.
  - Edge-TTS and Google Translate TTS are zero-cost, highly available, and generate fluent Amharic and English speech with sub-second generation times.
