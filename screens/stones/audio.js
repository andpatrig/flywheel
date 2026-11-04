// screens/stones/audio.js — synthesized sound for the arena. No audio files: every sound is built from
// oscillators and filtered noise so it can follow the physics. The hoist hum tracks the motor and its load, the
// chain rattles at the real link rate, the chain creaks as it takes up tension, the grab hisses and clacks as it
// closes and opens, and the landing thud, platform ring and gravel hiss scale with the actual impact energy.
// Browsers (iOS especially) only start audio after a user gesture: unlock() is called from the first tap.

const LINK_PITCH = 0.0235;   // m per chain link — must match the stage

export function createStonesAudio() {
  let ctx = null, master = null, hum = null, rattle = null, muted = false, running = false;
  const noiseBufs = {};

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    hum = buildHum(); rattle = buildRattle();
    return true;
  }
  function noise(sec = 2) {
    const key = sec; if (noiseBufs[key]) return noiseBufs[key];
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBufs[key] = b);
  }
  const src = (buf, loop = false) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; };
  const filt = (type, f, q = 1) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const chainTo = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };

  // ---- continuous: hoist motor hum (two detuned saws through a low-pass, pitched by load) and chain rattle
  function buildHum() {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square'; o1.frequency.value = 52; o2.frequency.value = 52.7; o3.frequency.value = 104;
    const lp = filt('lowpass', 240, 1.1), g = gain(0), g3 = gain(0.25);
    o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp); chainTo(lp, g, master);
    o1.start(); o2.start(); o3.start();
    return { oscs: [o1, o2, o3], g, lp };
  }
  function buildRattle() {
    const n = src(noise(2), true), bp = filt('bandpass', 2200, 1.6), vca = gain(0), level = gain(0);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 8;
    const lfoG = gain(0.5), dc = ctx.createConstantSource(); dc.offset.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(vca.gain); dc.connect(vca.gain);                 // vca.gain = 0.5 + 0.5·square
    chainTo(n, bp, vca, level, master); n.start(); lfo.start(); dc.start();
    return { level, lfo };
  }
  /** Called every frame with the game state. */
  function update(S) {
    if (!ctx || !running) return;
    const t = ctx.currentTime, load = S.attached ? 1 : 0;
    const humG = S.winding * (0.07 + 0.05 * load);
    hum.g.gain.setTargetAtTime(humG, t, 0.06);
    const f = 52 * (1 + 0.12 * S.winding - 0.06 * load);
    hum.oscs[0].frequency.setTargetAtTime(f, t, 0.1); hum.oscs[1].frequency.setTargetAtTime(f * 1.013, t, 0.1); hum.oscs[2].frequency.setTargetAtTime(f * 2, t, 0.1);
    const v = Math.abs(S.winchV || 0), moving = v > 0.02 ? v : (S.winding > 0.5 ? 0.35 : 0);
    rattle.level.gain.setTargetAtTime(Math.min(1, moving / 0.9) * 0.045 + (S.thrum > 0.002 ? 0.012 : 0), t, 0.05);
    rattle.lfo.frequency.setTargetAtTime(Math.max(6, Math.min(60, moving / LINK_PITCH)), t, 0.1);
  }

  // ---- one-shots
  function env(g, t0, peak, attack, decay) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay); }
  function burst(buf, filter, peak, attack, decay, t0 = ctx.currentTime) {
    const n = src(buf), g = gain(0); chainTo(n, filter, g, master); env(g, t0, peak, attack, decay); n.start(t0); n.stop(t0 + attack + decay + 0.05); return filter;
  }
  function tone(freq, type, peak, attack, decay, { to = null, t0 = ctx.currentTime } = {}) {
    const o = ctx.createOscillator(), g = gain(0); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay * 0.6);
    chainTo(o, g, master); env(g, t0, peak, attack, decay); o.start(t0); o.stop(t0 + attack + decay + 0.05);
  }
  /** Steel-on-steel clack: short bright noise plus a ringing partial. */
  function clack(level = 1) {
    if (!ready()) return;
    burst(noise(0.3), filt('highpass', 1400, 0.7), 0.32 * level, 0.002, 0.07);
    tone(2300, 'sine', 0.06 * level, 0.002, 0.12); tone(3900, 'sine', 0.025 * level, 0.002, 0.08);
  }
  /** Hydraulic hiss while the grab moves. */
  function hiss(dur = 0.6, level = 1) { if (!ready()) return; burst(noise(2), filt('bandpass', 1100, 0.6), 0.055 * level, 0.08, dur); }
  /** The chain taking up tension: a resonant noise sweep falling in pitch as the load comes on. */
  function creak(level = 1) {
    if (!ready()) return;
    const f = filt('bandpass', 520, 14), t0 = ctx.currentTime; f.frequency.exponentialRampToValueAtTime(240, t0 + 0.55);
    burst(noise(2), f, 0.22 * level, 0.05, 0.5, t0);
    tone(180, 'triangle', 0.05 * level, 0.03, 0.4, { to: 120, t0 });
  }
  /** Landing: low thud, platform ring, gravel/dust hiss — all scaled by strength (√ of impact energy). */
  function thud(strength = 1) {
    if (!ready()) return;
    const k = Math.min(1.6, Math.max(0.3, strength / 1.4)), t0 = ctx.currentTime;
    tone(90, 'sine', 0.9 * k, 0.004, 0.32, { to: 28, t0 });                                        // body of the thud
    burst(noise(0.5), filt('lowpass', 380, 0.8), 0.55 * k, 0.003, 0.22, t0);                       // slap
    for (const [f, d, a] of [[164, 0.7, 0.07], [247, 0.5, 0.05], [412, 0.3, 0.03]]) tone(f, 'sine', a * k, 0.003, d, { t0: t0 + 0.01 });   // the platform rings
    burst(noise(2), filt('bandpass', 2800, 0.5), 0.07 * k, 0.03, 0.75, t0 + 0.04);                 // gravel and dust
  }

  function ready() { return ctx && running && !muted; }
  /** Unlock/resume from a user gesture (required on iOS). */
  function unlock() { if (!ensure()) return; if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
  function start() { running = true; unlock(); }
  function stop() { running = false; if (ctx) { const t = ctx.currentTime; hum?.g.gain.setTargetAtTime(0, t, 0.05); rattle?.level.gain.setTargetAtTime(0, t, 0.05); } }
  function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.03); }

  /** Route game events. */
  function onEvent(name, S) {
    if (!ready()) return;
    if (name === 'grip') { hiss(0.7); }
    else if (name === 'gripped') { clack(0.8); }
    else if (name === 'liftoff') { creak(1); }
    else if (name === 'open') { hiss(0.35, 0.8); clack(0.5); }
    else if (name === 'impact') { thud(Math.min(1.8, Math.sqrt(S.E / 60))); }
    else if (name === 'traverse') { hiss(0.25, 0.4); }
  }
  return { update, onEvent, unlock, start, stop, setMuted, get muted() { return muted; } };
}
