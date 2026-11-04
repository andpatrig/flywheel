// screens/stones/game.js — Atlas Stones game logic and weight physics.
//
// Energy is the only input. Every stroke's work (J) goes into a bank; the hoist draws from the bank and
// converts it 1:1 into potential energy, Δh = W / (m·g). Strokes rowed while the crane is moving are banked
// and spent on the next lift — nothing is lost, nothing is invented.
//
// Weight is conveyed by physics rather than keyframes:
//  • the stone hangs on the chain as a stiff spring sized to its mass → take-up, lag, one bounce per pulse
//  • the slings start slack and visibly tighten before the stone leaves the floor
//  • carried across, it swings as a true pendulum (θ'' = −g/L·sinθ − a/L·cosθ), damped; the operator waits
//  • released ~3.5 cm above the platform it lands at free-fall speed: the platform rings, the camera jolts,
//    chalk bursts along the contact ring, the stone slides off-centre into the seat disk, wobbles and is still
import { THREE } from '../../core/gfx.js';
import { G, PLATFORM_H, LANES, SEAT_T, seatY } from './stage.js';

const CLEAR = 0.07;          // m: stone bottom must clear the platform top by this before traversing
const DROP_H = 0.035;        // m: release height above the seated position
const SLACK = 0.12;          // m: sling slack when the hook first engages
const P_MAX = 1600;          // W: hoist motor limit — spreads each stroke's joules over ~0.3 s
const HOOK_PARK = 2.75;      // m: hook height while travelling between lanes
const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };   // smootherstep
const ssd = (t) => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (1 - t) * (1 - t));                           // its derivative

export function createStonesGame(stage, { onEvent = () => {} } = {}) {
  const { START_Z, CHAIN_TOP } = stage.constants;
  const stones = stage.stones;
  stones.forEach((_, i) => stage.placeStone(i, 'floor'));

  const S = {
    i: 0, phase: 'descend', pt: 0, time: 0, started: false, finished: false,
    bank: 0, total: 0, lastGain: 0, liftE: 0,
    bridgeX: LANES[0], hoistZ: START_Z, hookY: HOOK_PARK, hookZ: START_Z,
    winch: 0, attached: false,
    yc: stones[0].r - 0.002, vy: 0, leftFloor: false,
    th: 0, w: 0, L: 2, zPrev: START_Z, vzPrev: 0,
    from: null, to: null,
    settle: null, ring: null, jolt: null, thrum: 0, winding: 0,
  };
  const st = () => stones[S.i];
  const restY = (s) => s.r - 0.002;
  const tautCenterFromWinch = (s, winch) => winch - (stage.hookYFor(s, 0));   // center height when the slings are just taut

  function setPhase(p) { S.phase = p; S.pt = 0; onEvent(p, S); }

  // ---------- input
  function onStroke(work, driveTime = 0.8) {
    if (S.finished || !(work > 0)) return;
    S.started = true;
    S.bank += work; S.total += work;
    S.lastGain = work / (st().mass * G);
  }

  // ---------- per-phase updates
  function stepVertical(dt, s) {
    // stone on a stiff spring (chain + slings) below the winch; ground contact below
    const k = s.mass * Math.pow(2 * Math.PI * 2.2, 2), c = 2 * 0.2 * Math.sqrt(k * s.mass);
    const sub = 6, h = dt / sub;
    let T = 0;
    for (let n = 0; n < sub; n++) {
      const stretch = tautCenterFromWinch(s, S.winch) - S.yc;
      T = stretch > 0 ? Math.max(0, k * stretch + c * (S.winchV - S.vy)) : 0;
      S.vy += (T / s.mass - G) * h; S.yc += S.vy * h;
      if (S.yc <= restY(s)) { S.yc = restY(s); if (S.vy < 0) S.vy = 0; }
    }
    S.thrum = T > 0 ? 0.0005 + 0.002 * Math.min(1, Math.abs(T / (s.mass * G) - 1) * 4) : 0;
    return T;
  }

  function update(dt, viewportH) {
    dt = Math.min(dt, 1 / 20);
    if (S.started && !S.finished) S.time += dt;
    S.pt += dt;
    const s = st();
    S.winchV = 0; S.winding = 0;

    switch (S.phase) {
      case 'descend': {                                      // hook comes down to the stone, slings slack
        const target = stage.hookYFor(s, restY(s)) - SLACK;
        S.hookY = Math.max(target, S.hookY - dt * 0.9 * Math.min(1, S.pt * 2));
        S.winding = 0.6;
        if (S.hookY <= target + 1e-4) { S.winch = target; S.attached = true; S.yc = restY(s); S.vy = 0; S.liftE = 0; S.leftFloor = false; setPhase('lift'); }
        break;
      }
      case 'lift': {
        const need = s.mass * G * (PLATFORM_H + SEAT_T + CLEAR);
        const take = Math.min(S.bank, need - S.liftE, P_MAX * dt);
        if (take > 0) { S.bank -= take; S.liftE += take; }
        const sag = G / Math.pow(2 * Math.PI * 2.2, 2);                          // static stretch of the chain under load
        const target = stage.hookYFor(s, restY(s)) + S.liftE / (s.mass * G) + (S.liftE > 0 ? sag : 0);
        const prev = S.winch;
        S.winch = Math.min(target, S.winch + 0.9 * dt);                      // hoist line speed limit
        S.winchV = (S.winch - prev) / dt; S.winding = S.winchV > 0.01 ? 1 : 0;
        stepVertical(dt, s);
        S.hookY = S.winch;
        if (!S.leftFloor && S.yc > restY(s) + 0.004) { S.leftFloor = true; stage.dustBurst(stage.stones[S.i].mesh.position, 0, s.r, 0.35, 26); onEvent('liftoff', S); }
        if (S.liftE >= need - 1e-6 && S.yc - s.r >= PLATFORM_H + SEAT_T + CLEAR - 0.004 && Math.abs(S.vy) < 0.04) {
          S.L = CHAIN_TOP - S.yc; S.th = 0; S.w = 0; S.zPrev = S.hoistZ; S.vzPrev = 0; setPhase('traverse');
        }
        break;
      }
      case 'traverse': case 'steady': case 'lower': {
        if (S.phase === 'traverse') {
          const T = 1.9, u = S.pt / T;
          S.hoistZ = START_Z + (0 - START_Z) * ss(u);
          if (u >= 1) setPhase('steady');
        }
        // pendulum driven by the hoist's acceleration along z
        const vz = (S.hoistZ - S.zPrev) / dt, az = (vz - S.vzPrev) / dt; S.zPrev = S.hoistZ; S.vzPrev = vz;
        const om = Math.sqrt(G / S.L), zeta = 0.12;
        const sub = 4, h = dt / sub;
        for (let n = 0; n < sub; n++) { const a = -(G / S.L) * Math.sin(S.th) - (az / S.L) * Math.cos(S.th) - 2 * zeta * om * S.w; S.w += a * h; S.th += S.w * h; }
        if (S.phase === 'steady' && Math.abs(S.th) < 0.02 && Math.abs(S.w) < 0.05) setPhase('lower');
        if (S.phase === 'steady' && S.pt > 3.5) setPhase('lower');                                // don't wait forever
        if (S.phase === 'lower') {
          const goal = seatY(s.r) + DROP_H;
          const yNow = CHAIN_TOP - S.L * Math.cos(S.th);
          if (yNow > goal + 1e-4) { S.L = Math.min(CHAIN_TOP - goal, S.L + 0.32 * dt * Math.min(1, S.pt * 3)); S.winding = 0.8; }
          else if (Math.abs(S.th) < 0.03 || S.pt > 4) {                                            // release
            S.attached = false; S.vy = 0; S.ycFall = yNow; S.zFall = S.hoistZ + S.L * Math.sin(S.th);
            S.hookY = CHAIN_TOP - (S.L - stage.hookYFor(s, 0)) * Math.cos(S.th);
            S.vzFall = S.L * S.w * Math.cos(S.th); setPhase('release');
            onEvent('release', S);
          }
        }
        S.yc = CHAIN_TOP - S.L * Math.cos(S.th);
        S.thrum = 0.0007 + Math.abs(S.w) * 0.002;
        break;
      }
      case 'release': {                                      // free fall onto the platform
        S.vy -= G * dt; S.ycFall += S.vy * dt; S.zFall += S.vzFall * dt;
        S.hookY += 0.5 * dt;                                 // hook eases up off the stone
        if (S.ycFall <= seatY(s.r)) {
          const v = -S.vy, E = 0.5 * s.mass * v * v;        // impact energy (J)
          S.ycFall = seatY(s.r);
          impact(S.i, E, S.zFall, S.vzFall);
          setPhase('return'); S.from = { z: S.hoistZ, x: S.bridgeX, y: S.hookY };
        }
        break;
      }
      case 'return': {                                       // hook up, hoist back, bridge to the next lane
        const next = Math.min(S.i + 1, LANES.length - 1);
        S.hookY = S.from.y + (HOOK_PARK - S.from.y) * ss(S.pt / 1.0);
        S.hoistZ = S.from.z + (START_Z - S.from.z) * ss((S.pt - 0.3) / 1.6);
        S.bridgeX = S.from.x + (LANES[next] - S.from.x) * ss((S.pt - 0.6) / 1.8);
        S.winding = S.pt < 1 ? 0.6 : 0;
        if (S.pt >= 2.5) {
          if (S.i >= LANES.length - 1) { S.finished = true; setPhase('done'); onEvent('finish', S); }
          else { S.i++; S.yc = restY(stones[S.i]); setPhase('descend'); }
        }
        break;
      }
    }

    // ---------- landed stone: slides off-centre into the seat, wobbles on the rim, and is still
    if (S.settle) {
      const g = S.settle, sd = stones[g.i];
      g.t += dt;
      const om = 2 * Math.PI * 2.1, e = Math.exp(-g.t / 0.32);
      const off = g.off0 * e * Math.cos(om * g.t);                                       // damped slide toward the seat centre
      const lift = (off * off) / (2 * 0.06);                                             // riding up the rim when off-centre
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(g.dz, 0, -g.dx), (off - g.off0) / sd.r);
      g.bounceV -= G * dt; g.bounce = Math.max(0, g.bounce + g.bounceV * dt); if (g.bounce === 0) g.bounceV = 0;
      const ring = platformRing(g.i);
      stage.poseStone(g.i, sd.lane + g.dx * off + ring.x, seatY(sd.r) + lift + g.bounce + ring.y, g.dz * off, g.q.clone().premultiply(roll), ring);
      if (g.t > 2.5) S.settle = null;
    }
    // platform ring for any recent impact
    for (let i = 0; i < LANES.length; i++) { const o = platformRing(i); stage.platforms[i].position.set(LANES[i] + o.x, o.y, 0); }

    // ---------- pose the active stone + crane
    const a = stones[S.i];
    let hook;
    if (['traverse', 'steady', 'lower'].includes(S.phase)) {
      const Lh = S.L - stage.hookYFor(a, 0);                                // pivot → hook = L − (hook height above stone center)
      hook = new THREE.Vector3(0, CHAIN_TOP - Lh * Math.cos(S.th), S.hoistZ + Lh * Math.sin(S.th));
      stage.poseStone(S.i, a.lane, S.yc, S.hoistZ + S.L * Math.sin(S.th));
    } else if (S.phase === 'release') {
      hook = new THREE.Vector3(0, S.hookY, S.hoistZ);
      stage.poseStone(S.i, a.lane, S.ycFall, S.zFall);
    } else {
      hook = new THREE.Vector3(0, S.hookY, S.hoistZ);
      if (S.phase === 'lift') stage.poseStone(S.i, a.lane, S.yc, START_Z);
    }
    stage.setRig({ bridgeX: S.bridgeX, hoistZ: S.hoistZ, hook, attached: S.attached ? a : null, thrum: S.thrum, winding: S.winding, time: S.time + S.pt });

    // ---------- camera jolt
    if (S.jolt) {
      S.jolt.t += dt; const t = S.jolt.t, e = Math.exp(-t / 0.18), A = S.jolt.A * e;
      stage.shakeCamera(A * Math.sin(t * 61), A * Math.sin(t * 47 + 1) * 1.4, A * 0.5 * Math.sin(t * 53 + 2));
      if (t > 1) { S.jolt = null; stage.shakeCamera(0, 0, 0); }
    }
    stage.dust.update(dt, stage.camera, viewportH);
  }

  const rings = LANES.map(() => ({ t: 99, A: 0 }));
  function platformRing(i) {
    const r = rings[i]; if (r.t > 1) return { x: 0, y: 0 };
    const e = Math.exp(-r.t / 0.09);
    return { x: r.A * 0.45 * e * Math.sin(r.t * 2 * Math.PI * 17 + 1), y: r.A * e * Math.sin(r.t * 2 * Math.PI * 23) };
  }
  // ring timers advance in update via this hook
  const _update = update;
  function updateAll(dt, vh) { rings.forEach((r) => { r.t += Math.min(dt, 1 / 20); }); _update(dt, vh); }

  function impact(i, E, z, vz) {
    const s = stones[i], strength = Math.min(1, Math.sqrt(E / 60));
    rings[i] = { t: 0, A: 0.0032 * strength };
    S.jolt = { t: 0, A: 0.0055 * strength };
    stage.dustBurst(new THREE.Vector3(s.lane, 0, z), PLATFORM_H + 0.03, s.r, strength, 52);
    // lands slightly off-centre (swing residue + a little randomness), then slides into the seat
    const ang = Math.random() * Math.PI * 2, offX = Math.cos(ang) * 0.006, offZ = Math.sin(ang) * 0.006 + Math.max(-0.02, Math.min(0.02, z));
    const off0 = Math.hypot(offX, offZ) || 0.004, dx = offX / off0, dz = offZ / off0;
    S.settle = { i, t: 0, off0, dx, dz, q: s.mesh.quaternion.clone(), bounce: 0, bounceV: 0.08 * Math.sqrt(2 * G * DROP_H) };
    onEvent('impact', { E, i });
  }

  /** HUD snapshot. */
  function state() {
    const s = st(), h = Math.max(0, (S.phase === 'lift' ? S.yc - s.r : ['traverse', 'steady', 'lower', 'release', 'return'].includes(S.phase) ? PLATFORM_H : 0));
    const progress = stones.map((_, k) => (k < S.i || (k === S.i && ['release', 'return', 'done'].includes(S.phase)) ? 1 : k === S.i ? Math.min(1, h / PLATFORM_H) : 0));
    return { index: S.i, mass: s.mass, height: Math.min(h, PLATFORM_H), target: PLATFORM_H, lastGain: S.lastGain, time: S.time, total: S.total, bank: S.bank, phase: S.phase, progress, finished: S.finished };
  }
  return { update: updateAll, onStroke, state, S };
}
