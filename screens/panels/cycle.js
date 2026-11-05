// screens/panels/cycle.js — the stroke as a circle. Twelve o'clock is the catch; the drive takes the arc that its
// share of the stroke time earns (a 1 : 2 ratio gives the drive 120°), the recovery the rest. Over the drive
// the handle force is drawn outward from the base ring, so the last stroke is a petal: its size is the force,
// its lean is where the peak came. The session average is the dashed outline and the previous strokes fade
// behind. A hand sweeps the circle with your actual stroke. Around the rim, ten segments count consecutive
// strokes at or under your target pace; ten in a row closes the ring and it pulses.
import { mean } from '../../core/format.js';

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
const SEGS = 10, GHOSTS = 5;

export function createCyclePanel(host) {
  const svg = mk('svg', { class: 'cy-svg', width: '100%', height: '100%' }, host);
  const g = mk('g', {}, svg);
  const recArc = mk('path', { class: 'cy-rec' }, g);
  const driveBand = mk('path', { class: 'cy-band' }, g);
  const grid = mk('g', { class: 'cy-grid' }, g);
  const ghosts = Array.from({ length: GHOSTS }, () => mk('path', { class: 'cy-ghost' }, g));
  const avg = mk('path', { class: 'cy-avg' }, g);
  const petal = mk('path', { class: 'cy-petal' }, g);
  const petalLine = mk('path', { class: 'cy-petal-line' }, g);
  const peakDot = mk('circle', { class: 'cy-peak', r: 3 }, g);
  const segs = mk('g', {}, g), segEls = Array.from({ length: SEGS }, () => mk('path', { class: 'cy-seg' }, segs));
  const pulse = mk('circle', { class: 'cy-pulse', fill: 'none' }, g);
  const hand = mk('line', { class: 'cy-hand' }, g), handDot = mk('circle', { class: 'cy-hand-dot' }, g);
  const segLbl = mk('text', { class: 'cy-lbl', 'text-anchor': 'middle' }, g);
  const catchLbl = mk('text', { class: 'cy-lbl', 'text-anchor': 'middle' }, g), finLbl = mk('text', { class: 'cy-lbl' }, g), recLbl = mk('text', { class: 'cy-lbl dim', 'text-anchor': 'middle' }, g);
  const hubV = mk('text', { class: 'cy-hub', 'text-anchor': 'middle', 'dominant-baseline': 'alphabetic' }, g);
  const hubU = mk('text', { class: 'cy-hub-u', 'text-anchor': 'middle' }, g);
  const hubK = mk('text', { class: 'cy-hub-k', 'text-anchor': 'middle' }, g);

  let W = 1, H = 1, cx = 0, cy = 0, R = 1, r0 = 1, fs = 16, fMax = 600, pulseT = 9;
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    R = Math.max(40, Math.min(W / 2 - fs * 2.1, H / 2 - fs * 2.6)); cy = H / 2 - fs * 0.35; r0 = R * 0.46; cx = W / 2;
  }
  const P = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];            // angle from 12 o'clock, clockwise
  const arcPath = (a0, a1, r) => { const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r); return `M${x0.toFixed(1)},${y0.toFixed(1)}A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
  const ring = (a0, a1, ri, ro) => { const [x0, y0] = P(a0, ro), [x1, y1] = P(a1, ro), [x2, y2] = P(a1, ri), [x3, y3] = P(a0, ri), big = a1 - a0 > Math.PI ? 1 : 0; return `M${x0},${y0}A${ro},${ro} 0 ${big} 1 ${x1},${y1}L${x2},${y2}A${ri},${ri} 0 ${big} 0 ${x3},${y3}Z`; };
  /** Polar path of a force curve over the drive arc [0, A]. closed: fill down to the base ring. */
  function curvePath(curve, A, closed) {
    if (!curve || curve.length < 2) return '';
    const n = curve.length, pts = curve.map((f, i) => P((i / (n - 1)) * A, r0 + (R - r0) * Math.max(0, f) / fMax));
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` + pts.slice(1).map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join('');
    if (closed) { const [ex, ey] = P(A, r0), [sx, sy] = P(0, r0); d += `L${ex.toFixed(1)},${ey.toFixed(1)}A${r0},${r0} 0 ${A > Math.PI ? 1 : 0} 0 ${sx.toFixed(1)},${sy.toFixed(1)}Z`; }
    return d;
  }

  /**
   * curves: recent force curves (N), oldest first; avg: session-average curve; driveFrac; phase 0…1 (live);
   * active: rowing; streak: consecutive on-pace strokes; onPace: whether the last stroke was on pace;
   * hub: { value, unit, label }; dt: s.
   */
  function render({ curves = [], avgCurve = null, driveFrac = 0.33, phase = 0, active = false, streak = 0, hub = {}, dt = 0, fired = false }) {
    const A = driveFrac * Math.PI * 2;
    // scale: the strongest of the recent strokes, eased so the petal does not jump
    const peak = Math.max(...curves.slice(-8).map((c) => Math.max(...c)), avgCurve ? Math.max(...avgCurve) : 0, 1);
    const want = Math.max(200, peak * 1.12); fMax += (want - fMax) * Math.min(1, dt * 2.5);
    // base: recovery arc (quiet) and the drive band
    recArc.setAttribute('d', arcPath(A, Math.PI * 2 - 0.0001, r0));
    driveBand.setAttribute('d', ring(0, A, r0, R));
    // force grid over the drive: rings at round newtons, a radial at each quarter of the drive
    grid.textContent = '';
    // at most three rings at a round step, labelled along the catch line (outside the drive), never closer than a line of text
    const step = [100, 200, 250, 500, 1000, 2000].find((v) => fMax / v <= 3.2) ?? 2000;
    let lastR = r0, lastT = null;
    for (let f = step; f < fMax * 0.97; f += step) {
      const rr = r0 + (R - r0) * f / fMax; mk('path', { d: arcPath(0, A, rr), class: 'cy-gl' }, grid);
      if (rr - lastR < fs * 0.95) continue; lastR = rr;
      const [lx, ly] = P(0, rr); lastT = mk('text', { x: (lx - fs * 0.35).toFixed(1), y: ly.toFixed(1), class: 'cy-gt', 'font-size': (0.6 * fs).toFixed(1), 'dominant-baseline': 'middle', 'text-anchor': 'end' }, grid); lastT.textContent = `${f}`;
    }
    if (lastT) lastT.textContent += ' N';                                   // the unit once, on the outermost ring
    for (let q = 0; q <= 4; q++) { const a = A * q / 4, [x0, y0] = P(a, r0), [x1, y1] = P(a, R); mk('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: q % 4 === 0 ? 'cy-gl strong' : 'cy-gl' }, grid); }
    // previous strokes, average, the last stroke
    const prev = curves.slice(-1 - GHOSTS, -1);
    ghosts.forEach((p, i) => { const c = prev[prev.length - GHOSTS + i]; p.setAttribute('d', c ? curvePath(c, A, false) : ''); p.style.opacity = c ? (0.1 + 0.07 * (i + 1)).toFixed(2) : 0; });
    avg.setAttribute('d', avgCurve ? curvePath(avgCurve, A, false) : '');
    const last = curves[curves.length - 1];
    petal.setAttribute('d', last ? curvePath(last, A, true) : ''); petalLine.setAttribute('d', last ? curvePath(last, A, false) : '');
    if (last) { const i = last.indexOf(Math.max(...last)), [px, py] = P((i / (last.length - 1)) * A, r0 + (R - r0) * last[i] / fMax); peakDot.setAttribute('cx', px.toFixed(1)); peakDot.setAttribute('cy', py.toFixed(1)); peakDot.style.display = ''; } else peakDot.style.display = 'none';
    // on-pace segments around the outside
    const gapA = 0.035, sr0 = R + fs * 0.55, sr1 = R + fs * 0.95, lit = streak === 0 ? 0 : ((streak - 1) % SEGS) + 1;
    segEls.forEach((s, i) => { const a0 = (i / SEGS) * Math.PI * 2 + gapA, a1 = ((i + 1) / SEGS) * Math.PI * 2 - gapA; s.setAttribute('d', ring(a0, a1, sr0, sr1)); s.classList.toggle('on', i < lit); s.classList.toggle('full', streak >= SEGS); });
    if (fired) pulseT = 0;
    pulseT += dt; const pu = Math.min(1, pulseT / 1.1);
    pulse.setAttribute('cx', cx); pulse.setAttribute('cy', cy); pulse.setAttribute('r', (sr1 + pu * fs * 2.2).toFixed(1)); pulse.style.opacity = pu < 1 ? ((1 - pu) * 0.9).toFixed(2) : 0; pulse.setAttribute('stroke-width', (fs * 0.5 * (1 - pu) + 1).toFixed(1));
    // the hand
    const a = phase * Math.PI * 2, [hx, hy] = P(a, R + fs * 0.25), [ix, iy] = P(a, r0 * 0.78);
    hand.setAttribute('x1', ix.toFixed(1)); hand.setAttribute('y1', iy.toFixed(1)); hand.setAttribute('x2', hx.toFixed(1)); hand.setAttribute('y2', hy.toFixed(1));
    handDot.setAttribute('cx', hx.toFixed(1)); handDot.setAttribute('cy', hy.toFixed(1)); handDot.setAttribute('r', (fs * 0.22).toFixed(1));
    const inDrive = active && phase < driveFrac; hand.classList.toggle('drive', inDrive); handDot.classList.toggle('drive', inDrive); hand.style.opacity = handDot.style.opacity = active ? 1 : 0.35;
    // labels
    const lr = R + fs * 1.55;
    let [lx, ly] = P(0, lr); catchLbl.setAttribute('x', lx); catchLbl.setAttribute('y', ly - fs * 0.1); catchLbl.setAttribute('font-size', (0.66 * fs).toFixed(1)); catchLbl.textContent = 'CATCH';
    [lx, ly] = P(A, lr); const tooFar = A < Math.PI && lx > W - fs * 4.2;   // keep FINISH inside the panel
    finLbl.setAttribute('x', tooFar ? W - 2 : lx); finLbl.setAttribute('y', tooFar ? ly + fs * 0.9 : ly); finLbl.setAttribute('font-size', (0.66 * fs).toFixed(1)); finLbl.setAttribute('text-anchor', tooFar || A >= Math.PI ? 'end' : 'start'); finLbl.setAttribute('dominant-baseline', 'middle'); finLbl.textContent = 'FINISH';
    [lx, ly] = P(A + (Math.PI * 2 - A) / 2, r0 * 0.62 + R * 0.38); recLbl.setAttribute('x', lx); recLbl.setAttribute('y', ly); recLbl.setAttribute('font-size', (0.62 * fs).toFixed(1)); recLbl.setAttribute('dominant-baseline', 'middle'); recLbl.textContent = 'RECOVERY';
    // what the ten segments mean, written under the ring
    [lx, ly] = P(Math.PI, sr1 + fs * 0.6); segLbl.setAttribute('x', lx); segLbl.setAttribute('y', ly); segLbl.setAttribute('dominant-baseline', 'hanging'); segLbl.setAttribute('font-size', (0.62 * fs).toFixed(1));
    segLbl.textContent = streak > SEGS ? `${streak} IN A ROW AT TARGET` : `${streak} / ${SEGS} IN A ROW AT TARGET`;
    segLbl.classList.toggle('on', streak > 0);
    // hub
    const hs = Math.min(r0 * 0.62, fs * 3);
    hubV.setAttribute('x', cx); hubV.setAttribute('y', (cy + hs * 0.22).toFixed(1)); hubV.setAttribute('font-size', hs.toFixed(1)); hubV.textContent = hub.value ?? '–';
    hubU.setAttribute('x', cx); hubU.setAttribute('y', (cy + hs * 0.22 + fs * 1.05).toFixed(1)); hubU.setAttribute('font-size', (0.72 * fs).toFixed(1)); hubU.textContent = hub.unit ?? '';
    hubK.setAttribute('x', cx); hubK.setAttribute('y', (cy - hs * 0.62).toFixed(1)); hubK.setAttribute('font-size', (0.62 * fs).toFixed(1)); hubK.textContent = hub.label ?? '';
  }
  return { render, resize };
}

/** Consecutive strokes at or under the target pace (s/500m), newest last. */
export function onPaceStreak(strokes, target) {
  let n = 0; for (let i = strokes.length - 1; i >= 0; i--) { const p = strokes[i].pace; if (p > 0 && p <= target + 0.05) n++; else break; } return n;
}
export { mean };
