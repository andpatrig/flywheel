// screens/live.js — the live dashboard: Metrics, Power, Force, Pace, Stroke map.
// Phone: one display at a time, tap to cycle. Wide screens: all five in a grid.
import html from './live.html.js';
import { engine } from '../core/session.js';
import { prefs, savePrefs, onThemeChange } from '../core/theme.js';
import { $, twoTap } from '../core/ui.js';
import { fmtPace, fmtTime, fmtInt, mean, stddev, peakAt } from '../core/format.js';
import { STROKE_STATE, WORKOUT_STATE } from '../core/pm5.js';
import { chartFs, RATIO, fit, powerFig, forceFig, paceFig, mapFig, draw } from '../core/charts.js';

export const id = 'live';
const root = document.documentElement;
const PANELS = ['metrics', 'power', 'force', 'pace', 'map'];
const PANEL_NAME = { metrics: 'Metrics', power: 'Power', force: 'Force', pace: 'Pace', map: 'Stroke map' };
const UNITS = ['pace', 'watts', 'cal'];
const UNIT_NAME = { pace: '/500m', watts: 'Watts', cal: 'Cal/hr' };

let shown = false, PLOT = null;

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

  setPanel(prefs.panel, false); syncUnits(); renderMetrics();
}
export function show() { shown = true; markAll(); }
export function hide() { shown = false; }

// ---------- display cycling
export function setPanel(p, persist = true) {
  if (!PANELS.includes(p)) p = 'metrics';
  prefs.panel = p; if (persist) savePrefs();
  document.querySelectorAll('#display .panel').forEach((el) => el.classList.toggle('active', el.dataset.panel === p));
  $('displayName').textContent = PANEL_NAME[p];
  document.querySelectorAll('.pips i').forEach((el, i) => el.classList.toggle('on', PANELS[i] === p));
  mark(p);
}
const nextPanel = (dir = 1) => setPanel(PANELS[(PANELS.indexOf(prefs.panel) + dir + PANELS.length) % PANELS.length]);
const syncUnits = () => { $('unitsName').textContent = UNIT_NAME[prefs.units]; };
function setRecording(on) {
  $('saveBtn').disabled = !on; $('saveBtn').classList.toggle('rec', on);
  $('saveK').textContent = on ? 'Recording' : 'Session';
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
const visible = (p) => shown && (root.dataset.mode === 'grid' || prefs.panel === p);
function mark(...ps) { ps.forEach((p) => dirty.add(p)); if (!raf) raf = requestAnimationFrame(flush); }
function markAll() { mark(...PANELS); }
function flush() { raf = 0; for (const p of [...dirty]) if (visible(p) && renderPanel(p)) dirty.delete(p); }
function renderPanel(p) {
  if (p === 'metrics') { renderMetrics(); return true; }
  const el = PLOT[p];
  if (!el.clientWidth || !el.clientHeight) return false;
  const { w, h } = fit(el, RATIO[p]);
  const o = { w, h, fs: chartFs(), live: true }, st = engine.session?.strokes ?? [];
  let fig;
  if (p === 'power') fig = powerFig(st, { ...o, window: root.dataset.mode === 'grid' ? 60 : 40 });
  else if (p === 'force') {
    const wc = st.filter((s) => s.curve), cur = wc[wc.length - 1]?.curve ?? null;
    fig = forceFig({ cur, avg: engine.avgCurve(), prev: wc.slice(-5, -1).map((s) => s.curve) }, o);
  } else if (p === 'pace') fig = paceFig(engine.session?.samples ?? [], { ...o, avgPace: engine.latest.avgPace });
  else fig = mapFig(st.slice(-60), o);
  return draw(el, fig, false);
}
