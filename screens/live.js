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
import { createConsistencyPanel } from './panels/consistency.js';
import { project } from './panels/projection.js';
import { db } from '../core/store.js';
import { personalBests, ofEvent, completed } from '../core/events.js';

export const id = 'live';
const root = document.documentElement;
const PANELS = ['metrics', 'proj', 'power', 'force', 'cycle', 'cons', 'pace', 'map', 'boat'];
const PANEL_NAME = { metrics: 'Metrics', proj: 'Projection', power: 'Power', force: 'Force', cycle: 'Cycle', cons: 'Consistency', pace: 'Pace', map: 'Map', boat: 'Boat' };
const LIVE_SVG = ['cycle', 'boat', 'cons', 'proj'];                     // drawn every frame while visible (not Plotly)
const powerToPace = (w) => (w > 0 ? 500 * Math.cbrt(2.8 / w) : null);
const UNITS = ['pace', 'watts', 'cal'];
const UNIT_NAME = { pace: '/500m', watts: 'Watts', cal: 'Cal/hr' };

let shown = false, PLOT = null, boat = null, cyc = null, cons = null, best = { key: null, session: null }, appRef = null, clock = createStrokeClock(), anim = 0, animLast = 0, streak = 0, streakFired = false;

export function mount(el, app) {
  appRef = app;
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
  boat = createBoatPanel($('boatPlot')); cyc = createCyclePanel($('cycPlot')); cons = createConsistencyPanel($('csPlot'));
  const svgRo = new ResizeObserver(() => { boat.resize(); cyc.resize(); cons.resize(); }); for (const id of ['boatPlot', 'cycPlot', 'csPlot']) svgRo.observe($(id));
  // piece complete: a summary over the display as soon as the session is saved
  engine.on('saved', ({ session }) => showDone(session));
  $('dcClose').onclick = (e) => { e.stopPropagation(); $('doneCard').hidden = true; };
  $('dcReport').onclick = (e) => { e.stopPropagation(); $('doneCard').hidden = true; appRef?.show('history'); appRef?.openSession?.(doneId); };
  $('doneCard').onclick = (e) => e.stopPropagation();
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
  const w = workoutFromStatus(L), ev = w ? classify({ workout: w }) : null, target = ev?.target ?? null;
  if (prefs.panel === 'proj') renderProj(ev, L);
  else if (prefs.panel === 'cons') {
    const r = cons.render(engine.session?.strokes ?? [], engine.avgCurve());
    $('csNow').textContent = r.score != null ? Math.round(r.score) : '–';
    $('csSub').textContent = r.n ? `last ${r.n} strokes${r.cv != null ? ` · power varies ±${(r.cv * 100).toFixed(1)} %` : ''}` : 'last 20 strokes';
  } else if (prefs.panel === 'boat') {
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
    const pk = L.curvePeak, side = [['Peak force', pk ? `${Math.round(pk)}` : '–', 'N'], ['Drive', L.driveTime ? L.driveTime.toFixed(2) : '–', 's'], ['Recovery', L.recoveryTime ? L.recoveryTime.toFixed(2) : '–', 's'], ['Rate', L.strokeRate || '–', 'spm']];
    const sig = side.map((x) => x[1]).join('|'); if (sig !== $('cycSide').dataset.sig) { $('cycSide').dataset.sig = sig; $('cycSide').innerHTML = side.map(([k, v, u]) => `<div><dt>${k}</dt><dd class="num">${v}<span class="u">${u}</span></dd></div>`).join(''); }
    $('cycSub').textContent = L.driveTime > 0 ? `ratio 1 : ${(L.recoveryTime / L.driveTime).toFixed(1)} · drive ${L.driveTime.toFixed(2)} s` : 'drive and recovery as one turn';
  }
  anim = requestAnimationFrame(animate);
}
/** Your best of the piece on the monitor, looked up once per piece. */
function bestFor(ev) {
  if (!ev?.target || best.key === ev.key) return best.session;
  best = { key: ev.key, session: null };
  db.all().then((all) => { if (best.key === ev.key) best.session = personalBests(ofEvent(all, ev.key).filter(completed)).get(ev.key) || null; }).catch(() => {});
  return null;
}
function renderProj(ev, L) {
  const pr = ev?.target ? project({ target: ev.target, best: bestFor(ev), L, strokes: engine.session?.strokes ?? [] }) : null;
  $('proj').hidden = !ev?.target; $('projEmpty').hidden = !!ev?.target;
  if (!ev?.target) return;
  $('prSub').textContent = `${ev.label} · at your pace over the last 20 s`;
  $('prK').textContent = pr?.bigK ?? (ev.target.distance ? 'Projected finish' : 'Projected distance');
  $('prBig').textContent = pr?.big ?? '–';
  $('prDelta').textContent = pr?.delta ? `${pr.delta} vs best` : (pr && !pr.best ? 'no best yet for this piece' : '\u00a0');
  $('prDelta').classList.toggle('ahead', !!pr?.ahead);
  $('prBestK').textContent = `Best ${ev.label}`; $('prBest').textContent = pr?.best ?? '–';
  $('prNeed').textContent = pr?.need ?? '–'; $('prNeedK').textContent = pr?.need && pr.need.includes(':') ? `/500m ${pr.needK}` : '';
  $('prNow').textContent = pr?.now ?? '–';
  $('prFill').style.width = `${(Math.min(1, Math.max(0, pr?.frac ?? 0)) * 100).toFixed(1)}%`;
}
let doneId = null;
function showDone(sess) {
  const m = sess.summary; if (!m || !(m.distance > 0)) return;
  doneId = sess.id;
  const ev = classify(sess);
  $('dcK').textContent = `${ev.label} · complete`;
  $('dcBig').textContent = ev.target?.time ? `${fmtInt(m.distance)} m` : fmtTime(m.elapsed, 1);
  const cells = [['Pace', fmtPace(m.avgPace), '/500m'], ['Power', fmtInt(m.avgPower), 'W'], ['Rate', m.avgSpm ? m.avgSpm.toFixed(1) : '–', 'spm'], ['Strokes', m.strokes, ''], [ev.target?.time ? 'Time' : 'Distance', ev.target?.time ? fmtTime(m.elapsed) : fmtInt(m.distance), ev.target?.time ? '' : 'm'], ['Work', (m.work / 1000).toFixed(1), 'kJ']];
  $('dcGrid').innerHTML = cells.map(([k, v, u]) => `<div><div class="k">${k}</div><div class="v num">${v}<span class="u">${u}</span></div></div>`).join('');
  $('doneCard').hidden = false;
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
  if (LIVE_SVG.includes(p)) { boat?.resize(); cyc?.resize(); cons?.resize(); kick(); }
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
  const pwk = workoutFromStatus(L), pt = pwk ? classify({ workout: pwk }).target : null;
  const toGo = pt?.distance ? ` · ${fmtInt(Math.max(0, pt.distance - (L.distance || 0)))} m to go` : pt?.time ? ` · ${fmtTime(Math.max(0, pt.time - (L.elapsed || 0)))} to go` : '';
  $('heroSub').textContent = (u === 'pace' ? `avg ${fmtPace(L.avgPace)}` : u === 'watts' ? `avg ${fmtInt(L.avgPower)} W` : `${fmtInt(L.totalCalories)} kcal total`) + toGo;
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
