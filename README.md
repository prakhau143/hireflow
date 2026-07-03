# HireFlow AI — AI-Powered Job Hunting Platform

> **Live Demo:** [https://hireflow-ai.vercel.app](https://hireflow-ai.vercel.app)  
> **GitHub:** [https://github.com/YOUR_USERNAME/hireflow](https://github.com/YOUR_USERNAME/hireflow)

HireFlow AI is a full-stack SaaS job-hunting dashboard that automates the tedious parts of job applications — paste LinkedIn hiring posts, let Groq AI parse them, get personalized match scores against your resume, and send outreach emails in one click.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Getting Started](#getting-started)
5. [Environment Variables](#environment-variables)
6. [API Documentation](#api-documentation)
7. [Deployment](#deployment)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [Screenshots](#screenshots)

---

## Features

### Authentication & Onboarding
- **JWT Authentication** — Secure register/login with bcrypt password hashing and 7-day token expiry
- **4-Step Onboarding** — New users complete profile (personal info → experience & skills → job preferences → resume upload) before accessing the dashboard
- **Auth Guards** — Protected routes redirect to `/login`; incomplete onboarding redirects to `/onboarding`

### Dashboard
- **Live Stats** — Jobs imported, matched jobs, archived jobs, and applications sent — all from the real database, zero mock data
- **Match Distribution Chart** — Bar chart showing how many jobs scored in each match bracket (90-100%, 80-90%, etc.)
- **Skills Demand Chart** — Animated horizontal bars showing which skills appear most in your job pool
- **Experience Distribution** — Donut chart of required experience across imported jobs
- **Recent Activity Feed** — Last 5 events from the activity log timeline

### Import Jobs *(Core Feature)*
- **Paste Any Text** — Paste raw LinkedIn posts, job descriptions, WhatsApp forwards, or any hiring text
- **Groq AI Parsing** — Llama 3.3 70B extracts: company name, role title, location, required skills, contact email, phone, hiring manager name, experience range
- **Preview Cards** — Parsed jobs shown as selectable cards before saving
- **Bulk Save** — Select/deselect individual jobs; save chosen ones to the database in one request
- **Activity Logging** — Every import is recorded in the activity log

### Jobs Board
- **Rich Job Cards** — Each card shows company, role, location, experience, match score ring (SVG), matched skills (green), missing skills (red), smart tags, and AI summary
- **Filter Sidebar** — Filter by minimum match score (slider), location type (remote/hybrid/onsite), experience range, and skills
- **Grid/List Toggle** — Switch between card grid and compact list view
- **Link to Job Detail** — Full AI analysis page per job

### Job Detail
- **Match Score Ring** — Animated SVG ring showing AI match percentage
- **AI Analysis Panel** — Groq-generated explanation of why this role suits you and what gaps exist
- **Skill Breakdown** — Matched skills (✅) vs. Missing skills (❌) side by side
- **Contact Information** — Hiring manager email and phone parsed from the original post
- **Application Actions** — "Prepare Application" and "Shortlist" buttons

### Resume Manager
- **Multi-Resume Support** — Upload and manage multiple PDF resumes
- **ATS Score Ring** — Animated SVG ring showing ATS compatibility score (0–100)
- **AI Analysis Results:**
  - **Strong Skills** — Skills that score well in ATS systems
  - **Missing Keywords** — Keywords commonly required but absent from resume
  - **Weak Sections** — Sections flagged for improvement
  - **Skill Gap Analysis** — Skills to add based on target jobs
  - **AI Suggestions** — Actionable improvement tips from Groq
- **Re-Analyze** — Re-run AI analysis on any existing resume
- **Upload New** — Replace or add resumes; AI analyzes immediately on upload

### Archives
- **Auto-Categorized** — Jobs automatically sorted into:
  - 🔴 Low Match (score below threshold)
  - ⭐ Missing Experience (years gap)
  - 📚 Missing Skills (critical skills absent)
  - 🕐 Expired Jobs (old postings)
- **Category Summary Cards** — Count of jobs per archive reason
- **Match Score Badges** — Each archived job shows its score with color-coded badge

### SMTP Manager
- **Full SMTP Configuration** — Host, port, username, encrypted password, from name/email
- **Test Connection** — Verify connectivity before sending any real emails
- **Live Status Badge** — Shows "Connected" (green) or "Not Tested" (gray)
- **Email Preview Modal** — See exactly how outreach emails will look before sending
- **Gmail App Password Tip** — Built-in helper for Gmail users

### Email Templates
- **Category-Based Filtering** — Templates organized by Python, Java, Backend, Frontend, Data Science, DevOps
- **Full CRUD** — Create, duplicate, delete templates via API
- **Variable Placeholders** — Use `{role}`, `{company}`, `{name}` in subject and body
- **Inline Preview** — Body text previewed in-card

### Activity Logs
- **Real-Time Timeline** — Every action (import, resume upload, SMTP test, application) recorded
- **Date-Grouped** — Events grouped by day with animated timeline connector
- **Color-Coded Icons** — Different icon and color per event type
- **Timestamps** — Exact time shown for each event

### Analytics
- **Top Skills in Demand** — Horizontal bar chart of most-requested skills
- **Match Score Distribution** — Bar chart of score buckets across all jobs
- **Experience Distribution** — Donut chart of experience levels required
- **Companies Hiring** — Bar chart of most active hiring companies
- **Locations Overview** — Top hiring cities with proportional bars
- **Empty State** — Clean prompt to import jobs when no data exists

### Settings
- **Profile Management** — Update name, email, role, location, LinkedIn, GitHub, portfolio URLs
- **Appearance** — Theme toggle (dark/light)
- **Notifications** — Email and in-app notification preferences
- **Security** — Change password
- **Danger Zone** — Account deletion with confirmation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS v4 (via @tailwindcss/vite) |
| Animations | Framer Motion |
| Charts | Recharts |
| State Management | Zustand (with localStorage persistence) |
| Server State | TanStack React Query v5 |
| HTTP Client | Axios (JWT interceptors + auto-logout on 401) |
| UI Components | Radix UI primitives |
| Icons | Lucide React |
| Toasts | React Hot Toast |
| Router | React Router v6 |
| Backend Framework | FastAPI (Python 3.11) |
| ORM | SQLAlchemy 2.0 (async) |
| Database | SQLite + aiosqlite (WAL mode) |
| Auth | python-jose (JWT) + passlib (bcrypt) |
| AI | Groq API (Llama 3.3 70B Versatile) |
| PDF Parsing | PyMuPDF (fitz) |
| Frontend Deploy | Vercel |
| Backend Deploy | Render |
| CI/CD | GitHub Actions |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Vercel)                  │
│  React 19 + TypeScript + Tailwind CSS v4             │
│  Zustand (auth state) + React Query (server state)   │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS / REST API
                   │ JWT Bearer token on every request
                   ▼
┌─────────────────────────────────────────────────────┐
│                 FastAPI (Render)                      │
│  /api/auth       → Register, Login                   │
│  /api/users      → Profile, Onboarding, Readiness    │
│  /api/jobs       → CRUD, Import/Parse, Stats         │
│  /api/resumes    → Upload, Analyze, Delete           │
│  /api/smtp       → Config, Test Connection           │
│  /api/templates  → Email Template CRUD               │
│  /api/logs       → Activity Timeline                 │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
    SQLite DB             Groq API
  (WAL mode,           (Llama 3.3 70B)
  aiosqlite)       Job parsing, Resume AI,
                   Email generation
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- A free [Groq API key](https://console.groq.com)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/hireflow.git
cd hireflow
```

### 2. Backend setup
```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Add your GROQ_API_KEY to .env

uvicorn main:app --reload --port 8000
```

### 3. Frontend setup
```bash
cd frontend
npm install

# Create .env.local
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing key — use a long random string |
| `GROQ_API_KEY` | ✅ | From [console.groq.com](https://console.groq.com) — free tier available |
| `DATABASE_URL` | ✅ | SQLite: `sqlite+aiosqlite:///./hireflow.db` |
| `ALGORITHM` | ✅ | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ✅ | `10080` (7 days) |
| `ALLOWED_ORIGINS` | ✅ | Frontend URLs, e.g. `["http://localhost:5173","https://hireflow.vercel.app"]` |

### Frontend (Vercel Environment Variables)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ✅ | Backend URL, e.g. `https://hireflow-api.onrender.com` |

---

## API Documentation

The FastAPI backend auto-generates interactive docs:

- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

### Key Endpoints

#### Authentication
```
POST /api/auth/register    Register a new user, returns JWT
POST /api/auth/login       Login, returns JWT
GET  /api/auth/me          Get current user info
```

#### Users
```
GET    /api/users/me              Get full profile
POST   /api/users/onboarding      Complete onboarding (sets onboarding_complete=true)
PATCH  /api/users/profile         Update profile fields
GET    /api/users/readiness       Check if ready to send applications (resume + SMTP)
```

#### Jobs
```
GET   /api/jobs/                  List all jobs (supports ?status=, ?min_match=)
GET   /api/jobs/{id}              Get single job
POST  /api/jobs/import/parse      AI-parse pasted text → returns job array
POST  /api/jobs/import/save       Save parsed jobs to database
GET   /api/jobs/stats/dashboard   Stats for dashboard charts
```

#### Resumes
```
GET   /api/resumes/               List all resumes
POST  /api/resumes/upload         Upload PDF → AI analysis → save
POST  /api/resumes/{id}/analyze   Re-analyze existing resume
DELETE /api/resumes/{id}          Delete resume
```

#### SMTP
```
GET   /api/smtp/                  Get SMTP config
POST  /api/smtp/                  Create SMTP config
PUT   /api/smtp/{id}              Update SMTP config
POST  /api/smtp/{id}/test         Test SMTP connection
```

#### Templates
```
GET    /api/templates/            List all templates
POST   /api/templates/            Create template
PUT    /api/templates/{id}        Update template
DELETE /api/templates/{id}        Delete template
```

#### Activity Logs
```
GET   /api/logs/                  Get activity timeline (last 50 events)
```

---

## Deployment

### Frontend → Vercel

1. Import your GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Set root directory: `frontend`
3. Framework: Vite (auto-detected)
4. Add environment variable: `VITE_API_URL` = your Render backend URL
5. Deploy

Or via CLI:
```bash
cd frontend
npx vercel --prod
```

### Backend → Render

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect GitHub repo, set root to `backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables (SECRET_KEY, GROQ_API_KEY, ALLOWED_ORIGINS)
6. Create a **Disk** (1GB) mounted at `/opt/render/project/src/backend` to persist SQLite

Or use the `render.yaml` in the repo root — Render detects it automatically.

---

## CI/CD Pipeline

The GitHub Actions pipeline (`.github/workflows/ci-cd.yml`) runs on every push:

```
Push to main
     │
     ├── Frontend CI ──────────────────────────────────┐
     │    • npm ci                                      │
     │    • tsc --noEmit (type-check)                   │  Both pass?
     │    • npm run lint                                 ├──────────────→ Deploy Frontend (Vercel)
     │    • npm run build                               │                Deploy Backend (Render)
     │                                                  │
     └── Backend CI ────────────────────────────────────┘
          • pip install -r requirements.txt
          • python -m compileall
          • import check
```

### Required GitHub Secrets

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel dashboard → Settings → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link` |
| `VITE_API_URL` | Your Render backend URL |
| `RENDER_DEPLOY_HOOK_URL` | Render → Service → Settings → Deploy Hook |

### Setup Steps
```bash
# 1. Link frontend to Vercel (generates .vercel/project.json)
cd frontend && npx vercel link

# 2. Add secrets to GitHub repo
# GitHub → Settings → Secrets and variables → Actions → New secret

# 3. Push to main — the pipeline runs automatically
git push origin main
```

---

## User Flow

```
Register → Complete 4-Step Onboarding → Dashboard (empty states)
    ↓
Import Jobs (paste LinkedIn posts → AI parses → save)
    ↓
Jobs Board (filter, view match scores, see AI analysis)
    ↓
Upload Resume (AI analyzes: ATS score, gaps, suggestions)
    ↓
Configure SMTP (Gmail/custom → test connection)
    ↓
Create Email Template (role-specific outreach)
    ↓
Prepare Application (AI selects best resume, generates email)
    ↓
Activity Logs (full audit trail) + Analytics (trends)
```

---

## Design System

- **Theme:** Glassmorphism — `backdrop-filter: blur(20px)`, `rgba(255,255,255,0.05)` backgrounds
- **Color Palette:** Indigo (#4F46E5) → Cyan (#06B6D4) gradient as primary; dark base `#0a0f1e`
- **Typography:** System font stack, tight tracking, weight hierarchy
- **Animations:** Framer Motion — staggered card entrances, spring physics, layout transitions
- **Match Scores:** Color-coded SVG rings (green ≥80, blue 60-79, amber 40-59, gray <40)
- **Icons:** Lucide React — consistent 4px stroke width

---

## License

MIT — free to use, modify, and deploy.
