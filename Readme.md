# Athena — Institutional Examination & Proctoring Platform

Athena is an enterprise-grade desktop examination and proctoring platform engineered for secure institutional assessments. Built with **React 18**, **Vite**, **Electron 29**, **Express 5**, and **Prisma (PostgreSQL)**, Athena delivers a locked-down, monitored workstation environment featuring real-time proctoring integrity, server-authoritative timer synchronization, automated multi-format grading, and comprehensive candidate audit trails.

---

> [!TIP]
> ### 📦 Download Prebuilt Application (.dmg)
> **You do not need to build from source to test or run Athena!**
> You can download the ready-to-run macOS `.dmg` installer directly from the [**GitHub Releases**](https://github.com/Himanshubansal-2008/myAthena/releases) section of this repository.
>
> 1. Go to the [**Releases**](https://github.com/Himanshubansal-2008/myAthena/releases) tab.
> 2. Download the latest **`Athena-1.0.0-arm64.dmg`** installer.
> 3. Open the `.dmg` file, drag **Athena** into your Applications folder, and launch!
> 4. The application is pre-configured to connect to the cloud-hosted Athena backend out of the box.

> [!NOTE]
> **Cloud Server Notice (Free Tier Wake-up):**
> The backend API is hosted on Render's cloud platform. If the server has been idle, the first request may take **50–80 seconds** to spin up. Subsequent requests respond instantly!

---

## Table of Contents

- [Prebuilt Downloads (.dmg)](#-download-prebuilt-application-dmg)
- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Installation & Local Setup](#installation--local-setup)
- [Running the Application](#running-the-application)
- [Packaging & Generating .dmg](#packaging--generating-dmg)
- [Testing](#testing)
- [Security & Proctoring Specifications](#security--proctoring-specifications)
- [API Reference](#api-reference)

---

## Key Features

- **Candidate Authentication & Enrollment**:
  - Secure JWT authentication with bcrypt-hashed credentials.
  - Candidate registration enforced with a minimum 6-character password constraint.
- **Kiosk Desktop Environment (Electron)**:
  - Hardened IPC context bridge (`contextIsolation: true`, `nodeIntegration: false`).
  - Automatic fullscreen locking and real-time detection of fullscreen exits.
  - Window blur and window focus monitoring to track tab-switching or application defocusing.
- **Pre-Exam Readiness Diagnostics**:
  - Interactive multi-step hardware readiness check (webcam feed, microphone audio level, fullscreen authorization, and network round-trip latency).
- **Live Assessment Room**:
  - Server-synchronized countdown clock resilient against local client clock tampering.
  - Automatic answer autosave on question selection and option toggling.
  - "Mark for Review" workflow with interactive question palette.
  - Automated exam submission on timer expiration.
- **Server-Authoritative Evaluation & Integrity**:
  - Strict single-attempt policy per candidate per examination.
  - PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) preventing race conditions and duplicate submissions.
  - Multi-question grading engine with positive marks and configurable negative marking penalties.
- **Proctoring Incident Audit Trail**:
  - Instantaneous recording of proctoring events (`WINDOW_BLUR`, `FULLSCREEN_EXIT`, `CAMERA_OFF`).
  - Server-side incident debouncing with tamper-proof UTC timestamps.
  - Detailed post-exam audit logs for institutional proctor review.
- **Comprehensive Scorecards & Results Review**:
  - Candidate dashboard with historical submissions and performance benchmarks.
  - Question-by-question breakdown comparing candidate responses with correct solutions and grading rubrics.

---

## Architecture & Tech Stack

```
+-------------------------------------------------------------+
|                      Athena Desktop                         |
|  +--------------------+        +-------------------------+  |
|  |   Electron Main    |<------>|     Preload Bridge      |  |
|  |  (fullscreen/blur) |  IPC   |  (window.electronAPI)   |  |
|  +--------------------+        +-------------------------+  |
|           |                                 |               |
|     Loads Localhost (Dev) /                 v               |
|     dist/index.html (Prod)        React 18 + Vite (SPA)     |
|                                    HashRouter Navigation    |
+---------------------------------------------|---------------+
                                              | HTTPS / JSON
                                              v
+-------------------------------------------------------------+
|                      Express 5 API                          |
|  +-------------------------------------------------------+  |
|  |  Auth Middleware (JWT & Candidate Identity Check)     |  |
|  |  CORS Whitelist (Electron null/file://, Vite 5180)    |  |
|  |  Routes: /api/auth, /api/users, /api/exams            |  |
|  +-------------------------------------------------------+  |
|                             |                               |
|                             v                               |
|                        Prisma ORM                           |
|                             |                               |
|                             v                               |
|                     PostgreSQL Database                     |
+-------------------------------------------------------------+
```

### Technology Breakdown

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, React Router 6 (`HashRouter`), Lucide Icons, Vite 5 |
| **Desktop Shell** | Electron 29, `electron-builder` 26 |
| **Backend API** | Node.js, Express 5, CORS, JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| **Database & ORM** | PostgreSQL, Prisma ORM 6 |
| **Packaging Target** | macOS DMG (`arm64`), Windows NSIS, Linux AppImage |

---

## Project Structure

```
myAthena/
├── backend/
│   ├── index.js               # Express server entry & startup auto-seeder
│   ├── middleware/
│   │   └── authMiddleware.js  # JWT authentication & identity verification
│   ├── prisma/
│   │   └── schema.prisma      # PostgreSQL models (User, Exam, Question, Attempt, etc.)
│   ├── routes/
│   │   ├── auth.js            # /api/auth (Register, Login)
│   │   ├── exams.js           # /api/exams (Sessions, Autosave, Submit, Incidents)
│   │   └── user.js            # /api/users (Candidate profile & past attempts)
│   ├── scripts/
│   │   └── seed_exams.js      # Database seeder for sample examinations
│   ├── tests/
│   │   ├── auth_authorization.test.js # Access control, spoofing & CORS tests
│   │   └── grading.test.js    # Automated grading, negative marking tests
│   └── utils/
│       └── grading.js         # Core grading calculation logic
├── frontend/
│   ├── electron/
│   │   ├── main.cjs           # Electron main process & macOS dock icon
│   │   └── preload.cjs        # Context bridge exposing electronAPI
│   ├── public/
│   │   ├── app-icon.png       # 512x512 transparent Athena app & dock icon
│   │   └── favicon.svg        # Scalable SVG favicon
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Candidate exam portal & history
│   │   │   ├── ExamInstructions.jsx # Instructions & technical rules
│   │   │   ├── ExamReadiness.jsx    # System hardware & environment checks
│   │   │   ├── ExamResults.jsx      # Authoritative scorecards & review
│   │   │   ├── ExamRoom.jsx         # Live exam session & question navigation
│   │   │   ├── Login.jsx            # Candidate login
│   │   │   └── Register.jsx         # Candidate registration
│   │   ├── App.jsx            # Routing & protected routes
│   │   ├── context.jsx        # Auth context & state provider
│   │   └── index.css          # Global design system & theme tokens
│   ├── index.html             # HTML entry point with relative icon paths
│   ├── vite.config.js         # Vite configuration with relative base (`./`)
│   └── package.json           # Scripts & electron-builder packaging configuration
└── Readme.md                  # Project documentation
```

---

## Prerequisites

If building or running locally:
- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher
- **PostgreSQL**: `v14` or higher (optional if connecting to hosted cloud backend)

---

## Environment Configuration

### Backend (`backend/.env`)

```env
PORT=5050
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/myathena_desktop_project?schema=public"
JWT_SECRET="your-secure-random-jwt-secret-key"
ALLOWED_ORIGINS="http://localhost:5180"
```

### Frontend (`frontend/.env`)

```env
# Point to hosted cloud backend or your local backend:
VITE_API_URL="https://athena-api-ailq.onrender.com/api"
# For local development backend:
# VITE_API_URL="http://localhost:5050/api"
```

---

## Installation & Local Setup

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/Himanshubansal-2008/myAthena.git
cd myAthena

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Database Migration & Seeding (Local Backend)

```bash
cd backend

# Run Prisma migrations
npx prisma migrate dev --name init

# Seed default examinations (also runs automatically on startup if DB is empty)
npm run seed
```

---

## Running the Application

### Option A: Connect to Cloud Backend (Quickest)

The frontend is pre-configured to communicate with the hosted cloud backend (`https://athena-api-ailq.onrender.com/api`). You can start the desktop application immediately:

```bash
cd frontend
npm run dev
# Starts Vite on http://localhost:5180 and automatically launches the Electron window
```

Alternatively, run Vite and Electron in separate terminals:
```bash
# Terminal 1: Vite Dev Server
cd frontend
npm run dev:vite

# Terminal 2: Electron Shell
cd frontend
npm run dev:electron
```

### Option B: Run Full Local Stack

```bash
# Terminal 1: Local Backend Server
cd backend
npm run dev
# Server listens on http://localhost:5050

# Terminal 2: Frontend & Electron
cd frontend
npm run dev
```

---

## Packaging & Generating .dmg

Athena uses `electron-builder` to bundle the React application and Electron runtime into native executables.

From the `frontend/` directory:

```bash
cd frontend

# 1. Build the production bundle
npm run build

# 2. Package into an unpacked local release directory
npm run package

# 3. Build standalone macOS .dmg installer (or platform distributables)
npm run dist
```

To build a macOS `.dmg` specifically:
```bash
cd frontend
npm run build && npx electron-builder --mac dmg
```

Generated `.dmg` installers and release archives are output to `frontend/release/`:
- **macOS Installer:** `frontend/release/Athena-1.0.0-arm64.dmg`

---

## Testing

The backend includes automated test suites covering grading, negative marking calculation, race conditions, authentication, parameter spoofing, and CORS origin policies:

```bash
cd backend
npm test
```

### Test Coverage Highlights

- **Grading Unit Tests**: String normalization, option index vs. text matching, negative marking calculation, score floor at zero.
- **Submission Tests**: Idempotent re-submission prevention, score persistence, answer review authorization.
- **Proctoring Incident Tests**: `WINDOW_BLUR` and `FULLSCREEN_EXIT` recording, incident debouncing, audit log retrieval.
- **Authentication & Security**: Protected route verification, candidate ID spoofing rejection, single-attempt locks.
- **CORS Policies**: Allows Electron desktop (`file://` and `null`) origins and Vite local development while blocking unauthorized origins.

---

## Security & Proctoring Specifications

1. **Context Isolation**:
   - `preload.cjs` exposes strictly typed IPC methods through `window.electronAPI`.
   - Node integration is disabled in renderer windows.
2. **Tamper Prevention & Identity Check**:
   - Every request verifies candidate identity from the cryptographically signed JWT payload.
   - Any attempt to spoof candidate IDs in request bodies or URL parameters is rejected with `403 Forbidden`.
3. **Single-Attempt Enforcement**:
   - PostgreSQL row-level locks prevent concurrent duplicate submissions and race conditions.
4. **Time Tamper Resistance**:
   - Timers are authoritative and computed on the server based on database start times, immune to candidate system clock changes.
5. **CORS Whitelisting**:
   - Configured to permit requests originating from Electron desktop applications (`file://`, `null`) and verified development origins.

---

## API Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new candidate (`name`, `email`, `password >= 6`) |
| `POST` | `/api/auth/login` | Authenticate candidate and receive JWT token |

### Candidate Profile (`/api/users`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users/me` | Retrieve authenticated candidate profile and recent attempt summary |

### Examinations & Proctoring (`/api/exams`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/exams` | List all published exams available to the candidate |
| `GET` | `/api/exams/:id` | Fetch exam details and questions (starts attempt or resumes active session) |
| `GET` | `/api/exams/:id/timer` | Synchronize remaining exam time against authoritative server deadline |
| `POST` | `/api/exams/:id/answer` | Autosave selected answer or toggle review status |
| `POST` | `/api/exams/:id/incident`| Record a proctoring incident (`WINDOW_BLUR`, `FULLSCREEN_EXIT`, etc.) |
| `GET` | `/api/exams/:id/incidents`| Retrieve audit log of recorded incidents for an attempt |
| `POST` | `/api/exams/:id/submit` | Finalize attempt, calculate grades, and generate scorecard |
| `GET` | `/api/exams/session/active` | Retrieve candidate's currently active exam attempt |
| `GET` | `/api/exams/session/:attemptId` | Retrieve saved state for a specific active attempt |
| `GET` | `/api/exams/results/my-results` | List all past exam submissions and scores for candidate |
| `GET` | `/api/exams/results/:attemptId` | Fetch detailed scorecard, question review, and incident timeline |

### Health Check (`/api/health`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Lightweight service and database connectivity check |

---
