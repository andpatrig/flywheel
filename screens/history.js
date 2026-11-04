// screens/history.js — saved sessions list and the post-workout analysis report.
import html from './history.html.js';
import { onThemeChange } from '../core/theme.js';
import { $, toast, twoTap } from '../core/ui.js';
import { fmtPace, fmtTime, fmtInt } from '../core/format.js';
import { db, sessionJSON, exportFile, fileStamp } from '../core/store.js';
import { chartFs, trendFig, splitsFig, histFig, forceBandFig, scatterFig, mapFig, draw } from '../core/charts.js';

export const id = 'history';
let shown = false, openSession = null;

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
export function hide() { shown = false; }

async function render() {
  const all = await db.all().catch(() => []);
  $('historyEmpty').hidden = all.length > 0 || !!openSession;
  $('historyList').hidden = !!openSession; $('sessionDetail').hidden = !openSession;
  if (openSession) return renderDetail(openSession);
  $('historyList').innerHTML = all.map((s) => {
    const d = new Date(s.startedAt), m = s.summary;
    return `<div class="item" data-id="${s.id}">
      <div class="t">${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
      <div class="big num">${fmtInt(m.distance)} m</div>
      <div class="m num">${fmtTime(m.elapsed)} · ${fmtPace(m.avgPace)} /500m${m.avgPower ? ' · ' + Math.round(m.avgPower) + ' W' : ''} · ${m.strokes} strokes</div>
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
  $('dTitle').textContent = `${fmtInt(m.distance)} m · ${fmtTime(m.elapsed)}`;
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
  draw($('hScatter'), scatterFig(s.strokes, o('hScatter')), true);
  draw($('hMap'), mapFig(s.strokes, o('hMap')), true);
}
