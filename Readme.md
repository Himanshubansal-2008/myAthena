# Athena — Institutional Examination & Proctoring Platform

Athena is a secure desktop examination and proctoring platform designed for institutional assessments. Built with **React**, **Vite**, **Electron**, **Express**, and **Prisma (PostgreSQL)**, Athena provides an air-tight, monitored environment for online examinations with real-time proctoring integrity, server-authoritative timer enforcement, automated grading, and comprehensive candidate result audits.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Packaging for Production](#packaging-for-production)
- [Testing](#testing)
- [Security & Proctoring Specifications](#security--proctoring-specifications)
- [API Reference](#api-reference)

---

## Key Features

- **Candidate Authentication & Secure Enrollment**:
  - JWT-based authentication with bcrypt password hashing.
  - Candidate registration with validation requiring a minimum 6-character password.
- **Controlled Desktop Environment**:
  - Built with Electron featuring a secure IPC bridge (`contextIsolation: true`, `nodeIntegration: false`).
  - Dual-mode loading: connects to local Vite development server during development, and loads compiled static bundles (`dist/index.html`) when packaged or in production.
  - Full-screen lock and detection with automated UI synchronization.
  - Window blur and focus monitoring to detect window/tab switching.
- **Hardware & Environment Readiness**:
  - Pre-exam check verifying camera, microphone, fullscreen authorization, and network connectivity before entering an exam.
- **Live Examination Room**:
  - Real-time countdown timer synchronized with authoritative server deadlines.
  - Instant question autosave with review marking (`Mark for Review`).
  - Question palette with dynamic status tracking (Answered, Unanswered, Marked for Review).
  - Clean, responsive candidate interface with immediate navigation between questions.
- **Server-Authoritative Integrity & Grading**:
  - Single-attempt enforcement per candidate.
  - PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) preventing race conditions and double submissions.
  - Automated grading engine supporting question-level marks and negative marking penalties.
  - Automatic submission when the exam timer expires.
- **Proctoring Incident Audit Trail**:
  - Real-time logging of violations (`WINDOW_BLUR`, `FULLSCREEN_EXIT`, `CAMERA_STOPPED`).
  - Incident debouncing and tamper-proof server timestamps.
  - Post-exam incident timeline and summary for proctor evaluation.
- **Exam History & Detailed Review**:
  - Candidate past attempt history with authoritative scorecards.
  - Detailed question-by-question review with candidate choices and correct answers.

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

### Technologies

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, React Router 6 (`HashRouter`), Lucide Icons, Vite 5 |
| **Desktop Shell** | Electron 29, `electron-builder` 26 |
| **Backend API** | Node.js, Express 5, CORS, JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| **Database & ORM** | PostgreSQL, Prisma ORM 6 |
| **Testing** | Node.js native test runner & assertions |

---

## Project Structure

```
myAthena/
├── backend/
│   ├── index.js               # Express server entry point & CORS configuration
│   ├── middleware/
│   │   └── authMiddleware.js  # JWT authentication & identity tamper verification
│   ├── prisma/
│   │   └── schema.prisma      # PostgreSQL models (User, Exam, Question, Attempt, Result, etc.)
│   ├── routes/
│   │   ├── auth.js            # /api/auth/register, /api/auth/login
│   │   ├── exams.js           # Exam sessions, autosave, submission, results & incidents
│   │   └── user.js            # Candidate profile & attempt history
│   ├── scripts/
│   │   └── seed_exams.js      # Database seeder for sample examinations
│   ├── tests/
│   │   ├── auth_authorization.test.js # Auth, access control & CORS test suite
│   │   └── grading.test.js    # Scoring, negative marking & submission test suite
│   └── utils/
│       └── grading.js         # Core grading calculation logic
├── frontend/
│   ├── electron/
│   │   ├── main.cjs           # Electron main process (Vite dev server / dist loader)
│   │   └── preload.cjs        # Context bridge exposing electronAPI
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Exam portal & past performance
│   │   │   ├── ExamInstructions.jsx # Instructions & technical rules
│   │   │   ├── ExamReadiness.jsx    # System hardware & permission checks
│   │   │   ├── ExamResults.jsx      # Authoritative score report & review
│   │   │   ├── ExamRoom.jsx         # Live exam session & question navigation
│   │   │   ├── Login.jsx            # Candidate login
│   │   │   └── Register.jsx         # Candidate registration
│   │   ├── App.jsx            # Client routes & protected navigation
│   │   ├── context.jsx        # Auth context & state provider
│   │   └── index.css          # Core CSS variables & theme tokens
│   ├── vite.config.js         # Vite configuration with relative base (`./`)
│   └── package.json           # Frontend dependencies, scripts & electron-builder config
└── Readme.md                  # Project documentation
```

---

## Prerequisites

- **Node.js**: `v18.0.0` or higher (Node 20+ recommended)
- **npm**: `v9.0.0` or higher
- **PostgreSQL**: `v14` or higher running locally or accessible via network

---

## Environment Configuration

### Backend (`backend/.env`)

Create a `.env` file inside the `backend/` directory:

```env
PORT=5050
DATABASE_URL="postgresql://<username>:<password>@localhost:5432/myathena_desktop_project?schema=public"
JWT_SECRET="your-secure-random-jwt-secret-key"
ALLOWED_ORIGINS="http://localhost:5180"
```

---

## Installation & Setup

### 1. Clone Repository & Install Dependencies

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

### 2. Database Migration & Seeding

From the `backend/` directory:

```bash
cd backend

# Run Prisma migrations
npx prisma migrate dev --name init

# (Optional) Seed the database with sample exams
node scripts/seed_exams.js
```

---

## Running the Application

### Development Mode

Run the backend and frontend concurrently:

**Terminal 1 — Backend API:**
```bash
cd backend
npm run dev
# Server starts on http://localhost:5050
```

**Terminal 2 — Frontend (Vite + Electron):**
```bash
cd frontend
npm run dev
# Starts Vite on http://localhost:5180 and automatically launches Electron
```

Alternatively, you can run Vite and Electron individually:
```bash
cd frontend
npm run dev:vite       # Starts Vite dev server on port 5180
npm run dev:electron   # Launches Electron targeting the local app
```

---

## Packaging for Production

Athena uses `electron-builder` to package the React client and Electron shell into standalone executables. In production, Electron automatically loads the compiled static bundle from `frontend/dist/index.html` via the `file://` protocol.

```bash
cd frontend

# Build frontend and package into an unpacked directory (release/)
npm run package

# Build frontend and generate distributable installers (DMG / NSIS / AppImage)
npm run dist
```

Packaged outputs are saved to `frontend/release/`.

---

## Testing

The backend includes test suites covering evaluation, scoring calculations, incident recording, authentication, parameter spoofing, and CORS origin policies.

```bash
cd backend
npm test
```

### Test Coverage Highlights

- **Grading Unit Tests**: String matching, option index vs. text matching, negative marking calculations, zero-score flooring.
- **Submission Integration Tests**: Idempotent re-submission, score persistence, answer review authorization.
- **Proctoring Incident Tests**: `WINDOW_BLUR` and `FULLSCREEN_EXIT` recording, incident debouncing, audit trail retrieval.
- **Authentication & Authorization**: Protected endpoint rejections, candidate ID spoofing prevention, single-attempt locking, and published exam restrictions.
- **CORS Tests**: Electron desktop (`null` and `file://`) origins, local Vite frontend, and malicious origin rejections.

---

## Security & Proctoring Specifications

1. **Password Policy**:
   - Minimum 6 characters required on candidate enrollment.
2. **Context Isolation**:
   - `preload.cjs` exposes only necessary IPC methods through `window.electronAPI`.
   - Node integration is disabled in renderer windows.
3. **Session Ownership & Tamper Prevention**:
   - Every request verifies candidate identity from the JWT payload.
   - Candidate ID spoofing in request bodies or query params is rejected (`403 Forbidden`).
4. **Race Condition Prevention**:
   - PostgreSQL row-level locks prevent concurrent duplicate submissions.
5. **CORS Whitelisting**:
   - Configured to permit requests originating from Electron desktop applications (`file://`, `null`) and verified development origins.

---

## API Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new candidate (name, email, password >= 6 characters) |
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