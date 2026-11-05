// screens/panels/projection.js — where the piece is heading. Projects the finish from your pace over the last 20
// seconds (held to the end), compares it with your best for the same piece, and gives the pace the rest of the
// piece needs to beat that best. Only meaningful for a fixed distance or time programmed on the PM5.
import { fmtPace, fmtTime, fmtInt } from '../../core/format.js';

const WINDOW = 20;   // s of recent rowing that set the projected speed

/** Recent speed (m/s) from the stroke record, falling back to the session average. */
export function recentSpeed(strokes, L) {
  const st = strokes.filter((s) => s.elapsed > 0 && s.distance > 0);
  if (st.length >= 2) {
    const last = st[st.length - 1]; let i = st.length - 2;
    while (i > 0 && last.elapsed - st[i].elapsed < WINDOW) i--;
    const a = st[i], dt = last.elapsed - a.elapsed;
    if (dt > 4) return (last.distance - a.distance) / dt;
  }
  return L.elapsed > 0 && L.distance > 0 ? L.distance / L.elapsed : null;
}

/**
 * Projection for the piece. target: {distance}|{time}; best: a saved session of the same piece or null.
 * Returns display-ready values; nulls where there is nothing to show yet.
 */
export function project({ target, best, L, strokes }) {
  const t = L.elapsed || 0, d = L.distance || 0, v = recentSpeed(strokes, L);
  if (!target || !v || v <= 0) return null;
  const now = 500 / v;
  if (target.distance) {
    const D = target.distance, left = Math.max(0, D - d), fin = t + left / v;
    const b = best?.summary?.elapsed ?? null;
    const delta = b != null ? fin - b : null;                            // − = faster than best
    const budget = b != null ? b - t : null;                             // seconds left to beat it
    const need = b != null && left > 0 ? (budget > 0 ? budget / (left / 500) : -1) : null;
    return { kind: 'distance', big: fmtTime(fin, 1), bigK: 'Projected finish', best: b != null ? fmtTime(b, 1) : null,
      delta: delta != null ? `${delta <= 0 ? 'ahead by' : 'behind by'} ${Math.abs(delta).toFixed(1)} s` : null, ahead: delta != null && delta <= 0,
      need: need == null ? null : need < 0 ? 'out of reach' : fmtPace(need), needK: `for the last ${fmtInt(left)} m`, now: fmtPace(now), frac: d / D };
  }
  const T = target.time, left = Math.max(0, T - t), fin = d + v * left;
  const b = best?.summary?.distance ?? null, delta = b != null ? fin - b : null, more = b != null ? b - d : null;
  const need = b != null && left > 0 ? (more > 0 ? left / (more / 500) : 0) : null;
  return { kind: 'time', big: `${fmtInt(fin)} m`, bigK: 'Projected distance', best: b != null ? `${fmtInt(b)} m` : null,
    delta: delta != null ? `${delta >= 0 ? 'ahead by' : 'behind by'} ${fmtInt(Math.abs(delta))} m` : null, ahead: delta != null && delta >= 0,
    need: need == null ? null : need === 0 ? 'already beaten' : fmtPace(need), needK: `for the last ${fmtTime(left)}`, now: fmtPace(now), frac: t / T };
}
