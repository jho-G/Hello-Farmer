# Hello Farmer: Security, Privacy & Data Handling Audit

**Audit Date:** October 2026  
**Auditor:** Application Security & Privacy Compliance Specialist  
**Target:** `Hello_farmer` Source Code, API Endpoints, and Configuration  

---

## 1. Vulnerability Findings by Severity

| ID | Vulnerability Description | Severity | Affected File / Endpoint | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Cleartext SIP Password Disclosure in Public API** | **CRITICAL (P0)** | `backend/app/main.py` (`GET /api/v1/voice-agent/status`) | Confirmed Active |
| **SEC-02** | **Unauthenticated Multi-Tenant Farmer Profile Access** | **HIGH (P1)** | `backend/app/main.py` (`GET /api/v1/farmer/profile`) | Confirmed Active |
| **SEC-03** | **Permissive Wildcard CORS Configuration** | **MEDIUM (P2)** | `backend/app/main.py` (`CORSMiddleware`) | Confirmed Active |
| **SEC-04** | **Unencrypted AudioSocket Protocol on Internal TCP** | **MEDIUM (P2)** | `backend/app/speech/audiosocket_server.py` (:9092) | By Design (Internal Net) |
| **SEC-05** | **Lack of Rate Limiting on Public AI Chat & Query APIs**| **MEDIUM (P2)** | `backend/app/main.py` (`/api/v1/ask`, `/api/v1/voice-agent/simulate`) | Confirmed Active |

---

## 2. In-Depth Security Findings

### 2.1 SEC-01: Plaintext SIP Credentials Leaked in Status Endpoint
- **Affected File:** `backend/app/main.py`
- **Vulnerable Code Pattern:**
  ```python
  @app.get("/api/v1/voice-agent/status")
  async def get_voice_agent_status():
      return {
          "status": "online",
          "sip_accounts": [
              {"extension": "1001", "password": "<CLEARTEXT_PASSWORD_REDACTED>"},
              {"extension": "1002", "password": "<CLEARTEXT_PASSWORD_REDACTED>"}
          ],
          ...
      }
  ```
- **Exploit Scenario:**  
  Any unauthenticated user navigating to the frontend or directly issuing a GET request to `http://<host>:8000/api/v1/voice-agent/status` receives the exact SIP username and password for PBX extensions. An attacker can immediately register an external SIP client on port 5060, place unauthorized calls, intercept incoming extension channels, or launch a denial-of-service attack against the Asterisk PBX.
- **Remediation:** Remove password strings entirely from API responses. Clients connecting via SIP should be provisioned out-of-band or via authenticated credential management.

### 2.2 SEC-02: Missing Authentication & Tenant Isolation
- **Affected File:** `backend/app/main.py`
- **Vulnerable Code Pattern:**
  ```python
  @app.get("/api/v1/farmer/profile")
  async def get_farmer_profile(db: Session = Depends(get_db)):
      farmer = db.query(Farmer).first()
      return farmer
  ```
- **Analysis:**  
  The application has no authentication middleware (neither JWT, session cookies, nor API tokens). Requesting `/api/v1/farmer/profile` simply returns the first farmer in the database table regardless of who is calling. There is no concept of a logged-in session or tenant isolation.
- **Remediation:** Implement JWT-based or OAuth2 authentication for dashboard access and restrict farmer profile queries by verified caller ID / farmer ID.

### 2.3 SEC-03: Insecure Cross-Origin Resource Sharing (CORS)
- **Affected File:** `backend/app/main.py`
- **Configuration:**
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["*"],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
- **Analysis:**  
  Setting `allow_origins=["*"]` allows malicious third-party websites to execute cross-origin requests against the Hello Farmer API from an authenticated user's browser context.
- **Remediation:** Restrict `allow_origins` to explicit production hostnames (e.g., `https://hellofarmer.et`, `http://localhost:3000`).

---

## 3. Privacy, Audio Handling & Recording Policy Audit

### 3.1 Recording Announcement vs. Actual Data Retention
- **Policy Configuration:** `RECORDING_POLICY="transient_only"` in `backend/app/config.py`.
- **Caller Announcement:**  
  During call establishment, the pre-recorded audio prompt explicitly states:  
  *"ጥሪያችን ለአገልግሎት ጥራት ሲባል ብቻ በጊዜያዊነት ይስተናገዳል"* (*"Our call is processed temporarily for service quality purposes"*).
- **Code Inspection (`backend/app/speech/recording_policy.py` & `voice_pipeline.py`):**  
  - Incoming 8kHz 16-bit mono PCM chunks (320 bytes / 20ms) are stored in an in-memory byte buffer (`bytearray`).
  - Once the WebRTC VAD detects end-of-utterance, the audio buffer is passed in-memory to the STT transcriber (Whisper).
  - Immediately following transcription, the byte buffer is reset: `self.current_utterance_buffer.clear()`.
  - **Verdict: COMPLIANT.** The system does **not** persist raw caller audio files to disk. Only transcription text, call metadata (duration, timestamp, extracted location), and generated advice are logged to the database.

### 3.2 Caller Identification & Anonymization
- **Phone Number Handling:**  
  In `backend/app/models/caller.py` and `backend/app/speech/session_manager.py`, caller phone numbers undergo SHA-256 hashing with a server-side salt before being persisted in analytics tables:
  ```python
  hashed_phone = hashlib.sha256((phone + settings.PHONE_SALT).encode()).hexdigest()
  ```
  This is a commendable privacy design practice that prevents inadvertent leakage of smallholder farmers' phone numbers in call logs.

---

## 4. Environment Variables & Secret Handling

- **Inspection:** `.env` and `.env.example` were inspected.
- **Positive Practice:** `.env` is properly excluded in `.gitignore`.
- **Risk:** Several developers left default fallback secrets (e.g., `SECRET_KEY="insecure-default-change-me"`) in `backend/app/config.py` when environment variables are unset. Production deployment must mandate strict validation that halts application boot if placeholder secrets are detected.
