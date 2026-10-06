# Astra Healthcare Application — Architecture & Tech Stack Reference

> **Document Scope**: This document serves as the single source of truth for all technical decisions, architecture designs, tech stacks, and system workflows implemented across the Astra project. It focuses strictly on engineering techniques, data flow, protocols, and architectural patterns (excluding UI styling or superficial details).

---

## 1. System Technology Stack

### Backend Stack
- **Runtime & Framework**: Python 3.10+, FastAPI (ASGI Framework)
- **ASGI Server**: Uvicorn with multi-worker reloader (`uvicorn[standard]`)
- **Database Engine**: MongoDB (NoSQL Document Store)
- **Async Driver & ODM**: Motor (Asynchronous MongoDB driver) + Beanie ODM (Pydantic-based Document-Object Mapper)
- **Data Validation & Settings**: Pydantic v2 & `pydantic-settings`
- **Authentication & Cryptography**:
  - `python-jose[cryptography]` (HMAC-SHA256 JWT generation and validation)
  - `passlib[bcrypt]` (Bcrypt password hashing with salted rounds)
- **Email & Communications**: `aiosmtplib` (Asynchronous SMTP client), `email-validator`
- **Cross-Origin Policy**: FastAPI CORSMiddleware with fine-grained origin whitelisting

### Frontend Stack
- **Framework**: React 18 (Single Page Application architecture)
- **Build Tooling & Dev Server**: Vite 5
- **Routing**: `react-router-dom` v6 (Client-side routing with role-specific Route Guards)
- **HTTP Client**: Axios with centralized request/response interceptors
- **Icons & Assets**: `lucide-react` (SVG icon system)

---

## 2. Core Architectural Techniques & Paradigms

### A. Real-Time Presence & Connection State Architecture (Heartbeat Protocol)
- **Problem Solved**: Storing a static `is_online: true` boolean on login causes permanent false-positive online states when users close browser tabs, lose internet connectivity, or let sessions expire without explicit logout.
- **Implementation Technique**:
  1. **Time-Aware Liveness Window**: Online status is computed dynamically rather than trusting a raw boolean. An entity is officially declared online if and only if:
     $$\text{is\_actually\_online} = (\text{is\_online} == \text{True}) \land (\text{utcnow}() - \text{last\_seen\_at} < 5\text{ minutes})$$
  2. **Periodic Client Heartbeat**: Frontend active stations run a background polling interval pinging `/api/auth/health-worker/heartbeat` (or `/doctor/heartbeat`) every 2 minutes while the tab is active.
  3. **Instant Session Revocation on Logout**: Dedicated `/logout` endpoints clear `is_online` to `False` and nullify `last_seen_at` in the database immediately upon sign-out.

### B. Role-Based Access Control (RBAC) & Token Architecture
- **JWT Decoupled Claims**: Tokens encode role hierarchy and facility tenancy:
  - Admin: `{"sub": "<admin_mongo_id>", "role": "admin"}`
  - Health Worker: `{"sub": "<worker_mongo_id>", "worker_id": "REC-00001", "role": "health_worker", "sub_role": "Reception", "care_hub_id": "<hub_id>"}`
  - Doctor: `{"sub": "<doc_mongo_id>", "doctor_id": "DOC-00001", "role": "doctor", "care_hub_id": "<hub_id>"}`
- **FastAPI Guard Dependencies**:
  - `get_current_admin`: Validates admin authorization credentials.
  - `get_current_worker`: Enforces `role == "health_worker"` and resolves MongoDB identity.
  - `get_current_doctor`: Enforces `role == "doctor"` and resolves physician identity.
- **Client-Side Route Protection**: React Protected Route wrappers (`ProtectedAdminRoute`, `ProtectedWorkerRoute`) inspect local JWT payloads and prevent cross-role station access.

### C. Deterministic & Sequential Identifier Systems
- **Facility Scoping**: All personnel and patients are bound to a facility identifier (`care_hub_id`).
- **Identifier Prefixing**:
  - `REC-XXXXX`: Reception Desk Workers
  - `VER-XXXXX`: Verification Nurses
  - `DIS-XXXXX`: Dispensing Pharmacists
  - `DOC-XXXXX`: Medical Doctors
  - `DEV-XXXXX`: Hardware Edge / Endpoint Devices
  - `P-0001`: Patient Identifiers (Sequential 4-digit zero-padded sequence computed against database collection count with collision-free fallback).

---

## 3. Workflow & Clinical Pipeline Stages

```
   [ Patient Arrival ]
           │
           ▼
┌──────────────────────────────────────────────┐
│  STATION 1: RECEPTION DESK                   │
│  - Captures: Name, Age, Gender, Phone, Addr  │
│  - ZERO medical information / symptoms taken │
│  - Issues: Sequential Patient ID (P-0001)    │
└──────────────────────┬───────────────────────┘
                       │ Enqueues into AI Queue
                       ▼
┌──────────────────────────────────────────────┐
│  STAGE 2: AI CLINICAL INTERROGATION AGENT    │
│  (Autonomous conversational AI screening)    │
│  - Interrogates patient for symptoms         │
│  - Analyzes chief complaints & severity      │
│  - Generates structured medical summary      │
└──────────────────────┬───────────────────────┘
                       │ Forwards Summary
                       ▼
┌──────────────────────────────────────────────┐
│  STATION 3: CLINICAL VERIFICATION DESK       │
│  - Health Worker verifies AI triage summary  │
│  - Validates plausibility & forwards         │
└──────────────────────┬───────────────────────┘
                       │ Passes to Physician
                       ▼
┌──────────────────────────────────────────────┐
│  STAGE 4: DOCTOR CONSULTATION & PRESCRIPTION │
│  - Doctor reviews verified AI findings       │
│  - Diagnoses patient & issues prescription   │
└──────────────────────┬───────────────────────┘
                       │ Sends Rx
                       ▼
┌──────────────────────────────────────────────┐
│  STATION 5: PHARMACY DISPENSING DESK         │
│  - Health Worker dispenses medications       │
│  - Marks pipeline completed                  │
└──────────────────────────────────────────────┘
```

### Station 1: Reception Desk Rules
- **Strict Scope**: Administrative intake only.
- **Input Fields**: Full Name, Age, Gender, Contact Number, Residential Address.
- **Forbidden at Reception**: Biological vitals (BP, temperature, weight, height) and medical symptoms. All clinical data collection is delegated to the AI Agent during interrogation.
- **Queue Presentation**: Live queue counter with high-performance tile rendering.

### Stage 2: Autonomous AI Clinical Interrogation Kiosk (Endpoint Device)
- **Zero-PII Privacy Architecture**: The endpoint terminal has **no access to demographic data** (names, phone numbers, or addresses are never sent to the kiosk). The kiosk operates strictly on the unique sequential `patient_id` (e.g. `P-0001`) auto-fetched directly from the Reception triage queue (`status: "queued_for_ai"`).
- **Dual-Engine Speech Synthesis (TTS) Architecture**:
  - **Local Model (Default · Zero API Cost)**: `hexgrad/Kokoro-82M` running on-device via `kokoro.KPipeline`. Generates 24kHz uncompressed WAV audio in-memory, converted to Base64 with zero external API calls or latency overhead.
  - **Cloud Model (Switchable API)**: Sarvam Indic Cloud TTS (`bulbul:v3`) supporting neural expressive voice synthesis with speaker `priya`.
  - **Dynamic Engine Switcher**: Terminal operators and patients can toggle between Local Kokoro and Sarvam Cloud at any time via the endpoint header or interrogation control panel.
  - **Bi-Directional Fallback**: If Local Kokoro encounters an unsupported script or inference failure, it automatically falls back to Sarvam Cloud; conversely, if the Sarvam API is unreachable or rate-limited, it automatically falls back to Local Kokoro.
- **Indic Multimodal AI Speech-to-Text & Reasoning (Sarvam AI)**:
  - **Speech-to-Text (STT)**: Model `saaras:v3` transcribing patient voice responses. Client uses 250ms timesliced `MediaRecorder` buffers in WebM/Opus format. Backend performs strict MIME sanitization (stripping codec parameters such as `;codecs=opus` to prevent strict API rejection) and provides automatic fallback to `language_code="unknown"` when language-specific STT produces empty transcripts.
  - **Clinical Reasoning LLM**: Model `sarvam-105b-conversations` reasoning over dialogue history and outputting strict JSON schema decisions (`action: "ask_question"` or `"conclude_triage"`).
- **Dual Primary Question Protocol**:
  1. *Primary Q1*: "Explain about your symptoms clearly and deeply" (dynamically translated and formulated in the selected language).
  2. *Primary Q2*: "Did you miss something? Please give more details of what you are feeling and explain your problem" (initially enqueued with `flag: "not_asked"`).
  3. *Dynamic Follow-ups*: Once both primary discovery questions are answered, the LLM generates focused follow-ups targeted to the specific disclosed symptoms until sufficient clinical criteria are gathered.
  4. *Queue Handover*: The LLM compiles an AI clinical summary (`chief_complaints`, `severity`, `triage_urgency`) and automatically transitions the patient record to `pending_verification` for Health Worker review.
- **Canonical English Memory Store (Redis Ledger) & Multilingual Interaction**:
  - **Bilingual Decoupling**: All patient answers are translated to English via Sarvam `/translate` before writing to Redis. The LLM reasoning prompt receives a canonical English dialogue memory ledger with strict negative constraints (*"DO NOT ASK ABOUT SYMPTOMS ALREADY DISCLOSED"*), preventing duplicate questioning.
  - **Native Localized Output**: The LLM outputs both `next_question_en` (for memory) and `next_question` in the patient's chosen language (Hindi, Odia, or English) for voice playback and screen display.
  - **Live Question Ledger in Redis**:
    - `flag: "asked"`: Question was presented to the patient, transcribed, and answered.
    - `flag: "not_asked"`: Question is planned in the clinical queue awaiting presentation.
  - **Resilience**: Dual-driver architecture using `redis-py` async with transparent in-memory TTL dictionary fallback.

---

## 4. Database Collections & Index Topology

### MongoDB Collections (Beanie ODM)
1. `admins`: System facility managers.
   - Indexes: `email` (unique)
2. `care_hubs`: Physical healthcare hubs.
   - Indexes: `admin_id`
3. `doctors`: Medical doctors assigned to hubs.
   - Indexes: `doctor_id` (unique), `email` (unique), `care_hub_id`
4. `health_workers`: Paramedical and desk staff.
   - Indexes: `worker_id` (unique), `email` (unique), `care_hub_id`, `sub_role`
5. `endpoint_devices`: IoT / Clinic edge terminals.
   - Indexes: `device_id` (unique), `care_hub_id`
6. `patients`: Intake patient records and screening state.
   - Indexes: `patient_id` (unique), `care_hub_id`, `status`, `created_at`

---

## 5. API Registry Overview

| Prefix | Domain | Description |
|---|---|---|
| `/api/auth` | Authentication | Admin, Worker & Device login, token generation, heartbeats, and logout |
| `/api/care-hub` | Facilities | Multi-facility creation, listing, profile retrieval, aggregate dashboard metrics, and cascade facility deletion |
| `/api/doctors` | Doctor Accounts | Creation with credential generation, listing, deletion |
| `/api/health-workers`| Worker Accounts | Role-based worker creation (`REC`, `VER`, `DIS`), listing, deletion |
| `/api/endpoint-devices`| Edge Hardware | Terminal device registration, online status tracking, launch tokens |
| `/api/patients` | Patients & Queue | Reception patient intake, sequential ID issuing, queue retrieval |
| `/api/kiosk` | AI Interrogation | Zero-PII queue fetch, multimodal session start, text/voice replies, Redis memory audit |

---

## 6. Maintenance Guidelines for this File
- **When to update**: Whenever an architectural change occurs, new microservices or frameworks are introduced, database schemas are modified, or pipeline workflows are updated.
- **What not to include**: UI color themes, button margins, cosmetic CSS tweaks, or component-internal layout details.

