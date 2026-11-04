// core/session.js — the one place that talks to the erg.
//
// Owns the connection (real PM5 or simulator), records the session, keeps the live "latest" state,
// and re-broadcasts everything as normalized events. Screens never touch Bluetooth: they subscribe.
//
//   const off = engine.on('stroke', (stroke) => …)      // returns an unsubscribe function
//
// Events (detail):
//   conn     { state: 'connecting' | 'connected' | 'idle', name?, info? }
//   status   { latest, msg }        every PM5 status packet (~4 Hz): pace, rate, distance, HR, phase…
//   sample   { sample }             ≤1 Hz time-series point { t, pace, spm, hr, speed } (also recorded)
//   stroke   { stroke }             a new stroke began recording: work, peak/avg force, drive/recovery, …
//   power    { stroke }             that stroke's power (W) arrived
//   force    { stroke, curve }      that stroke's full force curve (N, catch → finish) arrived
//   reset    {}                     a fresh session started (empty)
//   saved    { session }            a session was written to the store
//   end      { session }            the PM5 reported end-of-workout (session auto-saved)
import { PM5, PM5Simulator, ERG_TYPE } from './pm5.js';
import { resample, peakAt, CURVE_N } from './format.js';
import { db, summarize } from './store.js';

export class SessionEngine extends EventTarget {
  constructor() {
    super();
    this.erg = null;
    this.session = null;
    this.latest = {};
    this._curveSum = null;
    this.curveN = 0;
    this._fresh();
  }

  // ---------- public API
  on(type, fn) { const h = (e) => fn(e.detail); this.addEventListener(type, h); return () => this.removeEventListener(type, h); }
  get supported() { return PM5.supported; }
  get connected() { return !!this.erg?.connected; }
  get simulated() { return this.erg instanceof PM5Simulator; }
  get recording() { return (this.session?.strokes.length ?? 0) > 0; }
  /** Session-average force curve on a CURVE_N grid, or null before the first curve. */
  avgCurve() { return this._curveSum ? this._curveSum.map((v) => v / this.curveN) : null; }

  async connect() { if (!PM5.supported) throw new Error('Web Bluetooth is not available in this browser.'); await this._attach(new PM5()); }
  async demo(opts) { if (this.connected) this.erg.disconnect(); await this._attach(new PM5Simulator(opts)); }
  disconnect() { this.erg?.disconnect(); }

  /** Save the current session (if it has real rowing in it) and start a fresh one. */
  async save() {
    const cur = this.session;
    if (!cur || cur.strokes.length < 2) { this.reset(); return null; }
    const s = { id: String(cur.startedAt), ...cur, summary: summarize(cur), avgCurve: this.avgCurve() };
    await db.put(s);
    this.reset();
    this._emit('saved', { session: s });
    return s;
  }
  /** Drop the current session's data and start fresh. */
  reset() { this._fresh(); this._emit('reset', {}); }

  // ---------- internals
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _fresh() {
    this.session = { startedAt: Date.now(), strokes: [], samples: [], ergType: null, device: this.session?.device ?? null };
    this.latest = {}; this._curveSum = null; this.curveN = 0;
  }
  async _attach(device) {
    this.erg = device;
    this._emit('conn', { state: 'connecting' });
    device.on((m) => { if (device === this.erg) this._onMessage(m); });   // ignore late events from a replaced device
    try { await device.connect(); }
    catch (e) { if (device === this.erg) this._emit('conn', { state: 'idle' }); throw e; }
  }
  _onMessage(m) {
    switch (m.type) {
      case 'connected':
        this._fresh(); this.session.device = { name: m.name ?? null, ...(m.info || {}) };
        this._emit('reset', {});
        this._emit('conn', { state: 'connected', name: m.name, info: m.info });
        break;
      case 'disconnected': this._emit('conn', { state: 'idle' }); break;
      case 'warn': console.warn(m.message); break;
      case 'status': case 'status1': case 'status2': this._onStatus(m); break;
      case 'stroke': this._onStroke(m); break;
      case 'stroke2': this._onPower(m); break;
      case 'force': this._onForce(m.pts); break;
      case 'end': this.save().then((s) => this._emit('end', { session: s })); break;
    }
  }
  _onStatus(m) {
    const L = this.latest, S = this.session;
    // The PM5 restarts its clock on a new workout: close the previous session if it had real rowing in it.
    if (m.elapsed != null && L.elapsed != null && m.elapsed < L.elapsed - 5 && S.strokes.length > 3) this.save();
    Object.assign(this.latest, m);
    if (m.type === 'status1') {
      if (m.pace && m.elapsed > 0) {
        const s = this.session.samples, last = s[s.length - 1];
        if (!last || m.elapsed - last.t >= 1) {
          const sample = { t: m.elapsed, pace: m.pace, spm: m.strokeRate, hr: m.heartRate, speed: m.speed };
          s.push(sample); this._emit('sample', { sample });
        }
      }
      if (m.ergType != null) this.session.ergType = ERG_TYPE[m.ergType] || m.ergType;
    }
    this._emit('status', { latest: this.latest, msg: m });
  }
  _onStroke(m) {
    const st = this.session.strokes, prev = st[st.length - 1];
    if (prev && prev.strokeCount === m.strokeCount) { Object.assign(prev, m); return; }
    const L = this.latest;
    const stroke = { ...m, power: null, pace: L.pace ?? null, spm: L.strokeRate ?? null, hr: L.heartRate ?? null, drag: L.dragFactor ?? null };
    st.push(stroke);
    Object.assign(L, { strokeCount: m.strokeCount, driveTime: m.driveTime, recoveryTime: m.recoveryTime, peakForce: m.peakForce, driveLength: m.driveLength, workPerStroke: m.workPerStroke });
    this._emit('stroke', { stroke });
  }
  _onPower(m) {
    const st = this.session.strokes;
    const s = st.find((x) => x.strokeCount === m.strokeCount) || st[st.length - 1];
    if (s) { s.power = m.power; s.calsPerHour = m.calsPerHour; }
    this.latest.power = m.power; this.latest.calsPerHour = m.calsPerHour;
    this._emit('power', { stroke: s });
  }
  _onForce(pts) {
    if (!pts.length) return;
    const st = this.session.strokes, s = st[st.length - 1];
    if (s) s.curve = pts;
    const r = resample(pts, CURVE_N);
    if (!this._curveSum) this._curveSum = r.slice(); else r.forEach((v, i) => this._curveSum[i] += v);
    this.curveN++;
    this.latest.curvePeak = Math.max(...pts);
    this.latest.curvePeakAt = peakAt(pts);
    this._emit('force', { stroke: s, curve: pts });
  }
}

/** The app-wide engine. Every screen imports this same instance. */
export const engine = new SessionEngine();
