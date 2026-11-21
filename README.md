# CivicResolve

**AI-powered multilingual citizen grievance redressal portal for Indian municipalities, built with Google Gemini and Firebase.**

## For judges and evaluators

- **Live app:** https://agora-web--agora26.asia-southeast1.hosted.app
- **Evaluator guide:** https://agora-web--agora26.asia-southeast1.hosted.app/judges has one-click access to the Commissioner and department officer roles (no password) and a five-minute walkthrough.
- **Citizen flow:** `/lodge` → submit any civic photo with a description in any Indian language → registration number → `/track`.
- **Officer console:** `/admin` → Overview, Grievance register, SLA & escalations, Map, AI insights, Department performance, Public notices, Audit log.
- The live register is pre-loaded with 16 synthetic grievances in 8 languages. Demo OTPs are shown on screen.

| Problem | How CivicResolve solves it | Where to see it |
| --- | --- | --- |
| Complaints are in many languages and reach the wrong office | Gemini multimodal triage reads photo + text in 8 languages, routes to 1 of 5 departments, sets severity, SLA and an English work order, and replies in the citizen's language | `/lodge` → acknowledgement slip |
| Duplicate complaints flood departments | 100 m geo radius + Gemini visual match merges duplicates and boosts priority | "+N merged" badges in the register |
| Cases are closed without real work | Gemini compares before and after photos; disposal is blocked unless the fix is visible | Console → case drawer → "Verify & dispose" |
| Overdue complaints are ignored | SLA timers, automatic L1→L3 escalation, AI-drafted escalation letters | Console → SLA & escalations; `/track` |
| Leaders lack a situational picture | Gemini Commissioner brief: hotspots, systemic patterns, prioritised actions | Console → AI insights |
| Citizens can't follow progress | Registration numbers, status timeline, officer remarks auto-translated, rating and reopen | `/track`, `/my` |
| AI outages break the service | Model failover chain with timeouts; keyword routing + AI re-triage queue if all models fail | Console → AI insights → AI engine status |

**Google technologies:** Gemini API (`@google/genai`, structured output, multimodal), Firebase Authentication (Google sign-in), Cloud Firestore, Firebase App Hosting (Cloud Run + Secret Manager).

**Security:** 3-tier RBAC enforced on every API route, signed HTTP-only sessions, captcha + OTP second factor + lockout for officers, citizen PII masked publicly. 21 automated tests (`npm test`).

CivicResolve routes multilingual infrastructure reports to municipal teams. Citizens can file reports and follow progress. Field staff work within their department, and the commissioner can reassign tickets or change priorities.

## What's in the portal

**Citizens:** home page in the style of a government portal (tricolour band, accessibility bar with A-/A/A+, contrast and English/हिन्दी), a 3-step **Lodge Grievance** wizard with a printable acknowledgement slip and registration number (`AGR-YYYY-NNNNNN`), **Track Status**, **My Grievances** (mobile OTP sign-in), rating and reopening of disposed cases, a public dashboard with charts and a map, the citizen charter with the escalation matrix, FAQ, and **CivicResolve Sahayak**, a Gemini helpdesk assistant.

**Officers (`/admin`):** Overview (KPIs, AI daily brief, needs-attention list), Grievance Register (search, filters, sort, bulk forward/priority/remind, CSV export, case drawer), SLA & Escalations (L1/L2/L3 board), Map & Hotspots, AI Insights (Commissioner brief, AI engine status, AI re-triage queue), Department Performance (Commissioner only), Public Notices (Commissioner only; shown in the site ticker), and Audit Log.

**Sign-in:** officers use User ID + password + server-rendered captcha, then a 6-digit OTP second factor. Accounts lock for 15 minutes after 5 failed attempts. Citizens use mobile OTP. Optional Google sign-in via Firebase Auth. Judge demo cards appear only when demo mode is on.

**AI resilience:** every Gemini call goes through a model failover chain with per-attempt timeouts. Overloaded models are skipped for 2 minutes. If every model is down, reports are still accepted with keyword routing and flagged for AI re-triage, and the Commissioner brief and helpdesk fall back to rule-based answers.

## Run locally

Use Node.js 20 or later.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Use **Load demo data** on the dashboard or console to add 16 multilingual sample grievances. Mobile `9000000000` owns a seeded grievance for trying the citizen flow.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Required for AI triage, verification, translation, brief and helpdesk |
| `GEMINI_MODEL` | Primary model (default `gemini-3.8-flash`) |
| `GEMINI_FALLBACK_MODELS` | Comma-separated failover chain (default `gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.5-flash`) |
| `CIVIC_SESSION_SECRET` | 32+ character session signing secret (required in production) |
| `CIVIC_PASSWORD_<ROLE>` | Officer passwords: `ADMIN`, `ROADS`, `SANITATION`, `WATER`, `ELECTRICAL`, `SAFETY` |
| `CIVIC_DEMO_LOGIN` | `true` enables judge demo cards and on-screen demo OTPs in production |
| `CIVIC_OTP_DISPLAY` | `true` shows OTPs on screen (simulated SMS gateway) without enabling demo cards |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Enables Google sign-in through Firebase Auth |
| `CIVIC_GOOGLE_OFFICERS` | Maps Google emails to officer roles, e.g. `you@gmail.com=admin;eng@gmail.com=roads` |

## Storage and deployment

Local runs without Application Default Credentials and all test runs use process-local memory. Set `CIVIC_STORE=memory` to force it. Records in memory reset when the process restarts. For local Firestore access, configure Application Default Credentials with `gcloud auth application-default login` or `GOOGLE_APPLICATION_CREDENTIALS` and set `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for your project.

For Firebase App Hosting, select this directory as the app root. Create the default Firestore database in `asia-south1` and grant the runtime identity Firestore access. Provision the `GEMINI_API_KEY` and `CIVIC_SESSION_SECRET` Secret Manager secrets and grant the App Hosting backend access to them. Use at least 32 random characters for the session secret. Add the official passwords as individual runtime secrets if enabling email/password sign-in.

Production deployments have judge demo access disabled by default. For a dedicated judge environment, set `CIVIC_DEMO_LOGIN=true`. This grants any visitor the listed demo roles, including commissioner.

For a standalone container:

```sh
docker build -t civicresolve .
docker run --rm -p 8080:8080 --env-file .env.local civicresolve
```

The container listens on port 8080. Supply the same runtime secrets and credentials on Cloud Run, which provides HTTPS for secure session cookies.

## Verification

```sh
npm test
npm run build
```

Vitest uses mocked Gemini responses and the in-memory repository. The suite covers the 100-meter boundary, duplicate merges, multilingual triage, spam rejection, status transitions, photo verification, role enforcement, SLA escalation, demo seeding, model failover and keyword fallback, captcha + OTP + lockout sign-in, citizen OTP and data masking, feedback/reopen ownership, notices, CSV export and escalation levels.
