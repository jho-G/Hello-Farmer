# Hello Farmer: Prioritized Enhancement Roadmap

**Audit Date:** October 2026  
**Auditor:** Senior AI & Software Architect  
**Objective:** Transition Hello Farmer from an Alpha Prototype to a Production-Ready, Grounded Agricultural Voice Advisory Platform  

---

## Roadmap Overview

```
┌─────────────────────────────────┐
│ Stage 1: Critical Fixes (P0)    │ ──> Blocks Stage 2
│ Security, Safety & Data Fixes   │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Stage 2: MVP Reliability (P1)   │ ──> Blocks Stage 3
│ E2E Telephony, RAG Re-indexing  │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Stage 3: Product Polish (P2)    │ ──> Blocks Stage 4
│ Afaan Oromo, UI & Crop Expansion│
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Stage 4: Production Scale (P3)  │
│ Telephony Trunks, HA, Metrics   │
└─────────────────────────────────┘
```

---

## Stage 1: Critical Fixes (Immediate Blocker Resolution)

### Task 1.1: Eliminate Cleartext SIP Password Disclosure in Public API
- **Priority:** **P0 (Critical)**
- **Problem & Evidence:** `GET /api/v1/voice-agent/status` returns plain SIP passwords (`FarmerPass1001!`, `FarmerPass1002!`) in public JSON (`backend/app/main.py`).
- **User Impact:** Unauthorized parties can register against Asterisk port 5060, hijacking PBX lines and racking up telephony costs.
- **Proposed Solution:** Remove password fields from the API output. Hardcode extensions to authenticate via secure environment variables or generate short-lived SIP credentials.
- **Relevant Files:** `backend/app/main.py`, `backend/app/speech/audiosocket_server.py`.
- **Dependencies & Risks:** Frontend status card must be updated to omit password rendering.
- **Verification:** `curl -s http://localhost:8000/api/v1/voice-agent/status` must not contain password keys.
- **Effort:** **S (Small - 2 hours)**
- **Blocks Next Stage:** **Yes**

### Task 1.2: Restrict CORS and Guard Unauthenticated Farmer Endpoints
- **Priority:** **P0 (Critical)**
- **Problem & Evidence:** `CORSMiddleware` allows `allow_origins=["*"]`, and `GET /api/v1/farmer/profile` returns `db.query(Farmer).first()` without authentication.
- **User Impact:** Smallholder farmer data is completely exposed to scraping from any browser origin.
- **Proposed Solution:** Change CORS origins to configurable domain list. Require an API token or session key for profile access.
- **Relevant Files:** `backend/app/main.py`, `backend/app/config.py`.
- **Dependencies & Risks:** Frontend reverse-proxy must forward required auth headers.
- **Verification:** Unit test asserting non-configured origins receive HTTP 403 on CORS pre-flight.
- **Effort:** **S (Small - 4 hours)**
- **Blocks Next Stage:** **Yes**

### Task 1.3: Fix Pseudo-Random Hash Fallback in Embedding Pipeline
- **Priority:** **P0 (Critical)**
- **Problem & Evidence:** `backend/app/rag/embed.py` falls back to `_offline_hash_embedding` (random Gaussian vector seeded with `hash(text)`) during Gemini 429 rate-limits.
- **User Impact:** Chunks ingested during rate-limiting are stored with arbitrary coordinates and are permanently lost to vector search.
- **Proposed Solution:** Remove pseudo-random fallback. Implement exponential backoff, rate-limit queueing with Celery, or fall back to a local sentence-transformers model (e.g., `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`).
- **Relevant Files:** `backend/app/rag/embed.py`, `backend/app/rag/pipeline.py`.
- **Dependencies & Risks:** Requires batch re-embedding of corrupted chunks.
- **Verification:** Assert that embeddings are deterministic and semantically coherent under mocked API failures.
- **Effort:** **M (Medium - 1 day)**
- **Blocks Next Stage:** **Yes**

### Task 1.4: Purge ESS Census Statistical Tables from RAG Corpus
- **Priority:** **P0 (Critical)**
- **Problem & Evidence:** 3,524 chunks (43.5% of database) are tabular survey statistics from the Ethiopian Statistics Service, crowding out actual agronomic treatment manuals.
- **User Impact:** Farmers asking about crop diseases receive livestock headcounts or survey sampling errors.
- **Proposed Solution:** Create a migration script to delete non-advisory ESS census documents and their chunks from `agricultural_documents` and `knowledge_chunks`.
- **Relevant Files:** `scripts/ingest_documents.py`, `backend/app/models/knowledge.py`.
- **Dependencies & Risks:** Decreases total chunk count from 8,109 to ~4,500, but dramatically increases advice precision.
- **Verification:** Querying `"የስንዴ ቢጫ ዝገት በሽታ"` must not return any livestock census tables.
- **Effort:** **S (Small - 4 hours)**
- **Blocks Next Stage:** **Yes**

---

## Stage 2: MVP Reliability & Grounding

### Task 2.1: Add HNSW Vector Index on `knowledge_chunks`
- **Priority:** **P1 (High)**
- **Problem & Evidence:** Table `knowledge_chunks` has no index on `embedding vector(768)`, causing full table scans on every query.
- **User Impact:** High CPU load and slow retrieval latency under simultaneous caller sessions.
- **Proposed Solution:** Execute `CREATE INDEX idx_knowledge_chunks_hnsw ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);`.
- **Relevant Files:** `backend/alembic/versions/` (or DB initialization script).
- **Dependencies & Risks:** Table lock during index creation (minimal on 8k rows, ~3 seconds).
- **Verification:** `EXPLAIN ANALYZE SELECT ... ORDER BY embedding <=> ...` demonstrates Index Scan using `idx_knowledge_chunks_hnsw`.
- **Effort:** **S (Small - 2 hours)**
- **Blocks Next Stage:** **Yes**

### Task 2.2: Implement Automated End-to-End SIP Telephony Test Suite
- **Priority:** **P1 (High)**
- **Problem & Evidence:** Softphone functionality has only been tested manually or with mocked audio buffers. No automated regression test verifies Asterisk PJSIP RTP streams.
- **User Impact:** Telephony regressions can break live caller intake without triggering CI failures.
- **Proposed Solution:** Implement a headless SIP client test (using `pjsua2` or `sipp`) in Docker that dials extension `8028`, plays an 8kHz PCM sample, and asserts an AudioSocket response packet is returned.
- **Relevant Files:** `tests/test_sip_e2e.py`, `docker-compose.yml`.
- **Dependencies & Risks:** Requires `sipp` container in Docker Compose test profile.
- **Verification:** `docker compose run --rm test_sip` exits with code 0.
- **Effort:** **M (Medium - 2 days)**
- **Blocks Next Stage:** **Yes**

### Task 2.3: Ingest Core Cereal Disease Manuals (Wheat & Maize)
- **Priority:** **P1 (High)**
- **Problem & Evidence:** Wheat has only 15 chunks, and Maize has only 160 chunks in the entire database.
- **User Impact:** Two of Ethiopia's primary food security crops lack actionable pest, disease, and fertilizer coverage.
- **Proposed Solution:** Ingest Ethiopian Institute of Agricultural Research (EIAR) and Ministry of Agriculture production guides for wheat (stem rust, yellow rust, septoria) and maize (fall armyworm, gray leaf spot).
- **Relevant Files:** `knowledge_base/`, `scripts/ingest_documents.py`.
- **Dependencies & Risks:** Must run clean embedding without hitting API quotas.
- **Verification:** Wheat chunk count in DB exceeds 400; queries on yellow rust return specific chemical/cultural treatments.
- **Effort:** **M (Medium - 1.5 days)**
- **Blocks Next Stage:** **No**

---

## Stage 3: Product Enhancement & Localization

### Task 3.1: Ingest Native Afaan Oromo Agricultural Extension Corpus
- **Priority:** **P2 (Medium)**
- **Problem & Evidence:** Only 1 placeholder document exists for Afaan Oromo in the knowledge base.
- **User Impact:** Afaan Oromo speakers receive hallucinated parametric LLM advice or ungrounded translations.
- **Proposed Solution:** Collect and ingest Oromia Bureau of Agriculture (Biroo Qonnaa Oromiyaa) extension bulletins, OARI variety releases, and FAO Oromo translations for teff, maize, and cattle management.
- **Relevant Files:** `knowledge_base/oromo/`, `scripts/ingest_documents.py`.
- **Dependencies & Risks:** Requires bilingual agricultural review to ensure terminology matches dialectal usage (e.g., Hararghe vs. Shoa vs. Jimma).
- **Verification:** Database query confirms >500 Afaan Oromo chunks; Oromo RAG queries retrieve native Oromo passages.
- **Effort:** **L (Large - 4 days)**
- **Blocks Next Stage:** **Yes**

### Task 3.2: Refactor Monolithic Frontend Client Component
- **Priority:** **P2 (Medium)**
- **Problem & Evidence:** `frontend/app/page.tsx` is 179 KB (~4,000 lines) combining tabs, modals, maps, and audio controls.
- **User Impact:** Slow page re-renders and difficult UI debugging.
- **Proposed Solution:** Break `page.tsx` into modular components (`components/VoiceMonitor.tsx`, `components/WeatherAlerts.tsx`, `components/AdminAnalytics.tsx`, `components/KnowledgeExplorer.tsx`).
- **Relevant Files:** `frontend/app/page.tsx`, `frontend/components/`.
- **Dependencies & Risks:** Regression in UI state sharing; keep global state in React Context.
- **Verification:** Next.js build produces clean route chunks; all tabs retain functionality.
- **Effort:** **M (Medium - 2 days)**
- **Blocks Next Stage:** **No**

### Task 3.3: Connect Live Telecom SMS Aggregator
- **Priority:** **P2 (Medium)**
- **Problem & Evidence:** Post-call SMS summaries are written to the database but not delivered to real mobile phones.
- **User Impact:** Farmers calling from simple feature phones have no written reference of the spoken advice.
- **Proposed Solution:** Integrate Africa's Talking Ethiopia SMS gateway or Ethio Telecom SMPP API with retry queueing in Celery.
- **Relevant Files:** `backend/app/services/sms_service.py`, `workers/tasks.py`.
- **Dependencies & Risks:** Requires contracted telecom aggregator credentials.
- **Verification:** End-to-end test dispatching test SMS to an Ethiopian phone number (+2519...).
- **Effort:** **M (Medium - 2 days)**
- **Blocks Next Stage:** **No**

---

## Stage 4: Production Scale & Operational Hardening

### Task 4.1: Ethio Telecom SIP Trunk Integration & Concurrency Tuning
- **Priority:** **P3 (Operational)**
- **Problem & Evidence:** Asterisk is configured for internal Docker softphones (extensions 1001/1002); cannot accept real PSTN mobile calls.
- **User Impact:** Real farmers cannot dial into the service from normal SIM cards.
- **Proposed Solution:** Configure Asterisk PJSIP trunking with Ethio Telecom / Safaricom Ethiopia SIP trunk. Tune Asterisk RTP port ranges and AudioSocket thread pool for 20+ concurrent calls.
- **Relevant Files:** `asterisk/pjsip.conf`, `asterisk/extensions.conf`, `backend/app/speech/audiosocket_server.py`.
- **Dependencies & Risks:** Telecommunication operator provisioning.
- **Verification:** Successful inbound call from mobile phone via PSTN trunk.
- **Effort:** **L (Large - 5 days)**
- **Blocks Next Stage:** **No**

### Task 4.2: Observability, Metrics & Telemetry Stack
- **Priority:** **P3 (Operational)**
- **Problem & Evidence:** Voice latency, token consumption, VAD accuracy, and RAG retrieval latency lack real-time monitoring.
- **User Impact:** Performance degradation or API quota exhaustion happens silently.
- **Proposed Solution:** Deploy Prometheus and Grafana container targets with custom FastAPI and Asterisk metrics exporters.
- **Relevant Files:** `docker-compose.yml`, `backend/app/main.py`.
- **Dependencies & Risks:** Additional container overhead.
- **Verification:** Grafana dashboard displaying P95 voice turn latency, active calls, and token count.
- **Effort:** **M (Medium - 2.5 days)**
- **Blocks Next Stage:** **No**
