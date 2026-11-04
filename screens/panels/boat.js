// screens/panels/boat.js — the pace boat: a top view of the course, your single scull in the near lane and a
// pace boat at your target pace in the far lane. The window follows the two boats and zooms out as the gap
// grows; buoys, distance marks and the finish line are at their true positions on the course. Oars sweep
// with your actual stroke (from the monitor's stroke state); each catch leaves a puddle that drifts behind.
// Drawn in SVG at the panel's pixel size so every line is crisp on any display.
import { fmtInt, fmtTime } from '../../core/format.js';

const NS = 'http://www.w3.org/2000/svg';
const HULL = 8.2, LOCK = { x: 0.05, y: 0.8 }, INBOARD = 0.88, OUTBOARD = 2.0;
const LANE = 6.4;                                   // m between lane centres
const mk = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };

function hullPath() {
  // top view of a single: pointed bow (+x) and stern (−x), widest just aft of centre; width exaggerated ×1.7
  const N = 40, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = (u - 0.5) * HULL, w = 0.145 * 1.7 * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.08)), 0.62);
    top.push(`${x.toFixed(3)},${(-w).toFixed(3)}`); bot.push(`${x.toFixed(3)},${w.toFixed(3)}`);
  }
  return `M${top.join('L')}L${bot.reverse().join('L')}Z`;
}

/** Build one boat (in metres, bow toward +x) and return a poser. ghost: outline style. */
function buildBoat(parent, ghost) {
  const g = mk('g', { class: ghost ? 'pb-boat ghost' : 'pb-boat' }, parent);
  const oars = [];
  for (const side of [-1, 1]) {
    const o = mk('g', {}, g);
    const shaft = mk('line', { class: 'pb-oar', 'stroke-width': 0.05 }, o);
    const blade = mk('rect', { class: 'pb-blade', rx: 0.04 }, o);
    oars.push({ side, shaft, blade });
  }
  for (const side of [-1, 1]) {   // riggers: wing from the hull to the pin, and a back stay
    mk('line', { class: 'pb-rig', x1: 0.35, y1: side * 0.2, x2: LOCK.x, y2: side * LOCK.y, 'stroke-width': 0.045 }, g);
    mk('line', { class: 'pb-rig', x1: -0.45, y1: side * 0.18, x2: LOCK.x, y2: side * LOCK.y, 'stroke-width': 0.035 }, g);
    mk('circle', { class: 'pb-pin', cx: LOCK.x, cy: side * LOCK.y, r: 0.06 }, g);
  }
  mk('path', { class: 'pb-hull', d: hullPath(), 'stroke-width': 0.04 }, g);
  mk('rect', { class: 'pb-cockpit', x: -1.0, y: -0.15, width: 1.75, height: 0.3, rx: 0.12 }, g);
  if (!ghost) mk('rect', { class: 'pb-stripe', x: 2.2, y: -0.07, width: 0.9, height: 0.14, rx: 0.05 }, g);
  mk('circle', { class: 'pb-ball', cx: HULL / 2 - 0.02, cy: 0, r: 0.07 }, g);
  const arms = [-1, 1].map(() => mk('line', { class: 'pb-arm', 'stroke-width': 0.08, 'stroke-linecap': 'round' }, g));
  const body = mk('ellipse', { class: 'pb-body', rx: 0.16, ry: 0.23 }, g);
  const head = mk('circle', { class: 'pb-head', r: 0.105 }, g);

  /** u: 0 catch → 1 finish; drive: blades squared and in the water. */
  function pose(u, drive) {
    const th = (55 - 92 * u) * Math.PI / 180;                     // blade angle from the lateral, + toward the bow
    const seat = -0.5 + 0.62 * u, lean = (-0.22 + 0.42 * u);       // slide toward the stern at the catch; body swings
    const sh = seat + lean;
    for (const o of oars) {
      const dx = Math.sin(th), dy = o.side * Math.cos(th), px = LOCK.x, py = o.side * LOCK.y;
      const hx = px - INBOARD * dx, hy = py - INBOARD * dy, bx = px + OUTBOARD * dx, by = py + OUTBOARD * dy;
      o.shaft.setAttribute('x1', hx.toFixed(3)); o.shaft.setAttribute('y1', hy.toFixed(3)); o.shaft.setAttribute('x2', bx.toFixed(3)); o.shaft.setAttribute('y2', by.toFixed(3));
      // a squared blade is edge-on from above (a sliver); a feathered one lies flat (its full face)
      const ang = Math.atan2(dy, dx) * 180 / Math.PI, w = drive ? 0.07 : 0.22;
      o.blade.setAttribute('x', (-0.25).toFixed(3)); o.blade.setAttribute('y', (-w / 2).toFixed(3)); o.blade.setAttribute('width', 0.5); o.blade.setAttribute('height', w.toFixed(3));
      o.blade.setAttribute('transform', `translate(${(bx + 0.22 * dx).toFixed(3)},${(by + 0.22 * dy).toFixed(3)}) rotate(${ang.toFixed(1)})`);
      o.hand = [hx, hy];
    }
    arms.forEach((a, i) => { const o = oars[i]; a.setAttribute('x1', sh.toFixed(3)); a.setAttribute('y1', (o.side * 0.18).toFixed(3)); a.setAttribute('x2', o.hand[0].toFixed(3)); a.setAttribute('y2', (o.hand[1] * 0.85).toFixed(3)); });
    body.setAttribute('cx', ((seat + sh) / 2).toFixed(3)); body.setAttribute('cy', 0);
    head.setAttribute('cx', (sh - 0.02).toFixed(3)); head.setAttribute('cy', 0);
    return oars.map((o) => [LOCK.x + OUTBOARD * Math.sin(th) + 0.2 * Math.sin(th), o.side * (LOCK.y + OUTBOARD * Math.cos(th))]);
  }
  return { g, pose };
}

export function createBoatPanel(host) {
  const svg = mk('svg', { class: 'pb-svg', width: '100%', height: '100%' }, host);
  const defs = mk('defs', {}, svg);
  const pat = mk('pattern', { id: 'pbRipple', patternUnits: 'userSpaceOnUse', width: 6, height: 2.2 }, defs);
  for (const [x, y, l] of [[0.3, 0.4, 1.4], [3.1, 1.3, 1.9], [4.6, 0.6, 0.9], [1.8, 1.8, 1.1]]) mk('line', { class: 'pb-ripple', x1: x, y1: y, x2: x + l, y2: y, 'stroke-width': 0.04, 'stroke-linecap': 'round' }, pat);
  const world = mk('g', {}, svg);                 // metres → pixels
  const water = mk('rect', { class: 'pb-water', x: -1e4, y: -LANE * 6, width: 2e4, height: LANE * 12 }, world);
  const ripple = mk('rect', { fill: 'url(#pbRipple)', x: -1e4, y: -LANE * 6, width: 2e4, height: LANE * 12, opacity: 0.9 }, world);
  const course = mk('g', {}, world);              // lane lines, buoys, distance marks, finish (rebuilt per frame from pools)
  const puddles = mk('g', {}, world);
  const finish = mk('g', { visibility: 'hidden' }, world);
  for (let i = 0; i < 12; i++) mk('rect', { class: i % 2 ? 'pb-chk a' : 'pb-chk', x: -0.15, y: -LANE + i * (LANE * 2 / 12), width: 0.3, height: LANE * 2 / 12 }, finish);
  const pace = buildBoat(world, true), me = buildBoat(world, false);
  const labels = mk('g', {}, svg);                // distance labels in screen space (crisp text)
  const tickPool = [], buoyPool = [], labelPool = [], puddlePool = [];
  const pool = (arr, n, make) => { while (arr.length < n) arr.push(make()); return arr; };

  let W = 1, H = 1, fs = 14, lastPuddle = -1, paceU = 0, t = 0;
  function resize() {
    const r = host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }
  /**
   * my, opp: distances (m); u/drive: my stroke position; dt: s; target: {distance}|{time}|null; spm: rate.
   */
  function render({ my = 0, opp = 0, u = 0.7, drive = false, dt = 0, spm = 24, target = null }) {
    t += dt;
    // landscape: the course runs left → right; portrait: bottom → top (bows up), so the boats use the long side
    const vert = H > W * 0.9, along = vert ? H : W, across = vert ? W : H;
    const gap = Math.abs(my - opp), needAcross = LANE * 2.25;
    const k = Math.min(along / 30, across / needAcross, along / (gap + HULL * 1.6));   // px per metre
    const cx = (my + opp) / 2 + HULL * 0.1, mid = (vert ? W : H) * 0.5;
    const X = (x) => along / 2 + (x - cx) * k;
    world.setAttribute('transform', vert
      ? `translate(${mid.toFixed(2)},${(H / 2 + cx * k).toFixed(2)}) rotate(-90) scale(${k.toFixed(4)})`
      : `translate(${(W / 2 - cx * k).toFixed(2)},${mid.toFixed(2)}) scale(${k.toFixed(4)})`);
    // my boat in the near lane (bottom), the pace boat in the far lane (top)
    const yMe = LANE * 0.5, yPb = -LANE * 0.5;
    me.g.setAttribute('transform', `translate(${my.toFixed(3)},${yMe})`);
    pace.g.setAttribute('transform', `translate(${opp.toFixed(3)},${yPb})`);
    const tips = me.pose(u, drive);
    paceU = (paceU + dt * (spm || 24) / 60) % 1;
    const pu = paceU < 0.33 ? (1 - Math.cos(Math.PI * paceU / 0.33)) / 2 : (1 + Math.cos(Math.PI * (paceU - 0.33) / 0.67)) / 2;
    pace.pose(pu, paceU < 0.33);
    // puddles: at each catch, two swirls where the blades went in; they stay put in the water and fade
    if (drive && u < 0.15 && lastPuddle < 0) {
      lastPuddle = 1; for (const [bx, by] of tips) puddlePool.push({ x: my + bx, y: yMe + by, born: t });
    } else if (!drive) lastPuddle = -1;
    while (puddlePool.length > 24 || (puddlePool[0] && t - puddlePool[0].born > 4)) { const p = puddlePool.shift(); p.el?.remove(); }
    for (const p of puddlePool) {
      if (!p.el) p.el = mk('ellipse', { class: 'pb-puddle', rx: 0.35, ry: 0.22, cx: p.x, cy: p.y }, puddles);
      const a = Math.max(0, 1 - (t - p.born) / 4); p.el.setAttribute('opacity', (a * 0.7).toFixed(2)); p.el.setAttribute('rx', (0.3 + (t - p.born) * 0.12).toFixed(3)); p.el.setAttribute('ry', (0.2 + (t - p.born) * 0.08).toFixed(3));
    }
    // course: lane lines with buoys every 5 m, a tick every 10 m, a labelled mark every 50 m
    const x0 = cx - along / 2 / k, x1 = cx + along / 2 / k;
    let nb = 0, nt = 0, nl = 0;
    const lanesY = [-LANE, 0, LANE];
    for (let m = Math.ceil(x0 / 5) * 5; m <= x1; m += 5) {
      for (const y of lanesY) { const b = pool(buoyPool, nb + 1, () => mk('circle', { class: 'pb-buoy', r: 0.13 }, course))[nb++]; b.setAttribute('cx', m); b.setAttribute('cy', y); b.setAttribute('class', m % 50 === 0 ? 'pb-buoy major' : 'pb-buoy'); b.style.display = ''; }
      if (m % 10 === 0) { const tk = pool(tickPool, nt + 1, () => mk('line', { class: 'pb-tick', 'stroke-width': 0.05 }, course))[nt++]; tk.setAttribute('x1', m); tk.setAttribute('x2', m); tk.setAttribute('y1', -0.5); tk.setAttribute('y2', 0.5); tk.style.display = ''; }
      if (m % 50 === 0 && m >= 0) {
        const L = pool(labelPool, nl + 1, () => mk('text', { class: 'pb-label', 'text-anchor': 'middle' }, labels))[nl++];
        L.textContent = `${fmtInt(m)}`; L.setAttribute('font-size', (0.72 * fs).toFixed(1)); L.setAttribute('dominant-baseline', 'middle'); L.style.display = '';
        if (vert) { L.setAttribute('x', (mid + 0.5 * fs).toFixed(1)); L.setAttribute('y', (H - X(m)).toFixed(1)); L.setAttribute('text-anchor', 'start'); }
        else { L.setAttribute('x', X(m).toFixed(1)); L.setAttribute('y', (mid + 0.95 * fs).toFixed(1)); L.setAttribute('text-anchor', 'middle'); }
      }
    }
    for (let i = nb; i < buoyPool.length; i++) buoyPool[i].style.display = 'none';
    for (let i = nt; i < tickPool.length; i++) tickPool[i].style.display = 'none';
    for (let i = nl; i < labelPool.length; i++) labelPool[i].style.display = 'none';
    if (target?.distance && target.distance >= x0 - 1 && target.distance <= x1 + 1) { finish.setAttribute('visibility', 'visible'); finish.setAttribute('transform', `translate(${target.distance},0)`); } else finish.setAttribute('visibility', 'hidden');
  }
  return { render, resize, svg };
}

/** Text for the panel footer: covered / to go, by the kind of piece. */
export function progressText({ my, opp, elapsed, target }) {
  if (target?.distance) return { left: `${fmtInt(my)} m`, leftK: 'Covered', right: `${fmtInt(Math.max(0, target.distance - my))} m`, rightK: 'To go', frac: my / target.distance, oppFrac: opp / target.distance };
  if (target?.time) return { left: `${fmtInt(my)} m`, leftK: `Covered · ${fmtTime(elapsed)}`, right: fmtTime(Math.max(0, target.time - elapsed)), rightK: 'To go', frac: elapsed / target.time, oppFrac: elapsed / target.time };
  return { left: `${fmtInt(my)} m`, leftK: 'Covered', right: `${fmtInt(opp)} m`, rightK: 'Pace boat', frac: (my % 500) / 500, oppFrac: Math.min(1, Math.max(0, (opp - Math.floor(my / 500) * 500) / 500)) };
}
