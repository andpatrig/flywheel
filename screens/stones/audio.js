// screens/stones/audio.js — sound for the stone lift, synthesized so it follows the physics: the hoist hum drops
// in pitch under load, the chain rattles at the real link rate as it winds, the slings creak as they take the
// tonne, and the landing thud and platform ring scale with the actual impact energy.
import * as sfx from '../../core/sfx.js';

const LINK_PITCH = 0.0235;   // m per chain link — must match the stage

export function createStonesAudio() {
  let hum = null, rattle = null, running = false;
  function build() {
    if (hum || !sfx.ensure()) return;
    const ctx = sfx.context();
    // hoist motor: two detuned saws and a square an octave up, through a low-pass
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square'; o1.frequency.value = 52; o2.frequency.value = 52.7; o3.frequency.value = 104;
    const lp = sfx.filt('lowpass', 240, 1.1), g = sfx.gain(0), g3 = sfx.gain(0.25);
    o1.connect(lp); o2.connect(lp); o3.connect(g3); g3.connect(lp); sfx.chain(lp, g, sfx.out()); o1.start(); o2.start(); o3.start();
    hum = { oscs: [o1, o2, o3], g };
    // chain rattle: band-passed noise gated by a square LFO at the link rate
    const n = sfx.src(sfx.noise(2), true), bp = sfx.filt('bandpass', 2200, 1.6), vca = sfx.gain(0), level = sfx.gain(0);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 8;
    const lfoG = sfx.gain(0.5), dc = ctx.createConstantSource(); dc.offset.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(vca.gain); dc.connect(vca.gain);
    sfx.chain(n, bp, vca, level, sfx.out()); n.start(); lfo.start(); dc.start();
    rattle = { level, lfo };
  }
  /** Every frame, with the game state. */
  function update(S) {
    if (!hum || !running) return;
    const t = sfx.context().currentTime, load = S.attached ? 1 : 0;
    hum.g.gain.setTargetAtTime(S.winding * (0.07 + 0.05 * load), t, 0.06);
    const f = 52 * (1 + 0.12 * S.winding - 0.08 * load);
    hum.oscs[0].frequency.setTargetAtTime(f, t, 0.1); hum.oscs[1].frequency.setTargetAtTime(f * 1.013, t, 0.1); hum.oscs[2].frequency.setTargetAtTime(f * 2, t, 0.1);
    const v = Math.abs(S.winchV || 0), moving = v > 0.02 ? v : (S.winding > 0.5 ? 0.35 : 0);
    rattle.level.gain.setTargetAtTime(Math.min(1, moving / 0.9) * 0.045 + (S.thrum > 0.002 ? 0.012 : 0), t, 0.05);
    rattle.lfo.frequency.setTargetAtTime(Math.max(6, Math.min(60, moving / LINK_PITCH)), t, 0.1);
  }
  function clank(level = 1) {
    if (!sfx.ready()) return;
    sfx.burst(sfx.noise(0.3), sfx.filt('bandpass', 1500, 2), 0.2 * level, 0.002, 0.09);
    sfx.tone(1250, 'sine', 0.05 * level, 0.002, 0.18); sfx.tone(2100, 'sine', 0.02 * level, 0.002, 0.1);
  }
  function creak(level = 1) {
    if (!sfx.ready()) return;
    const t0 = sfx.context().currentTime, f = sfx.filt('bandpass', 520, 14); f.frequency.exponentialRampToValueAtTime(220, t0 + 0.7);
    sfx.burst(sfx.noise(2), f, 0.26 * level, 0.05, 0.65, t0);
    sfx.tone(170, 'triangle', 0.06 * level, 0.03, 0.5, { to: 105, t0 });
  }
  function thud(strength = 1) {
    if (!sfx.ready()) return;
    const k = Math.min(1.6, Math.max(0.3, strength / 1.4)), t0 = sfx.context().currentTime;
    sfx.tone(80, 'sine', 0.95 * k, 0.004, 0.38, { to: 26, t0 });
    sfx.burst(sfx.noise(0.5), sfx.filt('lowpass', 340, 0.8), 0.6 * k, 0.003, 0.26, t0);
    for (const [f, d, a] of [[146, 0.8, 0.07], [219, 0.6, 0.05], [367, 0.35, 0.03]]) sfx.tone(f, 'sine', a * k, 0.003, d, { t0: t0 + 0.01 });
    sfx.burst(sfx.noise(2), sfx.filt('bandpass', 2800, 0.5), 0.07 * k, 0.03, 0.8, t0 + 0.04);
  }
  function onEvent(name, S) {
    if (name === 'hooked') clank(0.7);
    else if (name === 'liftoff') creak(1);
    else if (name === 'release') clank(0.5);
    else if (name === 'impact') thud(Math.min(1.8, Math.sqrt(S.E / 60)));
  }
  function start() { running = true; sfx.armUnlock(); build(); }
  function stop() { running = false; if (hum) { const t = sfx.context().currentTime; hum.g.gain.setTargetAtTime(0, t, 0.05); rattle.level.gain.setTargetAtTime(0, t, 0.05); } }
  return { update, onEvent, start, stop, unlock: () => { sfx.unlock(); build(); }, setMuted: sfx.setMuted };
}
