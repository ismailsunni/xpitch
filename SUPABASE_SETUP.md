# xPitch — Supabase setup

xPitch stays a static front-end; Supabase is the whole backend (Postgres + Auth
+ Storage + RLS), called from the browser with the **public anon key**. All
security is enforced by Row Level Security. Do these once.

## 1. Create the project
1. Go to https://supabase.com → **New project**. Pick a region near you
   (e.g. Singapore for Yogyakarta). Save the database password.
2. Project → **Settings → API**. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   (The anon key is meant to be public — safe to ship in the bundle under RLS.)

## 2. Run the migrations
Open **SQL Editor → New query**, paste and **Run** each in order:
1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — schema,
   RLS, the private `fits` storage bucket, the signup trigger, and the seeded
   "Amikom Soccer Arena" pitch.
2. [`supabase/migrations/0002_profile_birthdate.sql`](supabase/migrations/0002_profile_birthdate.sql)
   — adds `profiles.birth_date` (for auto age / max-HR).

## 3. Enable auth providers
**Authentication → Providers**:
- **Email**: enable, turn on **magic link** (passwordless).
- **Google**: enable and paste a Google OAuth **Client ID / Secret**
  (create at https://console.cloud.google.com → APIs & Services → Credentials →
  OAuth client, type *Web application*). Authorized redirect URI:
  `https://<your-project-ref>.supabase.co/auth/v1/callback`.

**Authentication → URL Configuration**:
- **Site URL**: `https://ismailsunni.id/xpitch/`
- **Redirect URLs** (add all): `https://ismailsunni.id/xpitch/`,
  `https://ismailsunni.github.io/xpitch/`, `http://localhost:5173/xpitch/`

## 4. Give the app the keys
**Local dev** — create `.env.local` in the repo root (git-ignored):
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```
**Production (GitHub Pages build)** — repo → **Settings → Secrets and variables →
Actions → New repository secret**, add both:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
(The deploy workflow injects them into `npm run build`.)

## Notes
- Until the keys exist, the app runs exactly as today (analyze `.fit` locally);
  login/save are simply hidden.
- `unlisted` rows are viewable by anyone with the link (RLS can't hide a guessed
  id); public *listing* is filtered to `visibility = 'public'` in queries.
- Strava import is out of scope for now (its token exchange needs a secret →
  a future Supabase Edge Function).
