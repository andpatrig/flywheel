// core/stroke-clock.js — where the rower is in the stroke cycle, as a phase 0…1 (0 = catch, `driveFrac` =
// finish, back to 1 = the next catch). The PM5 reports the stroke state (drive / recovery) about ten times a
// second; the clock snaps to those transitions and interpolates between them with the measured drive and
// recovery times, so animations move smoothly and never drift from the real stroke.
export function createStrokeClock() {
  const C = { phase: 0.7, driveFrac: 0.33, driveTime: 0.8, recoveryTime: 1.6, state: null, active: false, lastT: 0 };
  /** Advance by dt seconds, given the engine's latest values. */
  function update(L, dt) {
    if (L.driveTime > 0.2 && L.recoveryTime > 0.3) { C.driveTime = L.driveTime; C.recoveryTime = L.recoveryTime; C.driveFrac = Math.min(0.6, Math.max(0.2, L.driveTime / (L.driveTime + L.recoveryTime))); }
    const s = L.strokeState;
    if (s != null && s !== C.state) {
      if (s === 2) C.phase = 0;                                   // drive began: the catch
      else if (s === 4 && C.state === 2 || s === 3) C.phase = C.driveFrac;   // drive ended: the finish
      C.state = s;
    }
    C.active = s === 2 || s === 3 || s === 4;
    if (C.active) {
      const inDrive = C.phase < C.driveFrac;
      C.phase += dt * (inDrive ? C.driveFrac / C.driveTime : (1 - C.driveFrac) / C.recoveryTime);
      if (s === 2 && C.phase > C.driveFrac * 0.98) C.phase = C.driveFrac * 0.98;   // hold at the finish until the monitor says so
      if (s === 4 && C.phase >= 1) C.phase = 0.999;                                 // and at the catch
      C.phase %= 1;
    }
    return C;
  }
  /** 0 at the catch → 1 at the finish, and back through the recovery (smooth). */
  function u(phase = C.phase) {
    const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    return phase < C.driveFrac ? ss(phase / C.driveFrac) : 1 - ss((phase - C.driveFrac) / (1 - C.driveFrac));
  }
  return { update, u, C };
}
