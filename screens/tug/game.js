// screens/tug/game.js — tug-of-war against an opponent track.
//
// The standing is honest racing arithmetic: lead = your distance − the opponent's distance at the same elapsed
// time. The rope's marker sits at that lead (compressed, so a few metres fill the floor). On top of that each
// stroke yanks the rope: yours toward you, sized by that stroke's work; the opponent's back, on its own
// rhythm. The yank is the instant reward, the lead is the score. Whoever is ahead when the piece ends wins.
const LEAD_SCALE = 6;        // m of lead that moves the marker ~76 % of its full travel
const X_MAX = 1.15;          // m: marker travel each way
const OMEGA = 2 * Math.PI * 1.5, ZETA = 0.5;
const W_REF = 350;           // J: a typical stroke; the yank scales with work / W_REF

export function createTugGame({ opponent, target, onEvent = () => {} }) {
  const S = {
    started: false, finished: false, result: null, elapsed: 0, myDist: 0, oppDist: 0, lead: 0, leadX: 0,
    x: 0, v: 0, tension: 0.4, wobble: 0, pull: 0, oppPull: 0, oppIdx: 0, strokes: 0, oppWorkPrev: 0, time: 0,
    myPace: null, oppPace: null, target, name: opponent.name, label: opponent.label,
  };
  const lastSpeed = { t: 0, d: 0 };

  /** Live status from the monitor: elapsed s, distance m, pace s/500m. */
  function status({ elapsed, distance, pace }) {
    if (elapsed == null || distance == null) return;
    if (elapsed > 0 && distance > 0) S.started = true;
    S.elapsed = elapsed; S.myDist = distance; S.myPace = pace || S.myPace;
    lastSpeed.t = performance.now() / 1000; lastSpeed.d = distance;
  }
  /** A stroke of yours: impulse on the rope toward you. */
  function onStroke(work, peakAt = null) {
    if (S.finished || !(work > 0)) return;
    S.strokes++;
    // an early-peaking force curve snaps, a late one drags: 0.85–1.15 by where the peak sits in the drive
    const shape = peakAt == null ? 1 : 1.15 - 0.3 * Math.min(1, Math.max(0, peakAt));
    const dv = 1.0 * Math.min(2.2, Math.max(0.3, work / W_REF)) * shape;
    S.v += dv; S.pull = 1; S.wobble = Math.min(0.03, 0.012 * dv);
    onEvent('yank', { dv, mine: true });
  }

  function update(dt) {
    dt = Math.min(dt, 1 / 20);
    S.time += dt;
    if (S.started && !S.finished) {
      // opponent at the same elapsed time
      S.oppDist = opponent.distAt(S.elapsed);
      // opponent strokes that have happened since last frame yank the rope back
      while (S.oppIdx < opponent.strokeTimes.length && opponent.strokeTimes[S.oppIdx] <= S.elapsed) {
        const t = opponent.strokeTimes[S.oppIdx++], w = opponent.workAt(t) - S.oppWorkPrev; S.oppWorkPrev = opponent.workAt(t);
        const dv = 1.0 * Math.min(2.2, Math.max(0.3, (w || W_REF) / W_REF));
        S.v -= dv; S.oppPull = 1; S.wobble = Math.max(S.wobble, Math.min(0.03, 0.012 * dv));
        onEvent('yank', { dv, mine: false });
      }
      const oppPrev = opponent.distAt(Math.max(0, S.elapsed - 10)); S.oppPace = S.elapsed > 10 ? 500 / ((S.oppDist - oppPrev) / 10) : opponent.avgPace;
      S.lead = S.myDist - S.oppDist;
      // the piece ends when you complete it (a fixed piece is what makes two rows comparable)
      const done = (target.distance && S.myDist >= target.distance - 0.5) || (target.time && S.elapsed >= target.time - 0.05);
      if (done) {
        S.finished = true;
        S.result = { win: S.lead > 0, draw: Math.abs(S.lead) < 0.5, margin: S.lead, elapsed: S.elapsed, distance: S.myDist, oppDistance: S.oppDist };
        if (target.distance) {           // a distance piece is decided on time: when did each side reach the distance?
          let lo = 0, hi = opponent.end; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (opponent.distAt(m) >= target.distance - 0.5) hi = m; else lo = m; }
          const oppT = opponent.distAt(hi) >= target.distance - 0.5 ? hi : null;
          S.result.oppElapsed = oppT;
          if (oppT != null) {
            const dt = oppT - S.elapsed;                                       // + : you finished first
            S.result.win = dt > 0.05; S.result.draw = Math.abs(dt) <= 0.05;
            S.result.margin = Math.abs(S.lead) > 0.5 ? S.lead : dt * (S.myDist / Math.max(1, S.elapsed));   // metres at your speed
          }
        }
        onEvent('finish', S.result);
      }
    }
    // rope: marker rests at the compressed lead, yanked by strokes, settling as a damped spring
    S.leadX = Math.tanh(S.lead / LEAD_SCALE) * X_MAX;
    const sub = 4, h = dt / sub;
    for (let n = 0; n < sub; n++) { const a = -OMEGA * OMEGA * (S.x - S.leadX) - 2 * ZETA * OMEGA * S.v; S.v += a * h; S.x += S.v * h; }
    S.x = Math.max(-X_MAX - 0.2, Math.min(X_MAX + 0.2, S.x));
    S.pull = Math.max(0, S.pull - dt * 2.2); S.oppPull = Math.max(0, S.oppPull - dt * 2.2); S.wobble = Math.max(0, S.wobble - dt * 0.06);
    S.tension = 0.35 + 0.65 * Math.max(S.pull, S.oppPull) + 0.1 * Math.min(1, Math.abs(S.v));
    return S;
  }
  return { status, onStroke, update, S };
}
