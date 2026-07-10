# ⚽ xPitch

Smart analysis of your football, mini-soccer or futsal match from a `.fit` file
— a **front-end-only** web app. Drop in a FIT file recorded by a GPS watch or
pod and get a full match dashboard: positional, running, physiological and
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

No `.fit` file handy? Click **Load sample** for a real afternoon of four
mini-soccer matches (shipped in `public/samples/`), or the landing page's
"synthetic demo" link for a generated one. Uploading several files at once
merges them and groups matches recorded close together into one session.

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

### Define the pitch (recommended for accurate positioning)

By default the pitch is **inferred** from your GPS track (PCA + bounding box), so
positioning is relative to where you moved. For true, absolute positioning, click
**📐 Set field** and either:

- **Draw on the map** — an OpenLayers map with a **satellite** basemap (ESRI, no API
  key) or OSM, with your GPS track overlaid. Click the **4 corners** of the pitch
  (order doesn't matter). Or
- **Enter coordinates** — paste a GeoJSON `Polygon` or four `lat, lon` lines.

The field is mapped to the pitch with a projective **homography**, so any
orientation and slightly-off rectangles work. The field is saved in `localStorage`
and reused; a saved field more than 3 km from a new match is ignored automatically.

### Tips

- Enter your **age** or **max HR** for accurate HR zones (otherwise the observed
  max is used as the reference).
- Adjust the **sprint threshold** (km/h) for amateur vs elite pace.
- If defensive/attacking ends look reversed, hit **⇄ Flip attack direction**.

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
  components/        StatCard, ChartPanel, PitchCanvas, RoleCard, FieldEditor
                     (OpenLayers), FileDrop, ControlsBar, MetaBar, tabs/*
  store.ts          reactive state + actions
  App.vue           layout + tab navigation
```

## Notes & limitations

- Without a defined field, pitch coordinates are normalized to the **observed GPS
  bounding box**, so orientation/extent are inferred from where the player moved.
  Define the field (see above) to anchor everything to the true pitch.
- All metrics are estimates from GPS/HR samples — GPS quality, sampling rate and
  device placement all affect accuracy.
- Personal `.fit` recordings are git-ignored (they contain real locations).

> Dev/test hooks: append `#autosample` to load the bundled sample, `#autodemo`
> (optionally `#autodemo/positional`) for the synthetic demo, or
> `#autoload=<url>[,<url>]` to fetch and parse one or more `.fit` files.
