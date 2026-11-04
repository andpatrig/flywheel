// core/sfx.js — one shared Web Audio context and the synthesis primitives the games build their sounds from.
// No audio files: everything is oscillators and filtered noise, so sounds can follow the physics exactly.
// Audio only starts after a user gesture (iOS), so unlock() is wired to the first tap.
let ctx = null, master = null, muted = false;
const noiseBufs = {};

export function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);
  return ctx;
}
export const context = () => ctx;
export const out = () => master;
export function unlock() { if (!ensure()) return; if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.03); }
export const isMuted = () => muted;
export const ready = () => !!ctx && ctx.state === 'running' && !muted;

export function noise(sec = 2) {
  if (noiseBufs[sec]) return noiseBufs[sec];
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBufs[sec] = b);
}
export const src = (buf, loop = false) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; };
export const filt = (type, f, q = 1) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
export const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
export const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
export function env(g, t0, peak, attack, decay) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay); }
/** Filtered noise with an attack/decay envelope. */
export function burst(buf, filter, peak, attack, decay, t0 = ctx.currentTime, dest = master) {
  const n = src(buf), g = gain(0); chain(n, filter, g, dest); env(g, t0, peak, attack, decay); n.start(t0); n.stop(t0 + attack + decay + 0.05); return filter;
}
/** An oscillator with an envelope, optionally sweeping to another frequency. */
export function tone(freq, type, peak, attack, decay, { to = null, t0 = ctx.currentTime, dest = master } = {}) {
  const o = ctx.createOscillator(), g = gain(0); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay * 0.6);
  chain(o, g, dest); env(g, t0, peak, attack, decay); o.start(t0); o.stop(t0 + attack + decay + 0.05);
}
