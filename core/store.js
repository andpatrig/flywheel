// core/store.js — saved sessions (IndexedDB), summaries, JSON export.
import { mean, stddev } from './format.js';

export const db = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('flywheel', 1); r.onupgradeneeded = () => r.result.createObjectStore('sessions', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async put(s) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('sessions', 'readwrite'); t.objectStore('sessions').put(s); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async all() { const d = await this.open(); return new Promise((res, rej) => { const r = d.transaction('sessions').objectStore('sessions').getAll(); r.onsuccess = () => res(r.result.sort((a, b) => b.startedAt - a.startedAt)); r.onerror = () => rej(r.error); }); },
  async del(id) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('sessions', 'readwrite'); t.objectStore('sessions').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
};

export function summarize(s) {
  const st = s.strokes, last = st[st.length - 1] || {}, powers = st.map((x) => x.power).filter((x) => x > 0);
  const distance = Math.max(last.distance ?? 0, s.end?.distance ?? 0), elapsed = Math.max(last.elapsed ?? 0, s.end?.elapsed ?? 0);
  return {
    distance, elapsed, strokes: st.length,
    avgPace: distance ? elapsed / (distance / 500) : null,
    avgPower: mean(powers), maxPower: powers.length ? Math.max(...powers) : null,
    avgSpm: mean(st.map((x) => x.spm).filter(Boolean)), avgHr: mean(st.map((x) => x.hr).filter(Boolean)),
    avgPeakForce: mean(st.map((x) => x.peakForce).filter(Boolean)), avgDriveLength: mean(st.map((x) => x.driveLength).filter(Boolean)),
    drag: last.drag, work: st.reduce((a, x) => a + (x.workPerStroke || 0), 0),
    consistency: powers.length > 3 ? stddev(powers) / mean(powers) : null,
  };
}

const r3 = (v) => typeof v === 'number' ? +v.toFixed(3) : v;
export const fileStamp = (s) => new Date(s.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
export function sessionJSON(s) {
  return JSON.stringify({
    app: 'flywheel', schema: 1, id: s.id, startedAt: new Date(s.startedAt).toISOString(),
    device: s.device ?? null, ergType: s.ergType ?? null,
    units: { elapsed: 's', distance: 'm', pace: 's/500m', power: 'W', force: 'N', driveLength: 'm', driveTime: 's', recoveryTime: 's', workPerStroke: 'J', speed: 'm/s' },
    summary: s.summary,
    strokes: s.strokes.map((x) => ({ n: x.strokeCount, t: r3(x.elapsed), d: r3(x.distance), power: x.power, pace: x.pace, spm: x.spm, hr: x.hr,
      driveLength: x.driveLength, driveTime: x.driveTime, recoveryTime: x.recoveryTime, strokeDistance: x.strokeDistance,
      peakForce: r3(x.peakForce), avgForce: r3(x.avgForce), workPerStroke: x.workPerStroke, drag: x.drag, curve: x.curve ? x.curve.map((v) => Math.round(v)) : null })),
    samples: s.samples.map((x) => ({ t: r3(x.t), pace: x.pace, spm: x.spm, hr: x.hr, speed: x.speed })),
    avgCurve: s.avgCurve ? s.avgCurve.map((v) => Math.round(v)) : null,
  }, null, 1);
}

/** Hand a text file to the user. iOS wrappers (Bluefy) ignore <a download>, so the share sheet comes first.
 *  Resolves to 'shared' | 'cancelled' | 'downloaded' | 'unsupported'. */
export async function exportFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'downloaded';
  } catch { return 'unsupported'; }
}
