// screens/tug/rower.js — a rigged rower (Mixamo X Bot, 65 bones) posed by the stroke.
//
// The pose is computed, not keyframed: the seat slides, the feet stay on the stretcher, the hands stay on the
// oar handles, and legs and arms are solved as two-link chains to those targets. The torso lean, the slide and
// the handle path are functions of the stroke phase (0 = catch, DRIVE_END = finish, 1 = back at the catch).
// Coordinates are the boat frame: origin at the mid-slide seat position, +z toward the stern (the rower faces
// it), +y up, +x to the rower's left.
import { THREE } from '../../core/gfx.js';

export const DRIVE_END = 0.38;                      // fraction of the cycle spent on the drive
const SEAT_Y = 0.17;                                // seat surface above the waterline
export const LOCK = { x: 0.80, y: SEAT_Y + 0.26, z: 0.02 };   // oarlock (per side, ±x)
const INBOARD = 0.78, SLIDE = 0.30;
const STRETCH = { z: 0.93, y: SEAT_Y + 0.11 };      // ankle on the foot stretcher
const THIGH = 0.443, SHIN = 0.445, UPPER = 0.278, FORE = 0.283;
const D = THREE.MathUtils.degToRad;
const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

let gltfCache = null;
export async function loadRower(url) {
  if (!gltfCache) gltfCache = await new THREE.GLTFLoader().loadAsync(url);
  return gltfCache;
}
/** A posable rig from the loaded model. */
export function makeRig(gltf, { ghost = false, accent = '#00e5ff' } = {}) {
  const root = THREE.skeletonClone(gltf.scene), B = {};
  root.traverse((o) => { if (o.isBone) B[o.name.replace('mixamorig:', '').replace('mixamorig', '')] = o; });
  const col = new THREE.Color(accent);
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = !ghost; o.receiveShadow = false; o.frustumCulled = false;
    const name = (o.material.name || '').toLowerCase();
    if (ghost) o.material = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.34, emissive: col, emissiveIntensity: 0.45, roughness: 0.5, depthWrite: false });
    else if (name.includes('joint')) o.material = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.2, roughness: 0.45, metalness: 0.2 });
    else o.material = new THREE.MeshStandardMaterial({ color: 0x7c8088, roughness: 0.5, metalness: 0.05 });
  });
  return { root, B, ghost };
}

/** Where the stroke is: u = 0 catch → 1 finish (and back), plus whether we're on the drive. */
export function strokeU(phase) {
  phase = ((phase % 1) + 1) % 1;
  return phase < DRIVE_END ? { u: ss(phase / DRIVE_END), drive: true } : { u: 1 - ss((phase - DRIVE_END) / (1 - DRIVE_END)), drive: false };
}
/** Oar sweep (rad, + toward the bow), blade square (0 feathered → 1 squared) and blade depth for a phase. */
export function oarState(phase) {
  const { u, drive } = strokeU(phase);
  const sweep = D(-56) + (D(34) - D(-56)) * u;
  // blades square just before the catch and feather just after the finish; in the water through the drive
  const p = ((phase % 1) + 1) % 1;
  const square = drive ? 1 : (p < DRIVE_END + 0.08 ? 1 - ss((p - DRIVE_END) / 0.08) : p > 0.92 ? ss((p - 0.92) / 0.08) : 0);
  const depth = drive ? 1 : 0;
  return { sweep, square, depth, u, drive };
}
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
/** Point a bone (whose rest axis is `axis` in its own frame) along world direction `dir`. */
function aim(bone, axis, dir) {
  bone.parent.getWorldQuaternion(_qi); _qi.invert();
  _v.copy(dir).normalize().applyQuaternion(_qi);
  bone.quaternion.setFromUnitVectors(axis, _v);
}
/** Two-link IK: joint positions for a chain root→target with lengths a, b; the elbow/knee bends toward `bend`. */
function twoLink(root, target, a, b, bend) {
  const d = _w.subVectors(target, root), L = Math.min(d.length(), a + b - 1e-3); d.normalize();
  const cosA = (a * a + L * L - b * b) / (2 * a * L), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const side = bend.clone().addScaledVector(d, -bend.dot(d)).normalize();        // bend direction ⟂ chain
  return root.clone().addScaledVector(d, a * cosA).addScaledVector(side, a * sinA);
}
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), XP = new THREE.Vector3(1, 0, 0), XN = new THREE.Vector3(-1, 0, 0), ZP = new THREE.Vector3(0, 0, 1);

/**
 * Pose the rig for a stroke phase. `rig.root` must already sit in the boat group at the mid-slide seat with the
 * rower facing +z of the boat frame; the boat group's world matrix must be current.
 */
export function poseRower(rig, phase, { effort = 1 } = {}) {
  const { B, root } = rig, { u, drive } = strokeU(phase), boat = root.parent;
  // --- slide, lean, head
  const seatZ = SLIDE - 2 * SLIDE * u;                                               // catch: toward the stern
  const lean = D(30) - D(52) * u;                                                    // +forward (toward stern) … −back
  root.position.set(0, SEAT_Y + 0.16 - 1.04, seatZ - 0.021);                       // hips bone sits 1.04 m above the rig origin
  B.Hips.quaternion.setFromAxisAngle(XP, lean);
  const spineBend = D(8) * (1 - u) - D(4) * u * effort;                               // curls over the knees at the catch, opens at the finish
  B.Spine.quaternion.setFromAxisAngle(XP, spineBend); B.Spine1.quaternion.setFromAxisAngle(XP, spineBend * 0.6); B.Spine2.quaternion.setFromAxisAngle(XP, spineBend * 0.3);
  B.Neck.quaternion.setFromAxisAngle(XP, -(lean + spineBend * 1.9) * 0.7); B.Head.quaternion.setFromAxisAngle(XP, -(lean + spineBend * 1.9) * 0.3);   // eyes level, on the opponent
  B.LeftShoulder.quaternion.identity(); B.RightShoulder.quaternion.identity();
  boat.updateMatrixWorld(true);

  // --- legs: feet fixed on the stretcher, knees up
  const bq = boat.getWorldQuaternion(_q.clone());
  const toWorld = (p) => p.clone().applyQuaternion(bq).add(boat.getWorldPosition(new THREE.Vector3()));
  for (const s of ['Left', 'Right']) {
    const sign = s === 'Left' ? 1 : -1;
    const hip = B[`${s}UpLeg`].getWorldPosition(new THREE.Vector3());
    const ankle = toWorld(new THREE.Vector3(sign * 0.11, STRETCH.y, STRETCH.z));
    const knee = twoLink(hip, ankle, THIGH, SHIN, UP.clone().applyQuaternion(bq));
    aim(B[`${s}UpLeg`], DOWN, knee.clone().sub(hip)); boat.updateMatrixWorld(true);
    aim(B[`${s}Leg`], DOWN, ankle.clone().sub(knee)); boat.updateMatrixWorld(true);
    // foot flat on the stretcher plate (toes up ~40°): foot bone rest axis is +z, sole down
    const plate = ZP.clone().applyAxisAngle(XP, -D(40)).applyQuaternion(bq);
    aim(B[`${s}Foot`], ZP, plate);
  }
  boat.updateMatrixWorld(true);

  // --- arms: hands on the oar handles, elbows out and down
  const { sweep } = oarState(phase);
  for (const s of ['Left', 'Right']) {
    const sign = s === 'Left' ? 1 : -1;
    const hand = toWorld(new THREE.Vector3(sign * (LOCK.x - INBOARD * Math.cos(sweep)), LOCK.y - 0.03 + 0.05 * (1 - u), LOCK.z - INBOARD * Math.sin(sweep)));
    const sh = B[`${s}Arm`].getWorldPosition(new THREE.Vector3());
    const out = new THREE.Vector3(sign * 0.6, -1, 0.1).applyQuaternion(bq);
    const elbow = twoLink(sh, hand, UPPER, FORE, out);
    aim(B[`${s}Arm`], sign > 0 ? XP : XN, elbow.clone().sub(sh)); boat.updateMatrixWorld(true);
    aim(B[`${s}ForeArm`], sign > 0 ? XP : XN, hand.clone().sub(elbow)); boat.updateMatrixWorld(true);
    B[`${s}Hand`].quaternion.identity();
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) { const b = B[`${s}Hand${f}${k}`]; if (b) b.quaternion.setFromAxisAngle(ZP, sign * D(-50)); }
    const th = B[`${s}HandThumb1`]; if (th) th.quaternion.setFromAxisAngle(UP, sign * D(-25));
  }
  return { u, drive, seatZ, lean };
}
