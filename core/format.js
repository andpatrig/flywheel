// core/format.js — number formatting and small numeric helpers shared by every screen.
export const CURVE_N = 40;   // force curves are resampled to this many points for averaging and maps

export const fmtPace = (s) => (s == null || !isFinite(s) || s <= 0) ? '–:––' : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export const fmtPaceShort = (s) => { const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
export const fmtTime = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
export const fmtInt = (v) => v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString();
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const stddev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
export function resample(pts, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * (pts.length - 1), a = Math.floor(x), b = Math.min(pts.length - 1, a + 1); out.push(pts[a] + (pts[b] - pts[a]) * (x - a)); }
  return out;
}
export const peakAt = (c) => c.indexOf(Math.max(...c)) / (c.length - 1);
