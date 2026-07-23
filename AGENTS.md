# xPitch

Front-end football/mini-soccer/futsal match analyzer. Upload a `.fit` file → positional
heatmap, running/sprint/HR stats and football metrics, parsed in the browser. Accounts
(save/share matches, pitches, history) are Supabase-backed.

## Stack & deploy

- Vue 3 + Vite + TypeScript. Router: history mode, base `/xpitch/`.
- Backend: Supabase only (Postgres + Auth + Storage + RLS + Edge Functions); browser uses the anon key.
  Migrations in `supabase/migrations/`. `.env.local` holds the anon key (gitignored).
- Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml` (Actions).
  `.fit` is gitignored except `public/samples/*.fit` (the bundled "Load sample").

## Commands

- `npm run dev` · `npm run build` · `npm run typecheck` (`vue-tsc --noEmit`).
- `npx supabase db push` applies linked-project migrations. Deploy Strava functions with
  `npx supabase functions deploy strava-connect strava-callback strava-sync strava-import strava-disconnect`.

## Conventions

- Don't commit unless asked; the user reviews the diff first.
- The user runs tests. Verify UI changes by driving the real app: `npm run dev`, then a
  headless-Chrome (Playwright) screenshot. `/analyze#autosample` loads the sample into the
  dashboard; `#autodemo[/tab]` and `#autoload=<url>` also exist.
- Keep changes concise (matches the global instruction).

## Architecture

- `src/lib/` — typed logic: `analytics.ts` (compute), `charts.ts` (Chart.js), `pitch.ts`
  (canvas pitch), `geo.ts`, `fit-parser.ts`, `segmentation.ts`, `rating.ts` (derived match
  grade), `metrics.ts` (stat glossary), `api.ts`/`supabase.ts`/`auth.ts`, `theme.ts`.
- Global reactive `src/store.ts`. Views in `src/views/`, components in `src/components/`.
- App shell: `AppSidebar.vue` (global nav) + main grid in `App.vue`; sidebar collapses to a
  drawer under 900px. Section nav lives inside the match page, not the sidebar (Strava-style).
- Match detail (`Dashboard.vue`) order: match line (`MetaBar`, natural-language, inline
  format/pitch + settings gear) → session chooser (`SegmentBar`) → this-session
  (`SessionBar`) → section tabs → content tabs (`tabs/`).
- Strava: Settings drives the browser UI through `src/lib/strava.ts`. OAuth/token exchange,
  refresh, activity sync, and stream reads are Edge Functions in `supabase/functions/`.
  Secrets are `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, and
  `STRAVA_STATE_SECRET`; never put them in Vite/browser configuration. `strava-callback`
  has `verify_jwt = false`; every other Strava function verifies the caller. A Strava import
  is normalized to a generated GPX then handled by the existing upload/session-split flow.

## Design system

- Lime accent `#C8F751` (`--accent`; `--accent-ink` for legible text/links). Light mode is
  the default; dark supported. Tokens + light overrides in `src/style.css`
  (`:root[data-theme='light']`). Fonts: Space Grotesk / Hanken Grotesk / Space Mono.
- Data palette: `--c-blue/mint/amber/coral/red`. Charts/pitch read theme colors from CSS vars.
- Stat descriptions: single source in `src/lib/metrics.ts`, used by both the inline `InfoTip`
  tooltips and the Help page glossary — edit there, both stay in sync.
