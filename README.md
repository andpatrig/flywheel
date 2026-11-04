# Flywheel — Concept2 PM5 live data in your browser

A single-page web app that connects to a Concept2 PM5 over Bluetooth LE and shows
live pace, stroke rate, power, per-stroke force curves and a stroke-by-stroke force heatmap,
then keeps a full analysis of every session on the phone with JSON export. No server, no account.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app: live dashboard, history analysis, settings |
| `pm5.js` | PM5 Bluetooth protocol: UUIDs, byte parsers, `PM5` client, `PM5Simulator` demo |
| `vendor/plotly-4.2.0.min.js` | Plotly.js (full build, MIT) — vendored so the app works offline and needs no CDN |
| `manifest.json`, `icon*.png`, `icon.svg` | PWA install metadata and icons |
| `sw.js` | Service worker — caches everything so the app opens offline |

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
