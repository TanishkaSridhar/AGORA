# CivicResolve

CivicResolve routes multilingual infrastructure reports to municipal teams. Citizens can file reports and follow progress. Field staff work within their department, and the commissioner can reassign tickets or change priorities.

## Run locally

Use Node.js 20 or later.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Set `GEMINI_API_KEY` in `.env.local` to use reporting, duplicate matching, resolution verification, and escalation drafts. The default model is `gemini-3.8-flash`. Set `GEMINI_MODEL` to override it.

Use **Load demo reports** on the dashboard to populate four multilingual examples with synthetic evidence photos. **Judge demo access** on the sign-in page lets you try the commissioner, roads, and sanitation roles. For password login, set the corresponding `CIVIC_PASSWORD_ADMIN`, `CIVIC_PASSWORD_ROADS`, `CIVIC_PASSWORD_SANITATION`, `CIVIC_PASSWORD_WATER`, `CIVIC_PASSWORD_ELECTRICAL`, or `CIVIC_PASSWORD_SAFETY` value and sign in as the matching `@civicresolve.gov` account.

For the live workflow, upload a photo, describe the hazard, and add GPS coordinates or a ward, street, or landmark. Browser support and permissions determine whether voice input and GPS are available. Staff start work and upload an After photo. An unsuccessful visual verification leaves the ticket in progress and records the verification notes. Citizens can draft an SLA escalation letter when a ticket becomes overdue.

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

Vitest uses mocked Gemini responses and the in-memory repository. The suite covers the 100-meter boundary, duplicate merges, multilingual triage, spam rejection, status transitions, photo verification, role enforcement, SLA escalation, and demo seeding.

## Commit sequence

Run these commands from the application directory. Each step stages only its listed files.

```sh
git add spec.MD .gitignore package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts eslint.config.mjs src/lib src/app/api public/demo
git commit -m "Build CivicResolve triage and municipal API"

git add src/components src/app/layout.tsx src/app/globals.css src/app/page.tsx src/app/login src/app/dashboard src/app/issues
git commit -m "Add citizen reporting and municipal dashboard"

git add apphosting.yaml Dockerfile .dockerignore tests/civic.test.ts README.md
git commit -m "Add deployment config, verification suite, and setup guide"
```
