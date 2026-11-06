# Flywheel — Concept2 PM5 live data in your browser

A single-page web app that connects to a Concept2 PM5 over Bluetooth LE and shows
live pace, stroke rate, power, per-stroke force curves and a stroke-by-stroke force heatmap,
then keeps a full analysis of every session on the phone with JSON export. No server, no account.

## Files

```
index.html          app shell: header, connection, settings, screen switcher
app.js              shell logic; mounts screens once and keeps them alive (BLE never drops)
core/               shared by every screen
  pm5.js            PM5 Bluetooth protocol + simulator
  session.js        the one place that talks to the erg; emits normalized events
                    (conn, status, sample, stroke, power, force, reset, saved, end)
  store.js          IndexedDB sessions, summaries, JSON export
  charts.js         Plotly figure builders (type scale + aspect-ratio limits)
  theme.js          prefs, light/dark, accents, layout mode
  format.js         formatting + numeric helpers
  ui.js, ui.css     DOM helpers, design tokens and components
  prepaint.js       applies theme before first paint (no flash)
  gfx.js            3D foundation: renderer, post-processing, procedural textures
screens/
  live.js           live dashboard            history.js   session analysis
  about.js          connect / data notes      *.html.js    each screen's markup
  stones/stage.js   Atlas Stones arena (look-dev)
  quarry/stage.js   Quarry voxel face (look-dev)
lab/                standalone look-dev pages for the 3D scenes
vendor/             Plotly 4.2.0, three.js 0.187.0 bundle (both MIT)
```

A new screen is a module exporting `{ id, mount(el, app), show(), hide() }` that subscribes to
`engine.on('stroke', …)` etc. — it never touches Bluetooth.

## Live dashboard

**Phone (one display at a time):** tap anywhere on the display, or the *Display* button,
to cycle **Metrics → Power → Force → Pace → Stroke map**. *Units* switches the big number
between pace, watts and cal/hr — the same idea as the PM5's Display and Units buttons.

**TV / laptop / iPad landscape (dashboard):** all five displays at once. Auto-selected on
landscape screens ≥ 960 px wide; force it in Settings → Layout. AirPlay the phone to a TV.

**Stroke map** is a heatmap of every stroke's force curve stacked over time (catch → finish
left to right, newest stroke on top), with dots marking peak-force timing. Technique drift
and fatigue show up as the band bending or fading.

**Settings:** light / dark / auto theme, 8 accent colors (tuned separately for each theme so
they stay legible on white), layout override, discard session. Preferences stay on the device.

## Session analysis (History)

Each saved session opens a post-workout report: pace, rate and heart rate on aligned
subplots; splits; power distribution with mean ± 1σ and coefficient of variation; force
curve mean ± 1σ with first-quarter vs. last-quarter overlays; rate vs. power colored by
elapsed time; and the full-session stroke map.

## Displays (Live tab — tap anywhere to cycle)

Metrics · **Projection** · Power · Force · **Cycle** · **Consistency** · Pace · Map · **Boat**. One display at a time on every screen, so a TV over
AirPlay gets the same layout bigger.

- **Cycle** — the stroke as a circle: catch at twelve o'clock, the drive's arc sized by your drive : recovery
  ratio, the force curve drawn outward over it (last stroke solid, average dashed, previous strokes faint), a
  hand that sweeps with your actual stroke. Ten segments around the rim count consecutive strokes at or under
  the target pace; ten in a row closes the ring.
- **Boat** — a top view of the course with a pace boat at your target pace; gap in metres and seconds,
  covered and to go for the piece programmed on the PM5. Runs vertically on a phone held upright.
- **Projection** — for a distance or time programmed on the PM5: projected finish (or distance) at your pace over
  the last 20 s, your best for that piece, and the pace the rest of the piece needs to beat it.
- **Consistency** — your last 20 force curves over the session average, each with a match score; the headline is
  the average score.
- The target pace (− / +) is shared by Cycle and Boat. When the monitor ends a piece, a summary card opens over
  the display with a link to the session report.

## Games

- **Stones** — one 1,000 kg Atlas stone onto a 1.30 m platform. Every stroke raises it by exactly
  work ÷ (m·g); the clock runs from your first stroke until it clears the platform. Best time is kept.
- **Tug** — tug-of-war against your last row of the same piece, your best, or a target pace. Program a distance or
  time on the PM5 first; the lead is your distance minus theirs at the same elapsed time; each stroke yanks the
  rope by its work, and a decisive lead drags the other sled over the line. Whoever is ahead when the piece ends
  wins. The row is saved like any other session.

History groups sessions by event (2k, 5k, 30 min, intervals, just row) as reported by the PM5, with personal bests.
Each session opens a report: pace/rate/heart rate, splits (chart and table), power distribution, force curve first
vs. last quarter, effective work (joules per stroke against rate) and the stroke map, each with a line on how to read it.

## Analysis (Python)

`analysis/` has a Jupyter notebook and a small module that read a session export, chart it, replay it stroke by
stroke and write a compact summary to hand to Claude for coaching feedback. See `analysis/README.md`.

## Hosting (5 minutes, free)

Web Bluetooth requires HTTPS. GitHub Pages is the easiest:

1. Create a repo (e.g. `flywheel`), add these files (including `vendor/`) to the root, push.
2. Repo **Settings → Pages → Source: Deploy from a branch → main / (root)**.
3. Your app is at `https://<you>.github.io/flywheel/`. Share that link.

Any static host works (Netlify, Cloudflare Pages, your own server). When you change
the files, bump `CACHE` in `sw.js` so phones pick up the new version.

## Using it

**On the PM5:** `More Options → Turn Wireless ON`. Connect from the app first, then
start a workout on the PM5 (Just Row or any programmed piece).

| Device | How to open |
|---|---|
| iPhone / iPad | Safari has no Web Bluetooth. Install the free **Bluefy** browser and open the link there. Alternative on iOS 26+: a Web Bluetooth Safari extension such as WebBLE. |
| Android | Chrome (or Edge / Samsung Internet). Menu → *Add to Home screen* for a full-screen app. |
| Mac / Windows / ChromeOS / Linux | Chrome or Edge. |

**Demo mode** (`About → Try demo`) drives the app with a simulated PM5 that emits
the real byte packets, so you can explore without the erg.

## Data

Sessions are stored in the browser's IndexedDB (on-device only). *Finish & save*
stores the session; the PM5's end-of-workout message also auto-saves.

Open a session in **History** to export it:

- **JSON** — the full session: device info, summary, one record per stroke (with the
  force curve as an array), and the 1 Hz pace/rate/HR time series. This is the
  canonical format; load it with `pandas.read_json` / `jsonlite::fromJSON`.
- **Copy** — puts the JSON on the clipboard, for browsers that block file export.

On iOS (Bluefy) export opens the share sheet: *Save to Files*, AirDrop, Mail, etc.
Browsers that can't share files fall back to a normal download.

JSON shape (`schema: 1`):

```
{ app, schema, id, startedAt, device:{name,serial,firmware,model}, ergType, units,
  summary:{distance, elapsed, strokes, avgPace, avgPower, maxPower, avgSpm, avgHr, ...},
  strokes:[{n, t, d, power, pace, spm, hr, driveLength, driveTime, recoveryTime,
            strokeDistance, peakForce, avgForce, workPerStroke, drag, curve:[N,...]}],
  samples:[{t, pace, spm, hr, speed}],
  avgCurve:[N,...] }
```

The PM5 reports handle force in 0.1 lbf; the app converts to newtons (×4.448).

## Protocol notes (for tinkering in `pm5.js`)

All UUIDs are `CE06xxxx-43E5-11E4-916C-0800200C9A66`. The app subscribes to:

- `0x0031` General status — elapsed, distance, workout/stroke state, drag factor
- `0x0032` Additional status 1 — speed, stroke rate, heart rate, pace, avg pace
- `0x0033` Additional status 2 — avg power, calories, split averages
- `0x0035` Stroke data — drive length/time, recovery time, peak/avg force, work
- `0x0036` Additional stroke data — stroke power, cal/hr, projected totals
- `0x0039` End of workout summary
- `0x003D` Force curve (multi-packet; needs recent PM5 firmware)

It writes `2` to `0x0034` (sample rate → 250 ms). Reference: Concept2 *PM5 Bluetooth
Smart Communications Interface Definition*, concept2.com → Service → Software → SDK.

## Ideas to add

Pace-target “ghost boat”, split/interval view (`0x0037`), heart-rate zones, stroke
consistency scoring, side-by-side session comparison, JSON export to the Concept2 Logbook API.

