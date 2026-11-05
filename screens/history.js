// screens/history.js — saved sessions list and the post-workout analysis report.
import html from './history.html.js';
import { onThemeChange } from '../core/theme.js';
import { $, toast, twoTap } from '../core/ui.js';
import { fmtPace, fmtTime, fmtInt } from '../core/format.js';
import { db, sessionJSON, exportFile, fileStamp } from '../core/store.js';
import { classify, personalBests, completed } from '../core/events.js';
import { chartFs, trendFig, splitsFig, histFig, forceBandFig, effFig, computeSplits, mapFig, draw } from '../core/charts.js';

export const id = 'history';
let shown = false, openSession = null, filter = 'all';

export function mount(el) {
  el.innerHTML = html;
  $('backBtn').onclick = () => { openSession = null; render(); };
  $('delBtn').onclick = () => twoTap($('delBtn'), async () => {
    if (!openSession) return;
    await db.del(openSession.id); openSession = null; render(); toast('Session deleted');
  });
  $('jsonBtn').onclick = async () => {
    if (!openSession) return;
    const r = await exportFile(`flywheel_${fileStamp(openSession)}.json`, sessionJSON(openSession), 'application/json');
    if (r === 'downloaded') toast('Downloading — if nothing happens, use Copy');
    else if (r === 'unsupported') toast('Export not supported here — use Copy');
  };
  $('copyBtn').onclick = async () => {
    if (!openSession) return;
    try { await navigator.clipboard.writeText(sessionJSON(openSession)); toast('Session JSON copied'); }
    catch { toast('Clipboard blocked by this browser'); }
  };
  onThemeChange(() => { if (shown && openSession) renderDetail(openSession); });
  let rsz = 0;
  addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { if (shown && openSession) renderDetail(openSession); }, 120); });
}
export function show() { shown = true; render(); }
/** Open one session's report (from the Live screen's completion card). */
export async function openById(id) { const all = await db.all(); openSession = all.find((s) => s.id === id) || null; render(); }
export function hide() { shown = false; }

async function render() {
  const all = await db.all().catch(() => []);
  $('historyEmpty').hidden = all.length > 0 || !!openSession;
  $('historyList').hidden = !!openSession; $('sessionDetail').hidden = !openSession;
  if (openSession) return renderDetail(openSession);
  // event filter chips: one per event present, in order of first appearance (newest sessions first)
  const events = []; for (const s of all) { const e = classify(s); if (!events.find((x) => x.key === e.key)) events.push(e); }
  if (!events.find((e) => e.key === filter)) filter = 'all';
  $('historyFilters').innerHTML = events.length > 1 ? [{ key: 'all', label: 'All' }, ...events].map((e) => `<button class="chip${e.key === filter ? ' on' : ''}" data-key="${e.key}">${e.label}</button>`).join('') : '';
  $('historyFilters').querySelectorAll('.chip').forEach((c) => c.onclick = () => { filter = c.dataset.key; render(); });
  const pb = personalBests(all), rows = all.filter((s) => filter === 'all' || classify(s).key === filter);
  $('historyList').innerHTML = rows.map((s) => {
    const d = new Date(s.startedAt), m = s.summary, e = classify(s), isPb = pb.get(e.key)?.id === s.id, fixed = !!e.target;
    const headline = e.target?.time ? `${fmtInt(m.distance)} m` : e.target?.distance ? fmtTime(m.elapsed) : `${fmtInt(m.distance)} m`;
    const rest = e.target?.distance ? `${fmtInt(m.distance)} m` : fmtTime(m.elapsed);
    return `<div class="item" data-id="${s.id}">
      <div class="t"><span class="tag">${e.label}${fixed && !completed(s) ? ' · incomplete' : ''}</span>${isPb ? '<span class="tag pb">PB</span>' : ''} ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
      <div class="big num">${headline}</div>
      <div class="m num">${rest} · ${fmtPace(m.avgPace)} /500m${m.avgPower ? ' · ' + Math.round(m.avgPower) + ' W' : ''} · ${m.strokes} strokes</div>
    </div>`;
  }).join('');
  $('historyList').querySelectorAll('.item').forEach((el) => el.onclick = () => {
    openSession = all.find((s) => s.id === el.dataset.id); render();
    $('view-history').scrollTop = 0;
  });
}

function renderDetail(s) {
  if (!shown) return;
  const m = s.summary, d = new Date(s.startedAt);
  const ev = classify(s);
  $('dTitle').textContent = `${ev.label} · ${fmtInt(m.distance)} m · ${fmtTime(m.elapsed)}`;
  $('dMeta').textContent = `${d.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${s.ergType ? ' · ' + s.ergType : ''}${m.drag ? ' · drag ' + m.drag : ''}`;
  const stats = [
    ['Avg pace', fmtPace(m.avgPace), '/500m', true], ['Avg power', fmtInt(m.avgPower), 'W'], ['Rate', m.avgSpm ? m.avgSpm.toFixed(1) : '–', 'spm'],
    ['Heart rate', m.avgHr ? Math.round(m.avgHr) : '–', 'bpm'], ['Work', (m.work / 1000).toFixed(1), 'kJ'], ['Consistency', m.consistency != null ? (m.consistency * 100).toFixed(1) : '–', '% CV'],
  ];
  $('dStats').innerHTML = stats.map(([k, v, u, key]) => `<div class="stat${key ? ' key' : ''}"><div class="eyebrow">${k}</div><div class="v num">${v}<small>${u}</small></div></div>`).join('');
  const rows = [
    ['Strokes', m.strokes], ['Peak power', m.maxPower ? `${m.maxPower} W` : '–'],
    ['Avg peak handle force', m.avgPeakForce ? `${Math.round(m.avgPeakForce)} N` : '–'], ['Avg drive length', m.avgDriveLength ? `${m.avgDriveLength.toFixed(2)} m` : '–'],
    ['Drag factor', m.drag ?? '–'], ['Machine', s.ergType ?? '–'],
    ['Monitor', s.device ? [s.device.name, s.device.serial && `SN ${s.device.serial}`, s.device.firmware && `fw ${s.device.firmware}`].filter(Boolean).join(' · ') : '–'],
  ];
  $('dTable').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  const fs = chartFs(), o = (id) => ({ w: $(id).clientWidth, h: $(id).clientHeight, fs, live: false });
  draw($('hTrend'), trendFig(s.samples, { ...o('hTrend'), avgPace: m.avgPace }), true);
  const sp = splitsFig(s.strokes, o('hSplits')); draw($('hSplits'), sp.fig, true);
  $('hSplitsSub').textContent = sp.L ? `pace per ${sp.L} m · dotted = average` : 'pace per split';
  const hi = histFig(s.strokes, o('hHist')); draw($('hHist'), hi.fig, true);
  $('hHistSub').textContent = hi.m ? `σ ${hi.sd.toFixed(1)} W · CV ${(hi.cv * 100).toFixed(1)}% · band = mean ± 1σ` : 'strokes by watts';
  draw($('hForce'), forceBandFig(s.strokes, s.avgCurve, o('hForce')), true);
  draw($('hEff'), effFig(s.strokes, o('hEff')), true);
  // split table: one row per split, with the session average underneath
  const { L: SL, out: SP } = computeSplits(s.strokes);
  $('hSplitTSub').textContent = SL ? `${SL} m splits` : 'per split';
  const row = (c) => `<tr>${c.map((v, i) => `<td${i ? ' class="num"' : ''}>${v}</td>`).join('')}</tr>`;
  $('hSplitT').innerHTML = SP.length ? `<thead><tr><th>Split</th><th>Time</th><th>Pace</th><th>Watts</th><th>Rate</th><th>Strokes</th><th>m / stroke</th></tr></thead><tbody>`
    + SP.map((x) => row([`${fmtInt(x.end)} m`, fmtTime(x.time, 1), fmtPace(x.pace), x.watts ? Math.round(x.watts) : '–', x.spm ? x.spm.toFixed(1) : '–', x.strokes || '–', x.strokes ? (SL / x.strokes).toFixed(1) : '–'])).join('')
    + `</tbody><tfoot>${row(['Total', fmtTime(m.elapsed, 1), fmtPace(m.avgPace), m.avgPower ? Math.round(m.avgPower) : '–', m.avgSpm ? m.avgSpm.toFixed(1) : '–', m.strokes, m.strokes ? (m.distance / m.strokes).toFixed(1) : '–'])}</tfoot>`
    : '<tbody><tr><td>Row at least 50 m for splits</td></tr></tbody>';
  draw($('hMap'), mapFig(s.strokes, o('hMap')), true);
}
