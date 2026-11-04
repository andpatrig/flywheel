// screens/tug/audio.js — rope creak and strain for the tug-of-war, built on the shared synth primitives.
import * as sfx from '../../core/sfx.js';

export function createTugAudio() {
  let running = false, strain = null;
  function ensure() {
    if (strain || !sfx.ensure()) return;
    const ctx = sfx.context();
    // continuous rope strain: narrow-band noise that rises with tension
    const n = sfx.src(sfx.noise(2), true), bp = sfx.filt('bandpass', 320, 6), g = sfx.gain(0);
    sfx.chain(n, bp, g, sfx.out()); n.start();
    strain = { g, bp, ctx };
  }
  function update(S) {
    if (!strain || !running) return;
    const t = strain.ctx.currentTime;
    strain.g.gain.setTargetAtTime(S.started && !S.finished ? 0.012 + 0.05 * Math.max(0, S.tension - 0.35) : 0, t, 0.08);
    strain.bp.frequency.setTargetAtTime(260 + 220 * S.tension, t, 0.08);
  }
  /** A stroke's yank: rope creak (pitch falls as it bites) and a thump from the sled runners. Yours sits nearer. */
  function yank(dv, mine) {
    if (!sfx.ready()) return;
    const k = Math.min(1.6, dv), near = mine ? 1 : 0.6, ctx = sfx.context(), t0 = ctx.currentTime;
    const f = sfx.filt('bandpass', 700, 10); f.frequency.exponentialRampToValueAtTime(300, t0 + 0.25);
    sfx.burst(sfx.noise(2), f, 0.16 * k * near, 0.015, 0.22, t0);
    sfx.tone(70, 'sine', 0.22 * k * near, 0.004, 0.14, { to: 45, t0 });
    sfx.burst(sfx.noise(0.5), sfx.filt('lowpass', 500, 0.8), 0.12 * k * near, 0.003, 0.09, t0);
  }
  function finish(win) {
    if (!sfx.ready()) return;
    const ctx = sfx.context(), t0 = ctx.currentTime;
    if (win) for (const [f, d] of [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.3]]) sfx.tone(f, 'triangle', 0.12, 0.01, 0.5, { t0: t0 + d });
    else sfx.tone(220, 'triangle', 0.14, 0.02, 0.9, { to: 150, t0 });
    sfx.burst(sfx.noise(2), sfx.filt('bandpass', 1800, 0.7), 0.05, 0.05, 0.8, t0);
  }
  function unlock() { ensure(); sfx.unlock(); }
  function start() { running = true; unlock(); }
  function stop() { running = false; if (strain) strain.g.gain.setTargetAtTime(0, strain.ctx.currentTime, 0.05); }
  return { update, yank, finish, unlock, start, stop, setMuted: sfx.setMuted };
}
