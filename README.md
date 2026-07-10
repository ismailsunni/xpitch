# ⚽ Spatial Football

A **front-end-only** web app to analyze and visualize a `.fit` file from a
football / minisoccer match. Drop in a FIT file recorded by a GPS watch or
pod and get a full match dashboard — everything is parsed and computed in your
browser. **Nothing is uploaded.**

## Run it

Just open `index.html` in a browser:

```
# either double-click index.html, or serve it:
python3 -m http.server   # then visit http://localhost:8000
```

No build step. The only external dependency is [Chart.js](https://www.chartjs.org/)
loaded from a CDN, so an internet connection is needed the first time for the
charts (the pitch visualizations are drawn on plain canvas and work offline).

No `.fit` file handy? Click **Load demo match** to explore a synthesized
50-minute minisoccer match.

## What it shows

**🗺️ Positional** — professional pitch heatmap, time-coloured movement trail,
average position, attacking vs defensive thirds, zone-occupancy grid, preferred
side of the pitch.

**🏃 Running** — total distance, distance in each speed zone, sprint count &
per-sprint breakdown, top speed, acceleration/deceleration events, moving vs
standing time.

**❤️ Physiological** — heart-rate graph, HR zones and time in each, average &
max HR, detected recovery periods.

**⚽ Football** — high-intensity runs, repeated-sprint bouts, work rate through
the match, second-half fatigue analysis, and a heuristic estimated playing role
(winger, forward/pivot, midfielder, defender, full-back).

### Tips

- Enter your **age** or **max HR** for accurate HR zones (otherwise the observed
  max is used as the reference).
- Adjust the **sprint threshold** (km/h) to suit amateur vs elite pace.
- The pitch orientation is inferred from your GPS track (PCA). If
  defensive/attacking ends look reversed, hit **⇄ Flip attack direction**.

## How it works

| File | Responsibility |
|------|----------------|
| `js/fit-parser.js` | Self-contained FIT binary decoder (no dependencies) |
| `js/geo.js` | GPS → local metres, PCA alignment onto pitch coordinates |
| `js/analytics.js` | All match metrics |
| `js/pitch.js` | Canvas pitch, heatmap, trail, zones |
| `js/charts.js` | Chart.js wrappers |
| `js/demo.js` | Synthetic demo match |
| `js/app.js` | UI orchestration |

All metrics are estimates derived from GPS/HR samples and should be read as
such — GPS quality, sampling rate and device placement all affect accuracy.

> Dev aid: append `#autodemo` to the URL to auto-load the demo, or
> `#autodemo/positional` (etc.) to also open a specific tab.
