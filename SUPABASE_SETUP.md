# Supabase setup — CarPool Connect

This app supports **Supabase** (Postgres, Auth, Realtime) for production, with **SQLite + JWT** as a local fallback for development and tests.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (backend only, never expose in frontend)

## 2. Run the database migration

### Option A — Supabase CLI (recommended)

```powershell
# One-time: install CLI & init (already done in this repo)
npx supabase init

# One-time: log in (opens browser — needs your Supabase account)
npx supabase login

# Link this folder to your cloud project
npx supabase link --project-ref rejqxwtyisasykblbvyy

# Create a new migration file (edit the generated .sql in supabase/migrations/)
npx supabase migration new my-change-name

# Push all local migrations to cloud
npm run supabase:db:push
```

**Without `supabase link`** (uses `backend/.env` database password instead):

```powershell
npm run supabase:db:push
```

Project ref: **rejqxwtyisasykblbvyy**

### Option B — SQL Editor (manual)

In the Supabase dashboard, open **SQL Editor** and run:

```
supabase/migrations/001_initial_schema.sql
```

This creates tables, indexes, RLS policies, and enables Realtime on `notifications`, `carpool_requests`, and `live_locations`.

## 3. Configure environment

**Backend** (`backend/.env`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=still-required-for-legacy-fallback
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
```

**Frontend** (`frontend/.env`):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 4. Seed roster users (optional)

With Supabase configured, import the Logica roster:

```powershell
cd backend
node scripts/import-roster.js
```

This creates Supabase Auth users and links them to `public.users.auth_id`.

Demo account (SQLite seed): `priya.sharma@company.com` / `demo123`

## 4b. Supabase Auth emails (register & password reset OTP)

When `SUPABASE_*` keys are set, **verification codes for register and forgot-password are sent by Supabase**, not Gmail.

1. In Supabase dashboard → **Authentication → Providers → Email** — ensure Email is **enabled**.
2. Open **Authentication → Email Templates → Magic Link** (used for OTP) and confirm the body includes the token, e.g. `{{ .Token }}`.
3. Optional: **Authentication → URL Configuration** — set **Site URL** to your app URL (e.g. your Cloudflare tunnel or production domain).

Gmail (`GMAIL_USER` / `GMAIL_APP_PASSWORD`) is still optional for **welcome emails** and **carpool notification alerts**.

## Architecture

| Layer | With Supabase | Without Supabase (dev/tests) |
|-------|---------------|------------------------------|
| Database | Postgres via `supabaseStore.js` | SQLite via `store.js` |
| Auth | Supabase Auth + Express BFF | JWT + bcrypt |
| Auth OTP emails | Supabase (`signInWithOtp`) | Gmail SMTP (or dev mode) |
| Realtime | Supabase Realtime subscriptions | Socket.io |
| Live map | `POST /api/location/update` + Realtime | Socket.io `location:update` |

The Express API remains the main backend-for-frontend. The frontend uses Supabase Realtime directly for notifications and live colleague locations when env vars are set.

## 5. Run locally

```powershell
# Terminal 1 — backend
cd backend
npm install
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Public tunnel (mobile testing):

```powershell
npm run fix:tunnel
```

## Verify

```powershell
cd backend && npm test
cd frontend && npm run build
curl http://localhost:3001/api/health
```

Health response should show `"engine": "supabase"` and `"realtime": "supabase"` when configured correctly.

## Security notes

- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `.env` files.
- RLS policies restrict users to their own notifications and live location writes.
- The service role key is used only on the Express server for admin operations (OTP, email queue, seeding).
