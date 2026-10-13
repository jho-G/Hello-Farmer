# Hello Farmer: Executive Summary & MVP Readiness Audit

**Audit Date:** October 2026  
**Auditor:** Senior AI Engineer, Software Architect & Agricultural QA Specialist  
**Target Repository:** `Hello_farmer` (Commit HEAD / Current Working Tree)  
**Evaluated Environment:** Docker Compose 6-Service Stack (Asterisk, FastAPI Backend, Celery Worker, PostgreSQL/pgvector, Redis, Next.js Frontend)

---

## 1. Executive Verdict: Is Hello Farmer MVP-Complete?

### **Verdict: Partially Complete (Functional Prototype / Alpha Stage)**

Hello Farmer exhibits a **well-architected core pipeline** with sophisticated engineering across several key domains (notably AudioSocket telephony bridging, multi-provider LLM fallback, structured Ethiopian location extraction, and transient audio privacy safeguards). 

However, **it cannot be certified as MVP-complete for production agricultural advisory or real farmer deployment**. While the voice call plumbing connects and conversational logic runs, several foundational gaps compromise production safety, retrieval efficacy, and multi-lingual inclusivity:

1. **Severe RAG Knowledge Imbalance & Retrieval Distortion:**  
   Out of 8,109 ingested knowledge chunks in PostgreSQL, **3,524 chunks (43.5%)** are livestock census and survey tables from the Ethiopian Statistics Service (ESS), while staple cereal crops are critically under-represented (Wheat: 15 chunks, Maize: 160 chunks, Teff: 742 chunks). When farmers ask about major diseases (e.g., wheat yellow rust), livestock census data or unrelated crops frequently out-rank relevant advice due to keyword density.
2. **Missing Afaan Oromo Knowledge Base:**  
   While Afaan Oromo is supported in speech synthesis (Edge TTS `om-ET`) and geocoding translation dictionaries, the actual knowledge base contains **zero genuine Afaan Oromo agricultural documents** (only 1 single placeholder document exists). Any Afaan Oromo caller query relies on LLM internal parametric knowledge or Amharic-to-Oromo translation hallucination.
3. **Pseudo-Random Embedding Fallback Flaw:**  
   During ingestion under free-tier Gemini rate limits (429 errors), `backend/app/rag/embed.py` fell back to `_offline_hash_embedding` using Python's process-dependent `hash(text)`. This generated pseudo-random 768-dimensional coordinates, meaning chunks embedded during quota exhaustion have arbitrary vector locations and are effectively unretrievable. Furthermore, **no vector index (neither HNSW nor IVFFlat)** exists on `knowledge_chunks.embedding`.
4. **Telephony End-to-End Testing Gap:**  
   The Asterisk-to-AudioSocket bridge, VAD, and turn-taking state machine are implemented, but live voice conversations have only been verified via mock audio unit tests. No automated SIP regression suite runs end-to-end with real audio packets, and softphone integration requires manual Linphone dialing.
5. **Security & Authorization Vulnerabilities:**  
   The FastAPI backend exposes cleartext SIP passwords for softphone extensions at `GET /api/v1/voice-agent/status`, uses `allow_origins=["*"]` on CORS, and allows unauthenticated reads of farmer profiles (`GET /api/v1/farmer/profile` simply returns `db.query(Farmer).first()`).

---

## 2. What Is Genuinely Complete & Verified

The following components are implemented, tested, and actively functioning:

- **Telephony & Media Server Infrastructure:** Asterisk 20 runs healthy in Docker with `res_pjsip` and `app_audiosocket` loaded. AudioSocket TCP server listens on port 9092, accepting 8 kHz, 16-bit mono PCM streams and routing bidirectional frames.
- **Pre-rendered Amharic Prompts:** 32 pre-rendered 8 kHz WAV prompts exist in `backend/cache/prompts/` (covering greetings, location prompts, recording announcements, and fallback messages), eliminating initial TTS latency on call setup.
- **Location & Agroecology Resolution:** Comprehensive parsing in `backend/app/speech/location_extractor.py` strips Ethiopian conversational prefixes (*"ከአዳማ ነው"* -> *Adama*) and resolves ~35 primary agricultural hubs to woredas, zones, regions, and elevation-based agroecological zones (Dega, Weyna Dega, Kolla, Bereha).
- **Privacy-Compliant Recording Architecture:** `backend/app/speech/recording_policy.py` enforces `RECORDING_POLICY="transient_only"`. Audio frames are processed in-memory (20ms PCM chunks) and strictly discarded upon utterance completion without writing caller raw audio to disk.
- **Multi-Provider LLM Fallback:** The generation pipeline in `backend/app/rag/agent.py` and `backend/app/rag/generation.py` cascades seamlessly across Google Gemini 2.5 Flash, Groq LLaMA 3.3 70B, Anthropic Claude 3.5 Sonnet, and offline templates.
- **Automated Weather Pipeline:** Open-Meteo API integration retrieves real-time 7-day precipitation forecasts, calculates soil moisture anomalies, and triggers agro-meteorological warnings.

---

## 3. What Remains Incomplete or Mocked

- **Afaan Oromo Advisory:** Ingestion pipeline has zero Oromo documents. Oromo voice calls cannot retrieve grounded local extension manuals.
- **Vector Search Optimization:** The database runs sequential table scans across all 8,109 rows on every search query. No `pgvector` index exists.
- **SMS Delivery Gateway:** While SMS message templates are formatted and recorded in the database table `sms_messages`, the external Africa's Talking / Ethio Telecom SMS gateway client is unverified in live environments (mocked delivery in development).
- **Frontend State Integration:** In `frontend/app/page.tsx`, the Admin Analytics and Weather tabs feature visual dashboard cards that blend real API responses with static fallback arrays whenever live endpoints return empty data.
- **User Authentication & Tenant Isolation:** There is no authentication layer (JWT, OAuth2, or Session) protecting the web portal or farmer data.

---

## 4. Main Operational & Safety Risks

| Risk Domain | Description | Severity |
| :--- | :--- | :--- |
| **Agricultural Safety** | When RAG fails or returns low-confidence matches, LLM parametric generation risks hallucinating chemical pesticide dosages (e.g., organophosphates) or fertilizer rates without local agroecological grounding. | **Critical (P0)** |
| **Information Bias** | Farmers asking about staple crop diseases (e.g., maize streak virus, wheat stem rust) receive ESS livestock statistical survey tables or rice farming manuals due to extreme corpus skew. | **High (P1)** |
| **Credential Exposure** | Public exposure of SIP extension credentials via the status API allows unauthorized callers to register on the Asterisk PBX and hijack voice channels. | **High (P1)** |
| **Language Exclusion** | Afaan Oromo speakers (comprising ~35% of Ethiopian farmers) receive ungrounded generic advice while Amharic speakers receive MoA-backed guidelines. | **High (P1)** |
| **Embedding Inconsistency** | Pseudo-random fallback vectors in the database cause intermittent retrieval failures for documents ingested during API rate limits. | **Medium (P2)** |

---

## 5. Summary Recommendation

Do **not** begin building new peripheral features (e.g., advanced analytics, drone imagery, farmer social forums). The project requires an immediate **Stage 1 (Stabilization & Safety)** and **Stage 2 (RAG & Multi-Lingual Grounding)** effort to re-ingest the corpus cleanly, implement strict chemical safety guardrails, eliminate credential leaks, and balance the knowledge base with Amharic and Afaan Oromo crop protection manuals.
