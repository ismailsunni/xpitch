# ⚽ Spatial Football

A **front-end-only** web app to analyze and visualize a `.fit` file from a
football / minisoccer match. Drop in a FIT file recorded by a GPS watch or pod
and get a full match dashboard — positional, running, physiological and
football-specific metrics. **Everything is parsed and computed in your browser;
nothing is uploaded.**

Built with **Vue 3 + Vite + TypeScript**, deployable to **GitHub Pages**.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build -> dist/
npm run preview    # serve the built dist/ locally
npm run typecheck  # vue-tsc
```

No `.fit` file handy? Click **Load demo match** for a synthesized 50-minute
minisoccer match.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source = GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds and
   publishes `dist/` to Pages.

`vite.config.ts` uses `base: './'` (relative asset URLs), so the app works at
`https://<user>.github.io/<repo>/` without hard-coding the repo name.

## What it shows

**Match metadata** — when it was recorded, where (reverse-geocoded from the
start GPS fix via OpenStreetMap Nominatim, with a map link), sport, duration and
calories, when the device provides them.

**🗺️ Positional** — pitch heatmap, time-coloured movement trail, average
position, attacking/defensive thirds, zone-occupancy grid, preferred side.

**🏃 Running** — total distance, distance per speed zone, sprint count &
per-sprint breakdown, top speed, acceleration/deceleration events, moving vs
standing time.

**❤️ Physiological** — heart-rate graph, HR zones and time in each, average &
max HR, detected recovery periods.

**⚽ Football** — high-intensity runs, repeated-sprint bouts, work rate through
the match, second-half fatigue, heuristic estimated playing role.

### Tips

- Enter your **age** or **max HR** for accurate HR zones (otherwise the observed
  max is used as the reference).
- Adjust the **sprint threshold** (km/h) for amateur vs elite pace.
- Pitch orientation is inferred from your GPS track (PCA). If defensive/attacking
  ends look reversed, hit **⇄ Flip attack direction**.

## Project layout

```
src/
  lib/
    fit-parser.ts   dependency-free FIT binary decoder
    geo.ts          local projection + PCA pitch alignment
    analytics.ts    all match metrics
    pitch.ts        canvas pitch / heatmap / trail / zones
    charts.ts       Chart.js config builders
    demo.ts         synthetic demo match
    format.ts       presentation helpers + reverse geocode
  components/        StatCard, ChartPanel, PitchCanvas, RoleCard,
                     FileDrop, ControlsBar, MetaBar, tabs/*
  store.ts          reactive state + actions
  App.vue           layout + tab navigation
```

## Notes & limitations

- Pitch coordinates are normalized to the **observed GPS bounding box**, so
  orientation and extent are inferred from where the player moved, not the real
  field. A field-boundary input (draw the pitch on a satellite/OSM map) is the
  planned next step to anchor this to the true pitch.
- All metrics are estimates from GPS/HR samples — GPS quality, sampling rate and
  device placement all affect accuracy.
- Personal `.fit` recordings are git-ignored (they contain real locations).

> Dev/test hooks: append `#autodemo` (optionally `#autodemo/positional`) to
> auto-load the demo, or `#autoload=<url>` to fetch and parse a `.fit`.
