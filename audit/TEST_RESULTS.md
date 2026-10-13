# Hello Farmer: Comprehensive Test Results & Reliability Audit

**Audit Date:** October 2026  
**Auditor:** QA & Software Architecture Specialist  
**Test Environment:** Windows Host / WSL2 / Docker Engine (6 Running Containers)  

---

## 1. Test Execution Summary

| Suite / Area | Command Executed | Status | Passed | Failed | Blocked / Skipped |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Location-Aware Voice Pipeline** | `pytest tests/test_location_aware_voice.py` | **PASSED** | 13 | 0 | 0 |
| **LLM Agricultural Guardrails** | `pytest tests/test_llm_guardrails.py` | **PASSED** | 7 | 0 | 0 |
| **Afaan Oromo Pipeline Verification** | `pytest tests/test_oromo_e2e.py` | **PASSED** | 7 | 0 | 0 |
| **AudioSocket Server Diagnostic** | `python scripts/verify_voice_agent.py` | **PASSED** | 6 checks | 0 | 0 |
| **Docker Multi-Service Health** | `docker compose ps` | **PASSED** | 6 containers | 0 | 0 |
| **PostgreSQL & Vector Schema Check**| `docker compose exec postgres psql ...` | **PASSED** | Verified | 0 | 0 (No HNSW index) |
| **Linphone Softphone Live Dialing** | Manual SIP Dial to Extension `8028` | **NOT RUN** | - | - | Telephony client manual verification |
| **End-to-End Telecom SMS Delivery** | `sms_service.send_alert()` | **BLOCKED**| 0 | 0 | Live telecom SMS gateway unconfigured |

---

## 2. Detailed Test Suite Execution

### 2.1 Voice Pipeline & Location Resolution (`tests/test_location_aware_voice.py`)
- **Execution Command:**
  ```bash
  docker compose exec -T backend pytest tests/test_location_aware_voice.py -v
  ```
- **Results:** 13 Passed in 2.41s
  - `test_location_extraction_amharic`: Verified extraction of *"ከአዳማ ነው የምደውለው"* -> `Adama` (Zone: East Shewa, Agroecology: Weyna Dega).
  - `test_location_extraction_oromo`: Verified extraction of *"Bakee Ambo irraan bilbila"* -> `Ambo`.
  - `test_location_prefix_stripping`: Verified conversational prefix cleaner drops *"እኔ ከአካባቢው..."*, *"ከ... ነው"*.
  - `test_vad_turn_taking`: Verified WebRTC VAD splits speech frames and detects 800ms silence boundary.
  - `test_audiosocket_handshake`: Verified UUID header protocol compliance over TCP.
  - `test_audio_conversion_rates`: Verified bidirectional resampling (8kHz <-> 16kHz).

### 2.2 LLM Agricultural Safety & Guardrails (`tests/test_llm_guardrails.py`)
- **Execution Command:**
  ```bash
  docker compose exec -T backend pytest tests/test_llm_guardrails.py -v
  ```
- **Results:** 7 Passed in 1.18s
  - `test_chemical_dosage_suppression`: Verified that unverified organophosphate pesticide dosage claims are blocked.
  - `test_veterinary_referral_mandate`: Verified that acute animal disease queries (e.g., anthrax symptoms) mandate immediate referral to local wereda development agents.
  - `test_agroecology_conflict_warning`: Verified that advising frost-sensitive crops for Dega (highland) triggers a guardrail warning.
  - `test_offline_template_fallbacks`: Verified deterministic rule templates return valid Amharic responses when all cloud LLMs return HTTP 500/timeout.

### 2.3 Afaan Oromo E2E Pipeline (`tests/test_oromo_e2e.py`)
- **Execution Command:**
  ```bash
  docker compose exec -T backend pytest tests/test_oromo_e2e.py -v
  ```
- **Results:** 7 Passed in 1.84s
  - *Caveat:* The tests pass because they mock or test code paths (translation mapping, Edge-TTS synthesis, location parsing). They do **not** test real RAG retrieval because, as discovered in the RAG audit, only 1 placeholder Oromo document exists in the database.

### 2.4 Voice Agent AudioSocket Diagnostic (`scripts/verify_voice_agent.py`)
- **Execution Command:**
  ```bash
  docker compose exec -T backend python scripts/verify_voice_agent.py
  ```
- **Output:**
  ```
  [OK] AudioSocket TCP port 9092 is listening
  [OK] Pre-rendered prompts verified (32 WAV files present)
  [OK] WebRTC VAD initialised at mode 2
  [OK] Location extractor loaded with 35 agricultural hubs
  [OK] LLM provider chain initialized (Gemini -> Groq -> Claude -> Offline)
  [OK] Redis session manager operational
  ```

---

## 3. Blocked and Untested Areas

### 3.1 Live SIP Softphone Verification (Linphone)
- **Status:** *Not Run / Manual Step Required*
- **Why It Cannot Be Tested in CI:**
  CI/headless environments lack a native SIP/RTP media client with real microphone and speaker devices.
- **Manual Reproduction Procedure:**
  1. Download and launch **Linphone** (Desktop or Mobile).
  2. In Linphone Account Settings, create a SIP account:
     - **SIP Identity:** `sip:1001@localhost:5060` (or host IP)
     - **SIP Proxy:** `sip:localhost:5060;transport=udp`
     - **Password:** Retrieve from Asterisk configuration in `asterisk/pjsip.conf` (Note: Exposed via `GET /api/v1/voice-agent/status`).
  3. Confirm SIP Registration displays **Connected (Green)**.
  4. Dial extension `8028`.
  5. **Verification Checklist:**
     - [ ] Immediate Amharic welcome prompt plays: *"ሰላም! ሄሎ ፋርመር ነኝ..."*
     - [ ] Recording notification is announced.
     - [ ] Speak: *"ከአዳማ ነው የምደውለው፣ የጤፍ ማሳዬ ላይ ተምች ገብቷል"* (*"I am calling from Adama, armyworm entered my teff field"*).
     - [ ] Verify turn-taking stops after silence.
     - [ ] Verify agent responds in Amharic with teff pest advice.
     - [ ] Hang up and verify call session is recorded in `http://localhost:3000`.

### 3.2 SMS Gateway Delivery
- **Status:** *Blocked*
- **Reason:** Missing live credentials for an active Ethiopian telecom SMS aggregator (e.g., Africa's Talking API key or Ethio Telecom Shortcode SMPP credentials). Database table `sms_messages` receives records, but real carrier delivery cannot be verified.

---

## 4. Frontend Lint & Build Diagnostic

- **Inspection:** Next.js 14 frontend compiles cleanly inside Docker container `hello_farmer_frontend`.
- **Finding:** Frontend unit test suite is minimal. UI components lack automated end-to-end Cypress or Playwright tests for call simulation.
