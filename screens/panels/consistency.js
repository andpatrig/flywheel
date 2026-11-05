// screens/panels/consistency.js — your last twenty strokes side by side. Each tile is one stroke's force curve
// drawn over the session average (dashed) at the same scale, with its match score: 100 % is a stroke identical
// to your average in shape and size. The headline is the mean score of those strokes.
import { resample, CURVE_N, mean, stddev } from '../../core/format.js';

const NS = 'http://www.w3.org/2000/svg', N = 20;
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };

/** Match score of a force curve against a reference, 0–100: one minus the RMS difference relative to the reference RMS. */
export function matchScore(curve, ref) {
  if (!curve || !ref) return null;
  const c = resample(curve, CURVE_N), r = ref.length === CURVE_N ? ref : resample(ref, CURVE_N);
  const rms = Math.sqrt(mean(r.map((v) => v * v))) || 1, diff = Math.sqrt(mean(c.map((v, i) => (v - r[i]) ** 2)));
  return Math.max(0, Math.min(100, 100 * (1 - diff / rms)));
}

export function createConsistencyPanel(host) {
  const svg = mk('svg', { class: 'cs-svg', width: '100%', height: '100%' }, host);
  const tiles = Array.from({ length: N }, () => {
    const g = mk('g', {}, svg);
    return { g, box: mk('rect', { class: 'cs-box' }, g), base: mk('line', { class: 'cs-base' }, g), avg: mk('path', { class: 'cs-avg' }, g), fill: mk('path', { class: 'cs-fill' }, g), line: mk('path', { class: 'cs-line' }, g), score: mk('text', { class: 'cs-score' }, g), num: mk('text', { class: 'cs-num', 'text-anchor': 'end' }, g) };
  });
  let W = 1, H = 1, fs = 16, sig = '';
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; sig = '';
  }
  /** strokes: session strokes (newest last); ref: session-average curve. Returns { score, cv } for the header. */
  function render(strokes, ref) {
    const withCurve = strokes.filter((s) => s.curve && s.curve.length > 3).slice(-N);
    const key = `${W}x${H}:${withCurve.length}:${withCurve[withCurve.length - 1]?.strokeCount ?? 0}`;
    const scores = withCurve.map((s) => matchScore(s.curve, ref));
    const pw = strokes.slice(-N).map((s) => s.power).filter((p) => p > 0);
    const out = { score: scores.length ? mean(scores.filter((x) => x != null)) : null, cv: pw.length > 3 ? stddev(pw) / mean(pw) : null, n: withCurve.length };
    if (key === sig) return out; sig = key;
    // grid: as close to square tiles as the panel allows
    const cols = Math.max(4, Math.min(10, Math.round(Math.sqrt(N * W / H)))), rows = Math.ceil(N / cols), gap = Math.max(4, fs * 0.35);
    const tw = (W - gap * (cols - 1)) / cols, th = (H - gap * (rows - 1)) / rows, pad = Math.min(tw, th) * 0.1;
    const fMax = Math.max(1, ...withCurve.map((s) => Math.max(...s.curve)), ...(ref || [1])) * 1.08;
    const pathFor = (c, x0, y0, w, h, closed) => {
      const r = resample(c, CURVE_N), pts = r.map((v, i) => [x0 + (i / (CURVE_N - 1)) * w, y0 + h - (Math.max(0, v) / fMax) * h]);
      let d = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`;
      if (closed) d += `L${(x0 + w).toFixed(1)},${(y0 + h).toFixed(1)}L${x0.toFixed(1)},${(y0 + h).toFixed(1)}Z`;
      return d;
    };
    const offset = N - withCurve.length;   // empty tiles first, so the newest stroke is always the last tile
    tiles.forEach((T, i) => {
      const cx = (i % cols) * (tw + gap), cy = Math.floor(i / cols) * (th + gap), s = withCurve[i - offset];
      T.box.setAttribute('x', cx); T.box.setAttribute('y', cy); T.box.setAttribute('width', tw.toFixed(1)); T.box.setAttribute('height', th.toFixed(1));
      T.box.classList.toggle('newest', i === N - 1 && !!s);
      const x0 = cx + pad, y0 = cy + pad + fs * 0.75, w = tw - pad * 2, h = th - pad * 2 - fs * 0.75;
      T.base.setAttribute('x1', x0); T.base.setAttribute('x2', x0 + w); T.base.setAttribute('y1', y0 + h); T.base.setAttribute('y2', y0 + h);
      T.avg.setAttribute('d', ref && s ? pathFor(ref, x0, y0, w, h, false) : '');
      T.fill.setAttribute('d', s ? pathFor(s.curve, x0, y0, w, h, true) : ''); T.line.setAttribute('d', s ? pathFor(s.curve, x0, y0, w, h, false) : '');
      const sc = scores[i - offset];
      T.score.setAttribute('x', cx + pad); T.score.setAttribute('y', cy + pad + fs * 0.55); T.score.setAttribute('font-size', (0.64 * fs).toFixed(1)); T.score.textContent = s && sc != null ? `${Math.round(sc)}%` : '';
      T.num.setAttribute('x', cx + tw - pad); T.num.setAttribute('y', cy + pad + fs * 0.55); T.num.setAttribute('font-size', (0.56 * fs).toFixed(1)); T.num.textContent = s ? `#${s.strokeCount ?? ''}` : '';
    });
    return out;
  }
  return { render, resize };
}
