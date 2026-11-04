// screens/live.js — the live dashboard: Metrics, Power, Force, Pace, Stroke map.
// One display at a time on every screen, tap to cycle (AirPlay mirrors the phone, so a TV sees the same thing bigger).
import html from './live.html.js';
import { engine } from '../core/session.js';
import { prefs, savePrefs, onThemeChange } from '../core/theme.js';
import { $, twoTap } from '../core/ui.js';
import { fmtPace, fmtTime, fmtInt, mean, stddev, peakAt } from '../core/format.js';
import { STROKE_STATE, WORKOUT_STATE } from '../core/pm5.js';
import { chartFs, RATIO, fit, powerFig, forceFig, paceFig, mapFig, draw } from '../core/charts.js';
import { createStrokeClock } from '../core/stroke-clock.js';
import { workoutFromStatus, classify } from '../core/events.js';
import { createBoatPanel, progressText } from './panels/boat.js';
import { createCyclePanel, onPaceStreak } from './panels/cycle.js';

export const id = 'live';
const root = document.documentElement;
const PANELS = ['metrics', 'power', 'force', 'cycle', 'pace', 'map', 'boat'];
const PANEL_NAME = { metrics: 'Metrics', power: 'Power', force: 'Force', cycle: 'Cycle', pace: 'Pace', map: 'Map', boat: 'Boat' };
const LIVE_SVG = ['cycle', 'boat'];                     // drawn every frame while visible (not Plotly)
const powerToPace = (w) => (w > 0 ? 500 * Math.cbrt(2.8 / w) : null);
const UNITS = ['pace', 'watts', 'cal'];
const UNIT_NAME = { pace: '/500m', watts: 'Watts', cal: 'Cal/hr' };

let shown = false, PLOT = null, boat = null, cyc = null, clock = createStrokeClock(), anim = 0, animLast = 0, streak = 0, streakFired = false;

export function mount(el) {
  el.innerHTML = html;
  PLOT = { power: $('pwrPlot'), force: $('forcePlot'), pace: $('pacePlot'), map: $('mapPlot') };

  $('displayBtn').onclick = (e) => { e.stopPropagation(); nextPanel(1); };
  $('display').addEventListener('click', (e) => { if (root.dataset.mode === 'focus' && !e.target.closest('button, a')) nextPanel(1); });
  $('unitsBtn').onclick = () => { prefs.units = UNITS[(UNITS.indexOf(prefs.units) + 1) % UNITS.length]; savePrefs(); syncUnits(); renderMetrics(); };
  $('saveBtn').onclick = () => twoTap($('saveBtn'), () => engine.save());
  document.addEventListener('keydown', (e) => {
    if (!shown || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextPanel(1); }
    else if (e.key === 'ArrowLeft') nextPanel(-1);
    else if (e.key === 'u' || e.key === 'U') $('unitsBtn').click();
  });

  engine.on('status', renderMetrics);
  engine.on('sample', () => mark('pace'));
  engine.on('stroke', () => { setRecording(true); renderMetrics(); });
  engine.on('power', () => { renderMetrics(); mark('power'); });
  engine.on('force', () => { renderMetrics(); mark('force', 'map'); });
  engine.on('reset', () => { setRecording(false); renderMetrics(); markAll(); });
  engine.on('conn', ({ state }) => { if (state === 'idle') { $('phase').textContent = 'Offline'; $('phase').className = 'phase'; } });
  onThemeChange(() => { setPanel(prefs.panel, false); syncUnits(); renderMetrics(); markAll(); });

  const ro = new ResizeObserver((entries) => entries.forEach((e) => mark(e.target.closest('.panel').dataset.panel)));
  Object.values(PLOT).forEach((p) => ro.observe(p));
  let rsz = 0;
  addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(markAll, 120); });
  if (!window.Plotly) addEventListener('load', markAll);

  // pace boat and stroke cycle: SVG instruments, one shared target pace
  $('pips').innerHTML = PANELS.map(() => '<i></i>').join('');
  boat = createBoatPanel($('boatPlot')); cyc = createCyclePanel($('cycPlot'));
  const svgRo = new ResizeObserver(() => { boat.resize(); cyc.resize(); }); svgRo.observe($('boatPlot')); svgRo.observe($('cycPlot'));
  el.querySelectorAll('[data-step]').forEach((st) => st.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); e.stopPropagation(); if (!b) return;
    prefs.targetPace = Math.max(60, Math.min(300, Math.round((targetPace() - +b.dataset.d) * 10) / 10)); savePrefs(); syncTarget(); recount();
  }));
  engine.on('power', () => recount(true));
  engine.on('reset', () => { streak = 0; });
  syncTarget();

  setPanel(prefs.panel, false); syncUnits(); renderMetrics();
}
const targetPace = () => prefs.targetPace ?? 120;
function syncTarget() { document.querySelectorAll('[data-tgt]').forEach((e) => { e.textContent = fmtPace(targetPace()); }); }
/** On-pace streak from the stroke record; a new full set of ten fires the ring. */
function recount(fromStroke = false) {
  const st = (engine.session?.strokes ?? []).map((s) => ({ pace: s.power ? powerToPace(s.power) : s.pace }));
  const n = onPaceStreak(st, targetPace());
  if (fromStroke && n > 0 && n % 10 === 0 && n !== streak) streakFired = true;
  streak = n;
}
function animate(now) {
  anim = 0;
  if (!shown || !LIVE_SVG.includes(prefs.panel)) return;
  const dt = Math.min(0.1, (now - (animLast || now)) / 1000); animLast = now;
  const L = engine.latest, C = clock.update(L, dt), active = engine.connected && C.active;
  const w = workoutFromStatus(L), target = w ? classify({ workout: w }).target : null;
  if (prefs.panel === 'boat') {
    const my = L.distance || 0, el = L.elapsed || 0, opp = el * 500 / targetPace(), gap = my - opp;
    boat.render({ my, opp, u: clock.u(), drive: active && C.phase < C.driveFrac, dt, spm: L.strokeRate || 24, target });
    const v = my > 0 && el > 0 ? my / el : 500 / targetPace();
    $('boatNow').textContent = `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(1)}`;
    $('boatNow').parentElement.classList.toggle('behind', gap < -0.05);
    $('boatSub').textContent = el > 0 ? `${gap >= 0 ? 'ahead' : 'behind'} by ${(Math.abs(gap) / v).toFixed(1)} s` : 'a boat at your target pace';
    const pt = progressText({ my, opp, elapsed: el, target });
    $('pbLk').textContent = pt.leftK; $('pbL').textContent = pt.left; $('pbRk').textContent = pt.rightK; $('pbR').textContent = pt.right;
    $('pbFill').style.width = `${(Math.min(1, Math.max(0, pt.frac)) * 100).toFixed(2)}%`; $('pbOpp').style.left = `${(Math.min(1, Math.max(0, pt.oppFrac)) * 100).toFixed(2)}%`;
  } else {
    const st = engine.session?.strokes ?? [], curves = st.filter((s) => s.curve).slice(-7).map((s) => s.curve);
    const u = prefs.units, hub = u === 'watts' ? { value: fmtInt(L.power), unit: 'watts', label: 'POWER' } : { value: fmtPace(L.pace), unit: '/500m', label: 'PACE' };
    cyc.render({ curves, avgCurve: engine.avgCurve(), driveFrac: C.driveFrac, phase: C.phase, active, streak, hub, dt, fired: streakFired });
    streakFired = false;
    $('cycNow').textContent = streak;
    $('cycSub').textContent = L.driveTime > 0 ? `ratio 1 : ${(L.recoveryTime / L.driveTime).toFixed(1)} · drive ${L.driveTime.toFixed(2)} s` : 'drive and recovery as one turn';
  }
  anim = requestAnimationFrame(animate);
}
const kick = () => { if (!anim && shown && LIVE_SVG.includes(prefs.panel)) { animLast = 0; anim = requestAnimationFrame(animate); } };
export function show() { shown = true; markAll(); kick(); }
export function hide() { shown = false; }

// ---------- display cycling
export function setPanel(p, persist = true) {
  if (!PANELS.includes(p)) p = 'metrics';
  prefs.panel = p; if (persist) savePrefs();
  document.querySelectorAll('#display .panel').forEach((el) => el.classList.toggle('active', el.dataset.panel === p));
  $('displayName').textContent = PANEL_NAME[p];
  if (LIVE_SVG.includes(p)) { boat?.resize(); cyc?.resize(); kick(); }
  document.querySelectorAll('.pips i').forEach((el, i) => el.classList.toggle('on', PANELS[i] === p));
  mark(p);
}
const nextPanel = (dir = 1) => setPanel(PANELS[(PANELS.indexOf(prefs.panel) + dir + PANELS.length) % PANELS.length]);
const syncUnits = () => { $('unitsName').textContent = UNIT_NAME[prefs.units]; };
function setRecording(on) {
  $('saveBtn').disabled = !on; $('saveBtn').classList.toggle('rec', on);
  $('saveK').textContent = on ? 'Rec' : 'Session';
}

// ---------- metrics (cheap DOM writes, every status packet)
function renderMetrics() {
  const u = prefs.units, L = engine.latest, S = engine.session;
  const lbl = { pace: ['Pace', '/500m'], watts: ['Power', 'watts'], cal: ['Energy', 'cal/hr'] }[u];
  $('heroLbl').innerHTML = `${lbl[0]} <span>${lbl[1]}</span>`;
  $('heroVal').textContent = u === 'pace' ? fmtPace(L.pace) : u === 'watts' ? fmtInt(L.power) : fmtInt(L.calsPerHour);
  $('heroSub').textContent = u === 'pace' ? `avg ${fmtPace(L.avgPace)}` : u === 'watts' ? `avg ${fmtInt(L.avgPower)} W` : `${fmtInt(L.totalCalories)} kcal total`;
  if (u === 'watts') { $('mAltLbl').textContent = 'Pace'; $('mAlt').textContent = fmtPace(L.pace); $('mAltU').textContent = '/500m'; }
  else { $('mAltLbl').textContent = 'Power'; $('mAlt').textContent = fmtInt(L.power); $('mAltU').textContent = 'W'; }
  $('mSpm').textContent = L.strokeRate ?? '–';
  $('mDist').textContent = fmtInt(L.distance);
  $('mTime').textContent = fmtTime(L.elapsed);
  $('mHr').textContent = L.heartRate ?? '–';
  $('mDrag').textContent = L.dragFactor ?? '–';
  $('mCal').textContent = fmtInt(L.totalCalories);
  $('mDl').textContent = L.driveLength ? L.driveLength.toFixed(2) : '–';
  $('mStrokes').textContent = L.strokeCount ?? 0;
  $('mRatio').textContent = L.driveTime > 0 ? `1 : ${(L.recoveryTime / L.driveTime).toFixed(1)}` : '–';
  if (engine.connected && L.strokeState != null) {
    const ws = L.workoutState != null && ![1, 4, 5].includes(L.workoutState) ? (WORKOUT_STATE[L.workoutState] || '') : (STROKE_STATE[L.strokeState] || '');
    const short = { 'Drive': 'Drive', 'Recovery': 'Recovery', 'Dwell': 'Dwell', 'Waiting for min speed': 'Ready', 'Waiting to accelerate': 'Ready', 'Wait to begin': 'Ready', 'Interval rest': 'Rest', 'Workout end': 'Done' }[ws] || ws;
    $('phase').textContent = short;
    $('phase').className = 'phase' + (short === 'Drive' ? ' drive' : short === 'Recovery' ? ' recovery' : '');
  }
  const st = S?.strokes ?? [], pw = st.slice(-60).map((s) => s.power).filter((v) => v > 0);
  $('pwrNow').textContent = fmtInt(L.power);
  $('pwrSub').textContent = pw.length ? `dotted = mean ${Math.round(mean(pw))} W · last ${pw.length}` : 'per stroke';
  $('forceNow').textContent = fmtInt(L.curvePeak ?? L.peakForce);
  $('forceSub').textContent = engine.curveN ? `peak @ ${Math.round(L.curvePeakAt * 100)}% of drive` : 'this stroke vs. average';
  $('paceNow').textContent = fmtPace(L.pace);
  $('paceSub').textContent = L.avgPace ? `dotted = avg ${fmtPace(L.avgPace)} · ${fmtTime(L.elapsed)}` : 'faster is up';
  const pk = st.filter((s) => s.curve).slice(-60).map((s) => peakAt(s.curve) * 100);
  $('mapNow').textContent = L.curvePeakAt != null ? Math.round(L.curvePeakAt * 100) : '–';
  $('mapSub').textContent = pk.length > 2 ? `peak timing σ ${stddev(pk).toFixed(1)}% · last ${pk.length}` : 'force over every stroke';
}

// ---------- live charts: only draw what's visible; keep the rest dirty
const dirty = new Set(); let raf = 0;
const visible = (p) => shown && prefs.panel === p;
function mark(...ps) { ps.forEach((p) => dirty.add(p)); if (!raf) raf = requestAnimationFrame(flush); }
function markAll() { mark(...PANELS); }
function flush() { raf = 0; for (const p of [...dirty]) if (visible(p) && renderPanel(p)) dirty.delete(p); }
function renderPanel(p) {
  if (p === 'metrics') { renderMetrics(); return true; }
  if (LIVE_SVG.includes(p)) { kick(); return true; }
  const el = PLOT[p];
  if (!el.clientWidth || !el.clientHeight) return false;
  const { w, h } = fit(el, RATIO[p]);
  const o = { w, h, fs: chartFs(), live: true }, st = engine.session?.strokes ?? [];
  let fig;
  if (p === 'power') fig = powerFig(st, { ...o, window: 40 });
  else if (p === 'force') {
    const wc = st.filter((s) => s.curve), cur = wc[wc.length - 1]?.curve ?? null;
    fig = forceFig({ cur, avg: engine.avgCurve(), prev: wc.slice(-5, -1).map((s) => s.curve) }, o);
  } else if (p === 'pace') fig = paceFig(engine.session?.samples ?? [], { ...o, avgPace: engine.latest.avgPace });
  else fig = mapFig(st.slice(-60), o);
  return draw(el, fig, false);
}
