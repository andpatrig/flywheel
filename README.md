# Flywheel — Concept2 PM5 live data in your browser

A single-page web app that connects to a Concept2 PM5 over Bluetooth LE and shows
live pace, stroke rate, power, per-stroke force curves, and keeps a session history on
the phone with CSV export. No server, no account, no dependencies — five static files.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole UI (dashboard, charts, history, export) |
| `pm5.js` | PM5 Bluetooth protocol: UUIDs, byte parsers, `PM5` client, `PM5Simulator` demo |
| `manifest.json` | PWA manifest (home-screen install on Android Chrome) |
| `sw.js` | Service worker — caches the app so it opens offline |
| `icon.svg` | App icon |

## Hosting (5 minutes, free)

Web Bluetooth requires HTTPS. GitHub Pages is the easiest:

1. Create a repo (e.g. `flywheel`), add these five files to the root, push.
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
stores the session; the PM5's end-of-workout message also auto-saves. Export gives
one CSV row per stroke:

`strokeCount, elapsed (s), distance (m), power (W), pace (s/500m), spm, hr, driveLength (m),
driveTime (s), recoveryTime (s), strokeDistance (m), peakForce (N), avgForce (N),
workPerStroke (J), drag, forceCurveN ("f1;f2;…" in N, catch → finish)`

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
