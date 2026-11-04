/* pm5.js — Concept2 PM5 Bluetooth LE client + demo simulator
 *
 * Protocol reference: Concept2 "PM5 Bluetooth Smart Communications Interface
 * Definition" (public, concept2.com/service/software/software-development-kit).
 * All UUIDs share the base CE06xxxx-43E5-11E4-916C-0800200C9A66.
 *
 * Works in any browser with navigator.bluetooth (Chrome/Edge on Android, desktop,
 * Bluefy or a WebBLE extension on iOS). Everything is little-endian.
 */

const C2 = (n) => `ce06${n.toString(16).padStart(4, '0')}-43e5-11e4-916c-0800200c9a66`;

export const UUID = {
  DISCOVERY: C2(0x0000),      // advertised service — use as requestDevice filter
  INFO: C2(0x0010),
  CONTROL: C2(0x0020),
  ROWING: C2(0x0030),
  // Rowing service characteristics
  GENERAL_STATUS: C2(0x0031),
  ADDITIONAL_STATUS_1: C2(0x0032),
  ADDITIONAL_STATUS_2: C2(0x0033),
  SAMPLE_RATE: C2(0x0034),
  STROKE_DATA: C2(0x0035),
  ADDITIONAL_STROKE_DATA: C2(0x0036),
  SPLIT_DATA: C2(0x0037),
  ADDITIONAL_SPLIT_DATA: C2(0x0038),
  END_OF_WORKOUT: C2(0x0039),
  ADDITIONAL_END_OF_WORKOUT: C2(0x003a),
  HEART_RATE_BELT: C2(0x003b),
  FORCE_CURVE: C2(0x003d),
  MULTIPLEXED: C2(0x0080),
  // Info service
  SERIAL: C2(0x0012),
  HW_REV: C2(0x0013),
  FW_REV: C2(0x0014),
  MODEL: C2(0x0016),
};

export const WORKOUT_STATE = ['Wait to begin', 'Rowing', 'Countdown pause', 'Interval rest',
  'Interval work time', 'Interval work distance', 'Interval rest end to work time',
  'Interval rest end to work distance', 'Interval work time to rest', 'Interval work distance to rest',
  'Workout end', 'Terminate', 'Workout logged', 'Rearm'];
export const STROKE_STATE = ['Waiting for min speed', 'Waiting to accelerate', 'Drive', 'Dwell', 'Recovery'];
export const ERG_TYPE = { 0: 'Static Model D', 1: 'Static Model C', 2: 'Static Model A', 3: 'Static Model B', 5: 'Static Model E', 7: 'Slides', 8: 'Dynamic', 16: 'Static Dyno', 32: 'SkiErg', 64: 'BikeErg', 192: 'Multi-erg' };

// ---------- byte helpers ----------
const u8 = (v, i) => v.getUint8(i);
const u16 = (v, i) => v.getUint16(i, true);
const u24 = (v, i) => v.getUint8(i) | (v.getUint8(i + 1) << 8) | (v.getUint8(i + 2) << 16);
const u32 = (v, i) => v.getUint32(i, true);
const LBF_TO_N = 4.4482216;

// ---------- parsers (one per characteristic) ----------
export const parse = {
  generalStatus(v) {           // 0x0031, 19 bytes
    return {
      type: 'status',
      elapsed: u24(v, 0) / 100,          // s
      distance: u24(v, 3) / 10,          // m
      workoutType: u8(v, 6),
      intervalType: u8(v, 7),
      workoutState: u8(v, 8),
      rowingState: u8(v, 9),
      strokeState: u8(v, 10),
      totalWorkDistance: u24(v, 11),     // m
      workoutDuration: u24(v, 14),       // units depend on durationType
      workoutDurationType: u8(v, 17),
      dragFactor: u8(v, 18),
    };
  },
  additionalStatus1(v) {       // 0x0032, 17 bytes
    const pace = u16(v, 7) / 100, avgPace = u16(v, 9) / 100;
    return {
      type: 'status1',
      elapsed: u24(v, 0) / 100,
      speed: u16(v, 3) / 1000,           // m/s
      strokeRate: u8(v, 5),              // spm
      heartRate: u8(v, 6) === 255 ? null : u8(v, 6),
      pace: pace > 0 && pace < 1000 ? pace : null,        // s per 500m
      avgPace: avgPace > 0 && avgPace < 1000 ? avgPace : null,
      restDistance: u16(v, 11),
      restTime: u24(v, 13) / 100,
      ergType: v.byteLength > 16 ? u8(v, 16) : null,
    };
  },
  additionalStatus2(v) {       // 0x0033, 20 bytes
    return {
      type: 'status2',
      elapsed: u24(v, 0) / 100,
      intervalCount: u8(v, 3),
      avgPower: u16(v, 4),               // W
      totalCalories: u16(v, 6),
      splitAvgPace: u16(v, 8) / 100,
      splitAvgPower: u16(v, 10),
      splitAvgCalories: u16(v, 12),
      lastHeartRate: u8(v, 14),
      lastSplitTime: v.byteLength >= 18 ? u24(v, 15) / 10 : null,
      lastSplitDistance: v.byteLength >= 21 ? u24(v, 18) : null,
    };
  },
  strokeData(v) {              // 0x0035, 20 bytes
    return {
      type: 'stroke',
      elapsed: u24(v, 0) / 100,
      distance: u24(v, 3) / 10,
      driveLength: u8(v, 6) / 100,       // m
      driveTime: u8(v, 7) / 100,         // s
      recoveryTime: u16(v, 8) / 100,     // s
      strokeDistance: u16(v, 10) / 100,  // m
      peakForce: u16(v, 12) / 10 * LBF_TO_N, // N  (PM5 reports 0.1 lbf)
      avgForce: u16(v, 14) / 10 * LBF_TO_N,  // N
      workPerStroke: u16(v, 16) / 10,    // J
      strokeCount: u16(v, 18),
    };
  },
  additionalStrokeData(v) {    // 0x0036, 15 bytes
    return {
      type: 'stroke2',
      elapsed: u24(v, 0) / 100,
      power: u16(v, 3),                  // W
      calsPerHour: u16(v, 5),
      strokeCount: u16(v, 7),
      projectedWorkTime: u24(v, 9),      // s
      projectedWorkDistance: u24(v, 12), // m
    };
  },
  endOfWorkout(v) {            // 0x0039, 18 bytes
    return {
      type: 'end',
      elapsed: u24(v, 7) / 100,
      distance: u24(v, 10) / 10,
      avgStrokeRate: u8(v, 13),
      endHeartRate: u8(v, 14),
      avgHeartRate: u8(v, 15),
      minHeartRate: u8(v, 16),
      maxHeartRate: u8(v, 17),
    };
  },
  forceCurve(v) {              // 0x003D — multi-packet; byte0: hi nibble = total packets, lo nibble = points here; byte1 = seq
    const n = u8(v, 0) & 0x0f, total = u8(v, 0) >> 4, seq = u8(v, 1);
    const pts = [];
    for (let i = 0; i < n && 2 + i * 2 + 1 < v.byteLength; i++) pts.push(u16(v, 2 + i * 2) * LBF_TO_N);
    return { type: 'forcePacket', total, seq, pts };
  },
};

// ---------- the client ----------
export class PM5 {
  constructor() {
    this.listeners = new Set();
    this.device = null;
    this.server = null;
    this._curve = { seq: -1, pts: [] };
    this.connected = false;
    this.info = {};
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(msg) { for (const fn of this.listeners) fn(msg); }

  static get supported() { return typeof navigator !== 'undefined' && !!navigator.bluetooth; }

  async connect() {
    if (!PM5.supported) throw new Error('Web Bluetooth is not available in this browser.');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [UUID.DISCOVERY] }],
      optionalServices: [UUID.INFO, UUID.CONTROL, UUID.ROWING],
    });
    this.device.addEventListener('gattserverdisconnected', () => {
      this.connected = false;
      this.emit({ type: 'disconnected' });
    });
    this.server = await this.device.gatt.connect();
    this.connected = true;
    this.emit({ type: 'connecting', name: this.device.name });

    // Device info (best effort)
    try {
      const info = await this.server.getPrimaryService(UUID.INFO);
      const dec = new TextDecoder();
      for (const [k, u] of [['serial', UUID.SERIAL], ['firmware', UUID.FW_REV], ['model', UUID.MODEL]]) {
        try { this.info[k] = dec.decode(await (await info.getCharacteristic(u)).readValue()).replace(/\0+$/, ''); } catch { /* optional */ }
      }
    } catch { /* optional */ }

    const rowing = await this.server.getPrimaryService(UUID.ROWING);

    // Faster status updates: 0 = 1 s, 1 = 500 ms (default), 2 = 250 ms, 3 = 100 ms
    try { await (await rowing.getCharacteristic(UUID.SAMPLE_RATE)).writeValue(Uint8Array.of(2)); } catch { /* keep default */ }

    const subs = [
      [UUID.GENERAL_STATUS, parse.generalStatus],
      [UUID.ADDITIONAL_STATUS_1, parse.additionalStatus1],
      [UUID.ADDITIONAL_STATUS_2, parse.additionalStatus2],
      [UUID.STROKE_DATA, parse.strokeData],
      [UUID.ADDITIONAL_STROKE_DATA, parse.additionalStrokeData],
      [UUID.END_OF_WORKOUT, parse.endOfWorkout],
      [UUID.FORCE_CURVE, parse.forceCurve],
    ];
    for (const [uuid, fn] of subs) {
      try {
        const ch = await rowing.getCharacteristic(uuid);
        ch.addEventListener('characteristicvaluechanged', (e) => this._handle(fn(e.target.value)));
        await ch.startNotifications();
      } catch (err) {
        // Force curve is absent on older firmware; everything else should exist.
        this.emit({ type: 'warn', message: `Could not subscribe to ${uuid.slice(4, 8)}: ${err.message}` });
      }
    }
    this.emit({ type: 'connected', name: this.device.name, info: this.info });
  }

  _handle(msg) {
    if (msg.type === 'forcePacket') {
      if (msg.seq === 0) this._curve = { seq: 0, pts: [] };
      this._curve.pts.push(...msg.pts);
      if (msg.seq === msg.total - 1) this.emit({ type: 'force', pts: this._curve.pts.slice() });
      return;
    }
    this.emit(msg);
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.connected = false;
  }
}

// ---------- demo simulator ----------
// Emits the same byte layouts a PM5 would, through the same parsers, so the UI
// and the protocol layer are both exercised without an erg in the room.
export class PM5Simulator extends PM5 {
  constructor(opts = {}) {
    super();
    this.rate = opts.rate ?? 24;         // spm
    this.distance = opts.distance ?? 0;  // m: a fixed-distance piece (0 = just row)
    this.time = opts.time ?? 0;          // s: a fixed-time piece
    this._ended = false;
    this.paceTarget = opts.pace ?? 125;  // s/500m
    this.drag = opts.drag ?? 118;
    this._t = 0; this._dist = 0; this._strokes = 0; this._cal = 0;
    this._timers = [];
    this.info = { serial: 'SIM-000001', firmware: 'demo', model: 'PM5 (simulated)' };
  }
  static get supported() { return true; }

  async connect() {
    this.connected = true;
    this.emit({ type: 'connected', name: 'PM5 Simulator', info: this.info });
    this._t = 0; this._dist = 0; this._strokes = 0; this._cal = 0; this._hr = 120;
    const t0 = performance.now();
    this._timers.push(setInterval(() => this._tick((performance.now() - t0) / 1000), 250));
    this._scheduleStroke();
  }
  disconnect() {
    this._timers.forEach(clearTimeout); this._timers.forEach(clearInterval); this._timers = [];
    this.connected = false; this.emit({ type: 'disconnected' });
  }

  _pace() {    // wander ±4 s around target, plus a slow fatigue drift
    return this.paceTarget + 3 * Math.sin(this._t / 23) + 2 * Math.sin(this._t / 7.3) + this._t * 0.004;
  }
  _tick(t) {
    const dt = t - this._t; this._t = t;
    const pace = this._pace();
    const speed = 500 / pace;
    if (!this._ended) this._dist += speed * dt;
    const watts = 2.8 / Math.pow(pace / 500, 3);
    this._cal += (watts * 4 + 350) / 3600 * dt;   // C2 calorie formula approx
    this._hr += (0.02 * (145 + (watts - 170) * 0.3 - this._hr)) + (Math.random() - 0.5);
    const phase = (t * this.rate / 60) % 1;
    const strokeState = phase < 0.33 ? 2 : phase < 0.4 ? 3 : 4;

    // 0x0031
    const b1 = new DataView(new ArrayBuffer(19));
    put24(b1, 0, t * 100); put24(b1, 3, this._dist * 10);
    const done = (this.distance && this._dist >= this.distance) || (this.time && t >= this.time);
    if (done && this.distance) this._dist = this.distance;
    this._ended = !!done;
    const wType = this.distance ? 3 : this.time ? 5 : 1, wDur = this.distance ? this.distance : this.time ? this.time * 100 : 0, wDurT = this.distance ? 0x80 : 0;
    b1.setUint8(6, wType); b1.setUint8(7, 255); b1.setUint8(8, done ? 10 : 1); b1.setUint8(9, done ? 0 : 1); b1.setUint8(10, strokeState);
    put24(b1, 11, this._dist); put24(b1, 14, wDur); b1.setUint8(17, wDurT); b1.setUint8(18, this.drag);
    this._handle(parse.generalStatus(b1));

    // 0x0032
    const b2 = new DataView(new ArrayBuffer(17));
    put24(b2, 0, t * 100); b2.setUint16(3, speed * 1000, true); b2.setUint8(5, Math.round(this.rate + Math.sin(t / 11)));
    b2.setUint8(6, Math.round(this._hr)); b2.setUint16(7, pace * 100, true);
    b2.setUint16(9, (t > 0 ? (t / (this._dist / 500)) : pace) * 100, true); b2.setUint16(11, 0, true); put24(b2, 13, 0); b2.setUint8(16, 0);
    this._handle(parse.additionalStatus1(b2));

    // 0x0033
    const b3 = new DataView(new ArrayBuffer(20));
    put24(b3, 0, t * 100); b3.setUint8(3, 0); b3.setUint16(4, Math.round(2.8 / Math.pow((t / (this._dist / 500) || pace) / 500, 3)), true);
    b3.setUint16(6, Math.round(this._cal), true); b3.setUint16(8, pace * 100, true); b3.setUint16(10, Math.round(watts), true);
    b3.setUint16(12, 0, true); b3.setUint8(14, Math.round(this._hr)); put24(b3, 15, 0);
    this._handle(parse.additionalStatus2(b3));
  }
  _scheduleStroke() {
    const period = 60 / this.rate * 1000;
    this._timers.push(setTimeout(() => {
      if (!this.connected) return;
      if (!this._ended) this._stroke(); this._scheduleStroke();
    }, period * (0.97 + Math.random() * 0.06)));
  }
  _stroke() {
    this._strokes++;
    const pace = this._pace();
    const watts = 2.8 / Math.pow(pace / 500, 3) * (0.9 + Math.random() * 0.2);
    const driveTime = 0.78 + Math.random() * 0.08;
    const period = 60 / this.rate;
    const peakN = 500 + (watts - 170) * 2.5 + (Math.random() - 0.5) * 60;
    const t = this._t;

    const s = new DataView(new ArrayBuffer(20));
    put24(s, 0, t * 100); put24(s, 3, this._dist * 10);
    s.setUint8(6, Math.round((1.35 + Math.random() * 0.1) * 100)); s.setUint8(7, Math.round(driveTime * 100));
    s.setUint16(8, Math.round((period - driveTime) * 100), true); s.setUint16(10, Math.round(500 / pace * period * 100), true);
    s.setUint16(12, Math.round(peakN / LBF_TO_N * 10), true); s.setUint16(14, Math.round(peakN * 0.55 / LBF_TO_N * 10), true);
    s.setUint16(16, Math.round(watts * period * 10), true); s.setUint16(18, this._strokes, true);
    this._handle(parse.strokeData(s));

    const s2 = new DataView(new ArrayBuffer(15));
    put24(s2, 0, t * 100); s2.setUint16(3, Math.round(watts), true); s2.setUint16(5, Math.round(watts * 4 + 350), true);
    s2.setUint16(7, this._strokes, true); put24(s2, 9, 0); put24(s2, 12, 0);
    this._handle(parse.additionalStrokeData(s2));

    // Force curve: ~24 points, skewed bell, delivered in 9-point packets like the PM5
    const n = 24, pts = [];
    for (let i = 0; i < n; i++) { const x = i / (n - 1); pts.push(Math.round(peakN * Math.pow(Math.sin(Math.PI * Math.pow(x, 0.75)), 1.3) / LBF_TO_N)); }
    const total = Math.ceil(n / 9);
    for (let p = 0; p < total; p++) {
      const chunk = pts.slice(p * 9, p * 9 + 9);
      const f = new DataView(new ArrayBuffer(2 + chunk.length * 2));
      f.setUint8(0, (total << 4) | chunk.length); f.setUint8(1, p);
      chunk.forEach((v, i) => f.setUint16(2 + i * 2, v, true));
      this._handle(parse.forceCurve(f));
    }
  }
}
function put24(v, i, n) { n = Math.max(0, Math.round(n)); v.setUint8(i, n & 0xff); v.setUint8(i + 1, (n >> 8) & 0xff); v.setUint8(i + 2, (n >> 16) & 0xff); }
