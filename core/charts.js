// core/charts.js — Plotly figure builders shared by every screen.
// Each builder returns { data, layout }; draw() renders it. Colors come from the live CSS theme tokens,
// type sizes from the root font size, so charts follow theme and scale everywhere.
import { fmtPace, fmtPaceShort, fmtTime, mean, stddev, resample, peakAt, CURVE_N } from './format.js';

const root = document.documentElement;
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// One type scale: chart text derives from the root font size, so charts scale with the UI on every screen.
export const remPx = () => parseFloat(getComputedStyle(root).fontSize) || 16;
export const chartFs = () => Math.max(11, Math.round(remPx() * 0.8));
const LW = (fs) => +(1.4 + fs * 0.06).toFixed(2);          // primary line weight (~2.2 px at 13 px type)
const DOT = (fs) => Math.round(fs * 0.55);                  // primary marker size

function T() {
  const cs = getComputedStyle(root), g = (v) => cs.getPropertyValue(v).trim();
  return { accent: g('--accent'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), grid: g('--grid'), zero: g('--zero'), surface: g('--surface'), surface2: g('--surface-2'), border: g('--border') };
}
const hexRGB = (hex) => { let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hexA = (hex, a) => `rgba(${hexRGB(hex).join(',')},${a})`;
const mix = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// sequential ramp: surface → accent (magnitude reads as luminance on dark, as depth on light)
const seqScale = (t, floor = 0) => [0, 0.2, 0.45, 0.7, 1].map((k) => [k, mix(t.surface, t.accent, floor + (1 - floor) * Math.pow(k, 0.85))]);

function axis(t, fs, o = {}) {
  const { title, ...rest } = o;
  const ax = { gridcolor: t.grid, gridwidth: 1, zeroline: false, showline: false, ticks: '', tickfont: { size: fs, color: t.muted, family: FONT }, fixedrange: true, automargin: false, ...rest };
  if (title) ax.title = { text: title, font: { size: Math.max(11, Math.round(fs * 0.9)), color: t.muted, family: FONT }, standoff: Math.round(fs * 0.6) };
  return ax;
}
function baseLayout(t, w, h, fs, xaxis, yaxis, extra = {}) {
  const { margin, ...rest } = extra;
  return {
    width: w, height: h, margin: { l: Math.round(fs * 4.6), r: Math.round(fs * 1.0), t: Math.round(fs * 1.4), b: Math.round(fs * 3.6), ...(margin || {}) },
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: FONT, size: fs, color: t.muted },
    showlegend: false, xaxis, yaxis, hovermode: 'closest', dragmode: false,
    hoverlabel: { bgcolor: t.surface2, bordercolor: t.border, font: { family: FONT, size: fs, color: t.ink } }, ...rest,
  };
}
// reference-line label with a surface-colored plate, so lines never cut through text
const refLabel = (t, fs, o) => ({ showarrow: false, bgcolor: t.surface, borderpad: 3, font: { size: fs, color: t.ink2, family: FONT }, ...o });
function emptyFig(t, w, h, fs, msg) {
  return { data: [], layout: { width: w, height: h, margin: { l: 0, r: 0, t: 0, b: 0 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: { visible: false }, yaxis: { visible: false },
    annotations: [{ text: msg, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5, showarrow: false, font: { family: FONT, size: fs, color: t.muted } }] } };
}
function stepTicks(lo, hi, steps, maxN) {
  const step = steps.find((s) => (hi - lo) / s <= maxN) ?? steps[steps.length - 1];
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
const VAL_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const PACE_STEPS = [1, 2, 5, 10, 15, 30, 60];
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const DRIVE_X = (t, fs) => axis(t, fs, { range: [0, 100], tickvals: [0, 25, 50, 75, 100], ticktext: ['catch', '25%', '50%', '75%', 'finish'] });

// ---- live + history: power per stroke
function powerFig(strokes, { w, h, fs, live, window: win = 40 }) {
  const t = T(), d = strokes.filter((s) => s.power > 0).slice(-win);
  if (!d.length) return emptyFig(t, w, h, fs, live ? 'Stroke power appears once you start rowing' : 'No stroke data');
  const ys = d.map((s) => s.power), m = mean(ys), mx = Math.max(...ys), n = d.length;
  const first = d[0].strokeCount, span = live ? win : n;   // fixed window: bar width never depends on how long you've rowed
  const top = mx * 1.18;
  const trace = {
    type: 'bar', x: d.map((s) => s.strokeCount), y: ys,
    width: 0.56, marker: { color: t.accent, opacity: live ? d.map((_, i) => (i === n - 1 ? 1 : 0.45)) : 0.88, cornerradius: 1.5 },
    customdata: d.map((s) => [fmtPace(s.pace), s.spm ?? '–']),
    hovertemplate: 'Stroke %{x}<br><b>%{y} W</b> · %{customdata[0]} /500m · %{customdata[1]} spm<extra></extra>',
  };
  const xa = axis(t, fs, { title: 'stroke', showgrid: false, range: [first - 0.6, first + span - 0.4], nticks: 7 });
  const ya = axis(t, fs, { title: 'watts', range: [0, top], tickvals: stepTicks(0, top, VAL_STEPS, 4).filter((v) => v > 0) });
  return { data: [trace], layout: baseLayout(t, w, h, fs, xa, ya, {
    shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: m, y1: m, line: { color: t.ink2, width: 1.2, dash: 'dot' } }],
  }) };
}

// ---- live: this stroke vs. session average (+ faint trail of the previous strokes)
function forceFig({ cur, avg, prev = [] }, { w, h, fs, live }) {
  const t = T();
  if (!cur && !avg) return emptyFig(t, w, h, fs, live ? 'Force curve appears with your first stroke' : 'No force data');
  const X = (a) => a.map((_, i) => (i / (a.length - 1)) * 100);
  const data = [], ann = [];
  prev.forEach((p, i) => data.push({ type: 'scatter', mode: 'lines', x: X(p), y: p, hoverinfo: 'skip', opacity: 0.1 + 0.07 * i,
    line: { color: t.accent, width: 1, shape: 'spline', smoothing: 0.5 } }));
  if (avg) data.push({ type: 'scatter', mode: 'lines', x: X(avg), y: avg, line: { color: t.ink2, width: 1.4, dash: 'dash', shape: 'spline', smoothing: 0.5 },
    hovertemplate: 'average · %{y:.0f} N<extra></extra>' });
  if (cur) {
    data.push({ type: 'scatter', mode: 'lines', x: X(cur), y: cur, fill: 'tozeroy', fillcolor: hexA(t.accent, 0.1),
      line: { color: t.accent, width: LW(fs), shape: 'spline', smoothing: 0.5 }, hovertemplate: '%{x:.0f}% of drive · <b>%{y:.0f} N</b><extra></extra>' });
    const pk = Math.max(...cur), px = peakAt(cur) * 100;
    data.push({ type: 'scatter', mode: 'markers', x: [px], y: [pk], hoverinfo: 'skip', marker: { size: DOT(fs), color: t.accent, line: { color: t.surface, width: 1.5 } } });
    ann.push({ x: px, y: pk, text: `${Math.round(pk)} N`, showarrow: false, yanchor: 'bottom', yshift: Math.round(fs * 0.6), font: { size: fs, color: t.ink, family: FONT } });
  }
  if (avg && cur) ann.push({ xref: 'paper', yref: 'paper', x: 1, y: 1, xanchor: 'right', yanchor: 'top', text: '– – average', showarrow: false, font: { size: Math.round(fs * 0.9), color: t.ink2, family: FONT } });
  const top = Math.max(...[...(cur || []), ...(avg || []), ...prev.flat()]) * 1.22;
  const ya = axis(t, fs, { title: 'newtons', range: [0, top], tickvals: stepTicks(0, top, VAL_STEPS, 4).filter((v) => v > 0) });
  return { data, layout: baseLayout(t, w, h, fs, DRIVE_X(t, fs), ya, { annotations: ann, margin: { b: Math.round(fs * 2.4), r: Math.round(fs * 2.4) } }) };
}

// ---- live + history: pace trace (faster is up)
function paceFig(samples, { w, h, fs, live, avgPace }) {
  const t = T(), d = samples.filter((s) => s.pace > 0);
  if (d.length < 2) return emptyFig(t, w, h, fs, live ? 'Pace trace appears after a few seconds of rowing' : 'No pace data');
  const ps = d.map((s) => s.pace), lo = Math.min(...ps), hi = Math.max(...ps), pad = Math.max(1.5, (hi - lo) * 0.15);
  const yLo = lo - pad, yHi = hi + pad, yt = stepTicks(yLo, yHi, PACE_STEPS, 5);
  const t0 = d[0].t, t1 = d[d.length - 1].t, xt = stepTicks(t0, t1, TIME_STEPS, 5);
  const data = [{
    type: 'scatter', mode: 'lines', x: d.map((s) => s.t), y: ps, line: { color: t.accent, width: LW(fs), shape: 'spline', smoothing: 0.4 },
    customdata: d.map((s) => [fmtTime(s.t), fmtPace(s.pace), s.spm ?? '–', s.hr ?? '–']),
    hovertemplate: '%{customdata[0]}<br><b>%{customdata[1]}</b> /500m · %{customdata[2]} spm · %{customdata[3]} bpm<extra></extra>',
  }];
  if (live) data.push({ type: 'scatter', mode: 'markers', x: [t1], y: [ps[ps.length - 1]], hoverinfo: 'skip', marker: { size: DOT(fs), color: t.accent, line: { color: t.surface, width: 1.5 } } });
  const shapes = [], ann = [];
  if (avgPace && avgPace > yLo && avgPace < yHi) {
    shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: avgPace, y1: avgPace, line: { color: t.ink2, width: 1.2, dash: 'dot' } });
  }
  const xa = axis(t, fs, { title: 'elapsed', range: [t0, t1], tickvals: xt, ticktext: xt.map(fmtTime) });
  const ya = axis(t, fs, { title: '/500m', range: [yHi, yLo], tickvals: yt, ticktext: yt.map(fmtPaceShort) });
  return { data, layout: baseLayout(t, w, h, fs, xa, ya, { shapes, annotations: ann }) };
}

// ---- live + history: stroke map — heatmap of every stroke's force curve, newest on top
function mapFig(strokes, { w, h, fs, live }) {
  const t = T(), d = strokes.filter((s) => s.curve && s.curve.length > 3);
  if (d.length < 2) return emptyFig(t, w, h, fs, live ? 'The stroke map builds after a few strokes' : 'No force data for this session');
  const z = d.map((s) => resample(s.curve, CURVE_N)), x = z[0].map((_, i) => (i / (CURVE_N - 1)) * 100), y = d.map((s) => s.strokeCount);
  const zmax = Math.max(...z.flat());
  const cb = { thickness: Math.round(fs * 0.55), len: 0.8, outlinewidth: 0, x: 1.01, xpad: 0, ticks: '', tickfont: { size: Math.round(fs * 0.85), color: t.muted, family: FONT },
    title: { text: 'N', side: 'top', font: { size: Math.round(fs * 0.85), color: t.muted, family: FONT } }, nticks: 4 };
  const data = [
    { type: 'heatmap', z, x, y, zmin: 0, zmax, zsmooth: 'best', colorscale: seqScale(t), colorbar: cb,
      hovertemplate: 'Stroke %{y} · %{x:.0f}% of drive<br><b>%{z:.0f} N</b><extra></extra>' },
    { type: 'scatter', mode: 'markers', x: d.map((s) => peakAt(s.curve) * 100), y, hoverinfo: 'skip',
      marker: { size: d.length > 120 ? 2.5 : 3.5, color: t.ink, opacity: 0.8, line: { width: 0 } } },
  ];
  const ya = axis(t, fs, { title: 'stroke', showgrid: false, range: [y[0] - 0.5, y[y.length - 1] + 0.5], nticks: 6 });
  const xa = DRIVE_X(t, fs); xa.showgrid = false;
  return { data, layout: baseLayout(t, w, h, fs, xa, ya, { margin: { r: Math.round(fs * 4), b: Math.round(fs * 2.4) } }) };
}

// ---- history: pace / rate / HR as aligned subplots (one x, never two y-scales on one plot)
function trendFig(samples, { w, h, fs, avgPace }) {
  const t = T(), d = samples.filter((s) => s.pace > 0);
  if (d.length < 2) return emptyFig(t, w, h, fs, 'No time-series data');
  const hasHr = d.some((s) => s.hr > 0);
  const dom = hasHr ? { p: [0.47, 1], r: [0.235, 0.39], h: [0, 0.155] } : { p: [0.36, 1], r: [0, 0.27] };
  const xs = d.map((s) => s.t), ps = d.map((s) => s.pace), lo = Math.min(...ps), hi = Math.max(...ps), pad = Math.max(1.5, (hi - lo) * 0.12);
  const yt = stepTicks(lo - pad, hi + pad, PACE_STEPS, 6), xt = stepTicks(xs[0], xs[xs.length - 1], TIME_STEPS, 8);
  const rates = d.map((s) => s.spm).filter(Boolean), hrs = d.map((s) => s.hr).filter(Boolean);
  const cd = d.map((s) => [fmtTime(s.t), fmtPace(s.pace), s.spm ?? '–', s.hr ?? '–']);
  const ht = '%{customdata[0]} · <b>%{customdata[1]}</b> /500m · %{customdata[2]} spm · %{customdata[3]} bpm<extra></extra>';
  const data = [
    { type: 'scatter', mode: 'lines', x: xs, y: ps, yaxis: 'y', line: { color: t.accent, width: LW(fs), shape: 'spline', smoothing: 0.4 }, customdata: cd, hovertemplate: ht },
    { type: 'scatter', mode: 'lines', x: xs, y: d.map((s) => s.spm), yaxis: 'y2', line: { color: t.ink2, width: 1.4, shape: 'hv' }, hoverinfo: 'skip' },
  ];
  if (hasHr) data.push({ type: 'scatter', mode: 'lines', x: xs, y: d.map((s) => s.hr || null), yaxis: 'y3', line: { color: t.ink2, width: 1.4, shape: 'spline' }, connectgaps: true, hoverinfo: 'skip' });
  const layout = baseLayout(t, w, h, fs,
    axis(t, fs, { title: 'elapsed', anchor: hasHr ? 'y3' : 'y2', range: [xs[0], xs[xs.length - 1]], tickvals: xt, ticktext: xt.map(fmtTime),
      showspikes: true, spikemode: 'across', spikethickness: 1, spikedash: 'solid', spikecolor: t.zero, spikesnap: 'cursor' }),
    axis(t, fs, { domain: dom.p, range: [hi + pad, lo - pad], tickvals: yt, ticktext: yt.map(fmtPaceShort) }),
    { hovermode: 'x', margin: { t: Math.round(fs * 1.8), r: Math.round(fs * 6.2) } });
  const rLo = Math.min(...rates) - 1, rHi = Math.max(...rates) + 1;
  layout.yaxis2 = axis(t, fs, { domain: dom.r, range: [rLo, rHi], tickvals: stepTicks(rLo, rHi, [1, 2, 5, 10], 3) });
  if (hasHr) { const a = Math.min(...hrs) - 3, b = Math.max(...hrs) + 3; layout.yaxis3 = axis(t, fs, { domain: dom.h, range: [a, b], tickvals: stepTicks(a, b, [5, 10, 20, 25, 50], 3) }); }
  const lab = (y, text) => ({ xref: 'paper', yref: 'paper', x: 0, y, xanchor: 'left', yanchor: 'bottom', showarrow: false, text, font: { size: Math.round(fs * 0.85), color: t.ink2, family: FONT } });
  layout.annotations = [lab(dom.p[1], 'PACE /500m'), lab(dom.r[1], 'RATE spm')];
  if (hasHr) layout.annotations.push(lab(dom.h[1], 'HEART RATE bpm'));
  if (avgPace) {
    layout.shapes = [{ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: avgPace, y1: avgPace, line: { color: t.ink2, width: 1.2, dash: 'dot' } }];
    layout.annotations.push(refLabel(t, fs, { xref: 'paper', yref: 'y', x: 1, y: avgPace, xanchor: 'left', xshift: 6, yanchor: 'middle', bgcolor: 'rgba(0,0,0,0)', text: `avg<br>${fmtPace(avgPace)}`, align: 'left' }));
  }
  return { data, layout };
}

// ---- history: splits (interpolated from stroke distance/time)
function computeSplits(strokes) {
  const d = strokes.filter((s) => s.distance > 0 && s.elapsed > 0);
  if (d.length < 3) return { L: 0, out: [] };
  const total = d[d.length - 1].distance, L = total >= 1500 ? 500 : total >= 500 ? 100 : 50;
  const pts = [{ elapsed: 0, distance: 0 }, ...d], out = [];
  let k = 1, prevT = 0, from = 0;
  for (let i = 1; i < pts.length; i++) {
    while (pts[i].distance >= k * L) {
      const a = pts[i - 1], b = pts[i], f = (k * L - a.distance) / ((b.distance - a.distance) || 1), tk = a.elapsed + f * (b.elapsed - a.elapsed);
      const seg = d.slice(Math.max(0, from - 1), i).filter((s) => s.power > 0);
      out.push({ n: k, end: k * L, time: tk - prevT, pace: ((tk - prevT) / L) * 500, watts: mean(seg.map((s) => s.power)), spm: mean(seg.map((s) => s.spm).filter(Boolean)) });
      prevT = tk; from = i; k++;
    }
  }
  return { L, out };
}
function splitsFig(strokes, { w, h, fs }) {
  const t = T(), { L, out } = computeSplits(strokes);
  if (out.length < 1) return { fig: emptyFig(t, w, h, fs, 'Row at least 50 m for splits'), L };
  const ps = out.map((s) => s.pace), lo = Math.min(...ps), hi = Math.max(...ps), pad = Math.max(1, (hi - lo) * 0.35), m = mean(ps);
  const yt = stepTicks(lo - pad, hi + pad, PACE_STEPS, 4);
  const data = [{
    type: 'scatter', mode: 'lines+markers+text', x: out.map((s) => s.end), y: ps,
    line: { color: hexA(t.accent, 0.45), width: 1.4 }, marker: { size: DOT(fs), color: t.accent, line: { color: t.surface, width: 1.5 } },
    text: out.length <= 12 ? ps.map(fmtPace) : [], textposition: 'top center', textfont: { size: Math.round(fs * 0.85), color: t.ink, family: FONT },
    customdata: out.map((s) => [fmtPace(s.pace), fmtTime(s.time), s.watts ? Math.round(s.watts) : '–', s.spm ? s.spm.toFixed(1) : '–']),
    hovertemplate: 'to %{x} m<br><b>%{customdata[0]}</b> /500m · %{customdata[1]}<br>%{customdata[2]} W · %{customdata[3]} spm<extra></extra>',
  }];
  const xa = axis(t, fs, { title: `distance (${L} m splits)`, tickvals: out.length <= 12 ? out.map((s) => s.end) : undefined, nticks: 8, range: [L * 0.4, out[out.length - 1].end + L * 0.6], showgrid: false });
  const ya = axis(t, fs, { range: [hi + pad, lo - pad], tickvals: yt, ticktext: yt.map(fmtPaceShort), title: '/500m' });
  return { fig: { data, layout: baseLayout(t, w, h, fs, xa, ya, {
    margin: { r: Math.round(fs * 5.4) },
    shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: m, y1: m, line: { color: t.ink2, width: 1.2, dash: 'dot' } }],
    annotations: [refLabel(t, fs, { xref: 'paper', x: 1, y: m, xanchor: 'left', xshift: 6, yanchor: 'middle', bgcolor: 'rgba(0,0,0,0)', align: 'left', text: `avg<br>${fmtPace(m)}` })],
  }) }, L };
}

// ---- history: power distribution with mean ± 1σ band
function histFig(strokes, { w, h, fs }) {
  const t = T(), ys = strokes.map((s) => s.power).filter((v) => v > 0);
  if (ys.length < 5) return { fig: emptyFig(t, w, h, fs, 'Not enough strokes'), m: null };
  const m = mean(ys), sd = stddev(ys), lo = Math.min(...ys), hi = Math.max(...ys);
  const target = Math.min(30, Math.max(6, Math.round(1.5 * Math.sqrt(ys.length))));   // bin count follows sample size
  const bs = [1, 2, 5, 10, 20, 25, 50].find((b) => (hi - lo) / b <= target) ?? 50;
  const data = [{ type: 'histogram', x: ys, xbins: { start: Math.floor(lo / bs) * bs, end: Math.ceil(hi / bs) * bs + bs, size: bs },
    marker: { color: t.accent, line: { width: 0 }, cornerradius: 1.5 }, opacity: 0.88,
    hovertemplate: '%{x} W<br><b>%{y} strokes</b><extra></extra>' }];
  const xa = axis(t, fs, { title: 'watts', showgrid: false, nticks: 8 });
  const start = Math.floor(lo / bs) * bs, counts = {};
  ys.forEach((v) => { const k = Math.floor((v - start) / bs); counts[k] = (counts[k] || 0) + 1; });
  const cmax = Math.max(...Object.values(counts)) * 1.12;
  const ya = axis(t, fs, { title: 'strokes', range: [0, cmax], tickvals: stepTicks(0, cmax, [1, 2, 5, 10, 20, 25, 50, 100, 200], 4).filter((v) => v > 0) });
  return { fig: { data, layout: baseLayout(t, w, h, fs, xa, ya, {
    bargap: 0.18,
    shapes: [
      { type: 'rect', xref: 'x', yref: 'paper', x0: m - sd, x1: m + sd, y0: 0, y1: 1, fillcolor: hexA(t.accent, 0.09), line: { width: 0 }, layer: 'below' },
      { type: 'line', xref: 'x', yref: 'paper', x0: m, x1: m, y0: 0, y1: 1, line: { color: t.ink2, width: 1.5, dash: 'dot' } },
    ],
    margin: { t: Math.round(fs * 2.2) },
    annotations: [{ xref: 'x', yref: 'paper', x: m, y: 1, yanchor: 'bottom', yshift: 4, showarrow: false, text: `mean ${Math.round(m)} W`, font: { size: fs, color: t.ink2, family: FONT } }],
  }) }, m, sd, cv: sd / m };
}

// ---- history: rate vs power, colored by elapsed time
function scatterFig(strokes, { w, h, fs }) {
  const t = T(), d = strokes.filter((s) => s.power > 0 && s.spm > 0);
  if (d.length < 5) return emptyFig(t, w, h, fs, 'Not enough strokes');
  const jit = (i) => (((i * 37) % 11) - 5) / 28;   // deterministic jitter: spm is an integer
  const data = [{ type: 'scatter', mode: 'markers', x: d.map((s, i) => s.spm + jit(i)), y: d.map((s) => s.power),
    marker: { size: DOT(fs), color: d.map((s) => s.elapsed / 60), colorscale: seqScale(t, 0.28), opacity: 0.9, line: { width: 0 },
      colorbar: { thickness: Math.round(fs * 0.55), len: 0.8, outlinewidth: 0, x: 1.01, xpad: 0, ticks: '', tickfont: { size: Math.round(fs * 0.85), color: t.muted, family: FONT },
        title: { text: 'min', side: 'top', font: { size: Math.round(fs * 0.85), color: t.muted, family: FONT } }, nticks: 4 } },
    customdata: d.map((s) => [s.strokeCount, s.spm, fmtTime(s.elapsed)]),
    hovertemplate: 'Stroke %{customdata[0]} · %{customdata[2]}<br><b>%{y} W</b> at %{customdata[1]} spm<extra></extra>' }];
  const xa = axis(t, fs, { title: 'stroke rate (spm)', dtick: 1, range: [Math.min(...d.map((s) => s.spm)) - 1, Math.max(...d.map((s) => s.spm)) + 1] });
  const ya = axis(t, fs, { title: 'watts', nticks: 6 });
  return { data, layout: baseLayout(t, w, h, fs, xa, ya, { margin: { r: Math.round(fs * 4) } }) };
}

// ---- history: force curve mean ± 1σ, first vs last quarter
function forceBandFig(strokes, avgCurve, { w, h, fs }) {
  const t = T(), C = strokes.filter((s) => s.curve && s.curve.length > 3).map((s) => resample(s.curve, CURVE_N));
  if (C.length < 4) return avgCurve ? forceFig({ cur: null, avg: avgCurve }, { w, h, fs, live: false }) : emptyFig(t, w, h, fs, 'No force data for this session');
  const x = C[0].map((_, i) => (i / (CURVE_N - 1)) * 100);
  const col = (i) => C.map((c) => c[i]);
  const mu = x.map((_, i) => mean(col(i))), sd = x.map((_, i) => stddev(col(i)));
  const q = Math.max(2, Math.floor(C.length / 4));
  const avgOf = (set) => x.map((_, i) => mean(set.map((c) => c[i])));
  const first = avgOf(C.slice(0, q)), last = avgOf(C.slice(-q));
  const sp = { shape: 'spline', smoothing: 0.5 };
  const data = [
    { type: 'scatter', mode: 'lines', x, y: mu.map((v, i) => v + sd[i]), line: { width: 0, ...sp }, hoverinfo: 'skip', showlegend: false },
    { type: 'scatter', mode: 'lines', x, y: mu.map((v, i) => Math.max(0, v - sd[i])), line: { width: 0, ...sp }, fill: 'tonexty', fillcolor: hexA(t.ink2, 0.16), hoverinfo: 'skip', name: 'mean ± 1σ', showlegend: true },
    { type: 'scatter', mode: 'lines', x, y: mu, line: { color: t.ink2, width: 1.4, ...sp }, name: 'mean', showlegend: false, hovertemplate: 'mean · %{y:.0f} N<extra></extra>' },
    { type: 'scatter', mode: 'lines', x, y: first, line: { color: t.accent, width: 1.5, dash: 'dash', ...sp }, name: `first ${q} strokes`, hovertemplate: 'first ¼ · %{y:.0f} N<extra></extra>' },
    { type: 'scatter', mode: 'lines', x, y: last, line: { color: t.accent, width: LW(fs), ...sp }, name: `last ${q} strokes`, hovertemplate: 'last ¼ · %{y:.0f} N<extra></extra>' },
  ];
  const top = Math.max(...mu.map((v, i) => v + sd[i]), ...first, ...last) * 1.12;
  const ya = axis(t, fs, { title: 'newtons', range: [0, top], tickvals: stepTicks(0, top, VAL_STEPS, 4).filter((v) => v > 0) });
  return { data, layout: baseLayout(t, w, h, fs, DRIVE_X(t, fs), ya, {
    showlegend: true, hovermode: 'x',
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { size: Math.round(fs * 0.9), color: t.ink2, family: FONT }, bgcolor: 'rgba(0,0,0,0)', itemclick: false, itemdoubleclick: false },
    margin: { t: Math.round(fs * 2.6), b: Math.round(fs * 2.4), r: Math.round(fs * 2.4) },
  }) };
}

function draw(el, fig, interactive) {
  if (!window.Plotly) return false;
  Plotly.react(el, fig.data, fig.layout, { displayModeBar: false, staticPlot: !interactive, responsive: false, scrollZoom: false, doubleClick: false });
  return true;
}

// Aspect-ratio limits (height / width): a chart stops growing at its limit and is centered,
// leaving the rest as margin — never stretched to fill whatever box it lands in.
export const RATIO = { power: [0.42, 0.72], force: [0.5, 0.9], pace: [0.42, 0.72], map: [0.6, 1.3] };
export function fit(el, [rMin, rMax]) {
  const W = el.clientWidth, H = el.clientHeight;
  let w = W, h = Math.min(H, W * rMax);
  if (h < w * rMin) w = Math.min(W, h / rMin);
  return { w: Math.floor(w), h: Math.floor(h) };
}

export { T, hexA, mix, seqScale, powerFig, forceFig, paceFig, mapFig, trendFig, splitsFig, histFig, scatterFig, forceBandFig, draw };
