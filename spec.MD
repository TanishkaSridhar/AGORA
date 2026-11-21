# CivicResolve — AI-Powered Multilingual Civic Triage & Resolution Platform (`SPEC.md`)

## 1. Project Overview
**CivicResolve** is a mobile-first, AI-powered civic reporting and municipal governance platform built for the GDG Hackathon. Citizens report infrastructure problems via photo, voice/text in **any Indian regional language (Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, English)**, and GPS coordinates. Google Gemini Multimodal AI (`gemini-3.8-flash`) analyzes the visual hazard, translates regional citizen complaints into formal English engineering work orders while replying to the citizen in their native language, detects **geo-spatial + semantic duplicates** within 100 meters to auto-upvote existing tickets, verifies **"Before vs. After" resolution photos** using AI visual comparison, predicts cascading infrastructure risks, and enforces **3-Tier Role-Based Access Control (RBAC)** across public citizens, department field engineers, and the Municipal Commissioner.

## 2. Tech Stack & Deployment Architecture
- **Framework:** Next.js 15 (App Router, TypeScript, React 19, Tailwind CSS, Lucide Icons)
- **AI SDK:** `@google/genai` (Official Google Gen AI SDK, server-side only)
- **Primary AI Model:** `gemini-3.8-flash` (with strict structured JSON output via `responseSchema`)
- **Database:** Firebase Firestore (`(default)` database in `asia-south1`, accessed server-side via `firebase-admin` using Application Default Credentials on Cloud Run / App Hosting, with automatic in-memory fallback during `npm test` or when local credentials are absent)
- **Auth & RBAC:** Server-signed HTTP-only session cookies (`src/lib/auth.ts`) with Next.js API route enforcement + 1-Click Judge Demo Login cards on `/login`
- **Hosting & Secrets:** Firebase App Hosting (`apphosting.yaml`) backed by Cloud Run, injecting `GEMINI_API_KEY` from Google Cloud Secret Manager
- **Testing:** Vitest (`vitest`) with unit and API tests in `tests/civic.test.ts`

## 3. Core & Innovative Differentiator Features
1. **Multilingual Citizen-to-Municipality Bridge (Regional Language Support)**
   - Citizens type or dictate complaints in **Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, or English** (plus UI language switcher).
   - Gemini detects the input language, translates the issue into a standardized **English Municipal Engineering Work Order**, and generates a **Citizen Acknowledgement & Safety Advisory in the citizen's exact native language**.
2. **Geo-Spatial + AI Semantic Duplicate Remover (`100m` Haversine + Visual Match)**
   - Before creating a new ticket, the backend queries open issues within a **100-meter radius** (Haversine distance on `lat`/`lng` or matching normalized ward/landmark strings) in the same department.
   - Gemini compares the newly uploaded photo + description against nearby open issues. If it matches an existing problem, CivicResolve **merges the report**, increments `upvotes` (boosting priority), appends the photo as corroborating evidence, and notifies the user: *"Merged with existing nearby report #ID — priority boosted!"*
3. **AI Visual Proof-of-Resolution Verifier ("Before vs. After" Audit)**
   - When marking an issue `RESOLVED`, department field staff or admins upload a completion photo.
   - Gemini visually compares the original **Before** photo with the **After** photo to verify whether the hazard is genuinely fixed, outputting `resolutionVerified: boolean` and a `verificationNotes` badge (`AI Verified Fix`) to prevent fake/premature ticket closures.
4. **Cascading Risk & Monsoon/Public-Safety Predictor**
   - Gemini evaluates **secondary compounding hazards** (e.g., an open drain next to an exposed electrical box during monsoon season, or a pothole near a school zone) and attaches a `cascadingRiskAlert` banner.
5. **One-Tap Citizen Legal / RTI Escalation Draft Generator**
   - If an issue exceeds its `estimatedSlaHours`, citizens can generate a formal, date-stamped municipal escalation letter / RTI-ready grievance notice in English or their regional language with one click.
6. **3-Tier Municipal Role-Based Access Control (RBAC)**
   - **Tier 1 — Public Citizen (No Login Required):** Submit civic reports, browse public dashboard, upvote issues, and generate SLA/RTI escalation letters.
   - **Tier 2 — Department Field Staff / Junior Engineer (Intermediate Auth, Scoped by Department):** Authenticated per department (`roads@civicresolve.gov`, `sanitation@civicresolve.gov`, `water@civicresolve.gov`, `electrical@civicresolve.gov`, `safety@civicresolve.gov`). Can **only** view and update tickets belonging to their assigned department (`OPEN` -> `IN_PROGRESS` -> `RESOLVED` with Before/After photo upload). Cannot modify other departments' tickets, reassign departments, or override AI severity.
   - **Tier 3 — Municipal Commissioner / Super Admin (Higher Authority Auth):** Authenticated via `admin@civicresolve.gov`. Full cross-department visibility across all 5 departments, ability to reassign misrouted tickets between departments, override severity/SLA priorities on cascading hazards, audit SLA breaches, and inspect all AI-verified resolutions.

## 4. Data Model (Firestore `issues` Collection & Auth Session)
```typescript
export type Department =
  | "Roads & Infrastructure"
  | "Sanitation & Solid Waste"
  | "Water Supply & Drainage"
  | "Street Lighting & Electrical"
  | "Public Safety & Parks";

export type IssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export type UserRole = "CITIZEN" | "DEPT_STAFF" | "SUPER_ADMIN";

export interface AuthSession {
  email: string;
  name: string;
  role: UserRole;
  department?: Department; // Required when role === "DEPT_STAFF"
}

export interface CivicIssue {
  id: string;
  title: string;
  originalDescription: string;
  translatedDescription: string;
  detectedLanguage: string; // e.g., "Tamil", "Hindi", "English"
  imageBase64: string; // Compressed JPEG data URL
  corroboratingImages: string[]; // Additional photos from merged duplicate reports
  resolutionImageBase64?: string;
  location: {
    address: string;
    lat?: number;
    lng?: number;
  };
  aiTriage: {
    category: string;
    department: Department;
    severity: number; // 1 (Low) to 5 (Critical Emergency)
    urgencyLabel: "Low" | "Moderate" | "High" | "Critical";
    confidence: number; // 0.0 to 1.0
    hazardSummary: string;
    cascadingRiskAlert?: string;
    recommendedAction: string; // Formal English work order
    citizenReplyNative: string; // Confirmation & safety tip in citizen's regional language
    estimatedSlaHours: number;
    isValidCivicIssue: boolean;
  };
  resolutionVerification?: {
    verified: boolean;
    confidence: number;
    notes: string;
  };
  status: IssueStatus;
  assignedDepartment: Department; // Defaults to aiTriage.department; mutable only by SUPER_ADMIN
  handledBy?: string; // Email of department staff or admin who updated status
  upvotes: number;
  duplicateMergeCount: number;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

## 5. UI Pages & User Experience (`src/app/...`)
1. **Home / Report Issue (`/`)**
   - Mobile-first civic reporting card with camera capture / file upload (`capture="environment"`), client-side canvas compression (max 1024px, JPEG 0.8), language selector + Web Speech API voice-to-text mic button, and one-tap GPS auto-fill with manual ward/street fallback.
   - Multi-step live AI triage progress indicator and result card (showing either the new **AI Triage Card** with native-language reply + cascading risk alert, or the **Duplicate Merged Card** with boosted priority).
2. **Official & Department Portal Login (`/login`)**
   - Email/password login form for municipal personnel (`admin@civicresolve.gov`, `roads@civicresolve.gov`, `sanitation@civicresolve.gov`, `water@civicresolve.gov`, `electrical@civicresolve.gov`, `safety@civicresolve.gov`).
   - **1-Click Judge Demo Access Cards:** Instant one-click login buttons for *Municipal Commissioner (Super Admin)*, *Roads Field Engineer (Dept Staff)*, and *Sanitation Field Officer (Dept Staff)* so judges can verify RBAC enforcement immediately.
3. **Live Civic Command Dashboard (`/dashboard`)**
   - Displays current active role badge in header (e.g., `Public Citizen View`, `Dept Staff: Roads & Infrastructure`, or `Super Admin: Municipal Commissioner`) with quick Switch Role / Logout link.
   - KPI summary cards: Total Civic Reports, Duplicates Prevented, Critical/High Open Hazards, AI-Verified Resolutions.
   - Role-aware controls:
     - **Citizens:** Read-only view, upvote button, and SLA/RTI Escalation Letter generator.
     - **Department Staff (`DEPT_STAFF`):** Automatically scoped/highlighted to their department; can update `status` and upload "After" photos for AI Resolution Verification **only** on tickets in their department (other departments' action buttons are disabled with a lock badge).
     - **Super Admin (`SUPER_ADMIN`):** Full access across all departments, including a **Reassign Department** dropdown and **Override Severity** control on every ticket.
4. **Issue Detail & Audit Trail (`/issues/[id]`)**
   - Full side-by-side Before/After photo comparison, duplicate corroboration gallery, bilingual citizen/official breakdown, audit trail (`handledBy`), and one-click Escalation Letter modal.

## 6. API Routes (`src/app/api/...`)
1. **`POST /api/auth/login` & `POST /api/auth/logout` & `GET /api/auth/session`**
   - Validates credentials or demo role selection, sets a signed HTTP-only cookie (`civic_session`), and returns the `AuthSession` object.
2. **`POST /api/triage` (and `POST /api/issues`)**
   - Public endpoint (`CITIZEN` or any role). Accepts `{ imageBase64, description, preferredLanguage, location }`.
   - Calls `ai.models.generateContent({ model: "gemini-3.8-flash", ... })` using `@google/genai` with `responseMimeType: "application/json"` and `responseSchema`.
   - Rejects non-civic/spam images (`isValidCivicIssue === false`) with HTTP `400`.
   - Runs **Geo-Semantic Deduplication** (`100m` Haversine radius in `src/lib/geo.ts` + Gemini match check); merges duplicates or persists new `CivicIssue` to Firestore `issues` collection.
3. **`GET /api/issues` & `POST /api/issues/seed`**
   - Lists issues sorted by severity + recency, with optional `?department=` and `?status=` filters.
   - `POST /api/issues/seed` populates 4 realistic multilingual Indian civic reports across departments for instant demo readiness.
4. **`PATCH /api/issues/[id]`**
   - Public `upvote` action allowed for all users.
   - **RBAC Enforcement on Mutations:**
     - Status updates (`OPEN` -> `IN_PROGRESS` -> `RESOLVED`) and `resolutionImageBase64` (triggers **AI Visual Resolution Verification** via `gemini-3.8-flash`) require `DEPT_STAFF` (whose `session.department === issue.assignedDepartment`) OR `SUPER_ADMIN`. Returns HTTP `403 Forbidden` if a department staff member attempts to modify another department's ticket or if an unauthenticated citizen attempts to change status.
     - Reassigning `assignedDepartment` or overriding `severity` strictly requires `SUPER_ADMIN` (returns HTTP `403 Forbidden` otherwise).

## 7. Deployment, Config & Verification Criteria
1. **`apphosting.yaml`** (root directory):
   ```yaml
   runConfig:
     cpu: 1
     memoryMiB: 512
     minInstances: 0
     maxInstances: 2
     concurrency: 80
   env:
     - variable: GEMINI_API_KEY
       secret: GEMINI_API_KEY
     - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
       value: agora26
   ```
2. **`next.config.ts` / `next.config.mjs`:** Set `output: "standalone"` and `images: { unoptimized: true }`.
3. **`Dockerfile`:** Multi-stage Node 20 Alpine production Dockerfile for Next.js standalone output.
4. **`.gitignore`:** Must ignore `.env`, `.env.local`, `.env*.local`, `node_modules`, `.next`, and `firebase-debug.log`.
5. **Unit & Integration Tests (`tests/civic.test.ts`):**
   - Test Haversine 100m distance calculation and geo-semantic duplicate merging logic.
   - Test multilingual triage schema validation (Tamil/Hindi input -> English work order + native reply) with mocked `@google/genai`.
   - Test spam/invalid image rejection (`isValidCivicIssue: false`).
   - Test Before/After resolution verification logic.
   - Test **3-Tier RBAC enforcement**: verify `DEPT_STAFF` can update their own department's ticket, receives `403` when attempting to modify another department's ticket or reassign departments, and `SUPER_ADMIN` can reassign departments and override severity.
6. **Build & Test Gate:** Both `npm test` and `npm run build` must exit with code `0` with zero TypeScript or ESLint errors.