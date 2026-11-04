// screens/tug/stage.js — the tug-of-war arena: a rubber floor with a centre line, a rope between two weighted
// pulling sleds (yours solid, the opponent a ghost in your accent colour) and a marker on the rope that is
// judged against the line. Nothing here knows about rowing: setRope() poses the rig from a shift and a tension.
import { rubberFloorMaps, THREE, canvasTexture, softDot, lightCone, groundAO, contactShadowTexture, createParticles } from '../../core/gfx.js';

export const HITCH_H = 0.78;         // m: rope height at the sleds
export const SLED_X = 3.1;           // m: sled hitch distance from the centre line
const ROPE_R = 0.019;

function tapeTexture(accent) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, h * 0.5);
    g.globalAlpha = 0.18; g.fillStyle = '#000'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  });
}

export function createStage({ renderer, envMap, accent = '#00e5ff', maxShadow = 2048 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060708);
  scene.fog = new THREE.FogExp2(0x060708, 0.05);
  scene.environment = envMap; scene.environmentIntensity = 0.22;

  // ---- floor with the centre line and distance ticks
  const floorMaps = rubberFloorMaps(); for (const t of Object.values(floorMaps)) t.repeat.set(16, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 16), new THREE.MeshStandardMaterial({ ...floorMaps, bumpScale: 0.6, color: 0xffffff, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0x6f6c66, roughness: 0.8 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.6, emissive: new THREE.Color(accent), emissiveIntensity: 0.25 });
  const centre = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 3.2), tapeMat); centre.position.y = 0.002; centre.receiveShadow = true; scene.add(centre);
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.004, 1.4), tapeMat); t.position.set(sx * 1.0, 0.002, 0); scene.add(t); }
  // lane edges
  for (const z of [-1.9, 1.9]) { const t = new THREE.Mesh(new THREE.BoxGeometry(12, 0.004, 0.03), tapeMat); t.position.set(0, 0.002, z); scene.add(t); }

  // ---- sleds
  const steel = new THREE.MeshStandardMaterial({ color: 0x2e3135, metalness: 0.6, roughness: 0.42 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.92 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.4, roughness: 0.55 });
  const ghostMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.28, roughness: 0.5, metalness: 0.1, emissive: new THREE.Color(accent), emissiveIntensity: 0.35, depthWrite: false });
  function buildSled(ghost) {
    const g = new THREE.Group(), m = (mat) => ghost ? ghostMat : mat;
    for (const z of [-0.26, 0.26]) { const run = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.08), m(steel)); run.position.set(0, 0.025, z); g.add(run); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.62), m(steel)); deck.position.y = 0.09; g.add(deck);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 16), m(steel)); post.position.y = 0.5; g.add(post);
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - i * 0.015, 0.22 - i * 0.015, 0.045, 36), m(plate)); p.position.y = 0.135 + i * 0.05; g.add(p); }
    const hitch = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 10, 24), m(steel)); hitch.position.y = HITCH_H; hitch.rotation.y = Math.PI / 2; g.add(hitch);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), m(rubber)); pad.position.y = 0.345; g.add(pad);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !ghost; o.receiveShadow = !ghost; } });
    return g;
  }
  const mine = buildSled(false), ghost = buildSled(true);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.012, 0.08), accentMat); stripe.position.set(0, 0.115, 0.28); mine.add(stripe);
  scene.add(mine, ghost);
  // contact shadows under the sleds
  const cs = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.6, depthWrite: false });
  const shadows = [mine, ghost].map((s) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), cs); q.rotation.x = -Math.PI / 2; q.position.y = 0.003; s.add(q); return q; });
  shadows[1].material = cs.clone(); shadows[1].material.opacity = 0.25;

  // ---- rope: instanced segments along a catenary, with a marker at the midpoint
  const SEG = 140, ropeGeo = new THREE.CylinderGeometry(ROPE_R, ROPE_R, 0.06, 10); ropeGeo.rotateZ(Math.PI / 2);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xb9a37c, roughness: 0.95 });
  const rope = new THREE.InstancedMesh(ropeGeo, ropeMat, SEG); rope.castShadow = true; scene.add(rope);
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(ROPE_R + 0.014, ROPE_R + 0.014, 0.16, 16), new THREE.MeshStandardMaterial({ map: tapeTexture(accent), roughness: 0.6 }));
  marker.rotation.z = Math.PI / 2; marker.castShadow = true; scene.add(marker);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), emissive: new THREE.Color(accent), emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(0.08, -0.08, 0); marker.add(flag); flag.rotation.z = -Math.PI / 2;
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), X = new THREE.Vector3(1, 0, 0), _d = new THREE.Vector3();
  const pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
  /**
   * shift: rope/sled displacement toward you (+x is your side); tension 0..1 sets the sag; wobble adds a
   * transverse ripple (after a yank); time for the ripple.
   */
  function setRope({ shift = 0, tension = 0.5, wobble = 0, time = 0 }) {
    mine.position.x = -SLED_X + shift; ghost.position.x = SLED_X + shift;
    const x0 = mine.position.x, x1 = ghost.position.x, sag = 0.26 * (1 - 0.85 * Math.min(1, tension));
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, x = x0 + (x1 - x0) * u;
      const y = HITCH_H - sag * 4 * u * (1 - u) + wobble * Math.sin(u * Math.PI * 3) * Math.sin(time * 38);
      pts[i].set(x, y, wobble * 0.6 * Math.sin(u * Math.PI * 2) * Math.cos(time * 31));
    }
    for (let i = 0; i < SEG; i++) {
      _p.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5); _d.subVectors(pts[i + 1], pts[i]); _q.setFromUnitVectors(X, _d.normalize());
      _m.compose(_p, _q, _one); rope.setMatrixAt(i, _m);
    }
    rope.instanceMatrix.needsUpdate = true;
    const mid = pts[SEG / 2]; marker.position.copy(mid); _d.subVectors(pts[SEG / 2 + 1], pts[SEG / 2 - 1]).normalize(); marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _d);
  }

  // ---- dust from the runners
  const dust = createParticles({ max: 200, texture: softDot(64), color: 0x8a8378, drag: 2.5, gravity: -0.15 }); scene.add(dust.points);
  function kick(x, n = 12, v = 0.5) {
    dust.emit(n, (p) => { p.pos.set(x + (Math.random() - 0.5) * 0.9, 0.03, (Math.random() - 0.5) * 0.7); p.vel.set((Math.random() - 0.5) * v, Math.random() * 0.35, (Math.random() - 0.5) * v); p.life = 0.7 + Math.random() * 0.6; p.size0 = 0.08; p.size1 = 0.3 + Math.random() * 0.2; p.alpha = 0.16; });
  }

  // ---- lights
  const key = new THREE.SpotLight(0xffeedd, 330, 0, 0.5, 0.55, 2); key.position.set(1.5, 6.2, 2.5); key.target.position.set(0, 0.5, 0); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(maxShadow, maxShadow); key.shadow.bias = -0.0001; key.shadow.normalBias = 0.01; key.shadow.radius = 3;
  const rim = new THREE.SpotLight(0xb4c6ec, 160, 0, 0.6, 0.6, 2); rim.position.set(-2, 4.5, -4); rim.target.position.set(0, 0.6, 0); scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.12));
  for (const [x, z, c] of [[1.5, 2.5, 0xfff0dc], [-2, -4, 0xb4c6ec]]) { const cone = lightCone({ height: 6.4, radius: 2.4, color: c, intensity: 0.04 }); cone.position.set(x, 0, z); scene.add(cone); }
  groundAO(floor.material, { range: 0.12, min: 0.5 });

  // ---- camera: side-on, slightly oblique; framed so the whole rope fits on any screen
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3(0, 0.7, 0);
  function frame(w, h) {
    // landscape: the whole rope, sled to sled. Portrait: the centre zone — marker against the line — with a wider lens
    const portrait = h > w * 1.1;
    camera.aspect = w / h; camera.fov = portrait ? 58 : 36; camera.updateProjectionMatrix();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const d = THREE.MathUtils.clamp((portrait ? 1.9 : 4.1) / half, 4.5, 18), az = portrait ? 0.45 : 0.2;
    camTarget.set(0, portrait ? 0.55 : 0.35, 0);
    camBase.set(Math.sin(az) * d, (portrait ? 0.34 : 0.3) * d + 0.4, Math.cos(az) * d);
    camera.position.copy(camBase); camera.lookAt(camTarget);
  }
  function shakeCamera(dx, dy) { camera.position.set(camBase.x + dx, camBase.y + dy, camBase.z); camera.lookAt(camTarget.x + dx * 0.5, camTarget.y + dy * 0.5, camTarget.z); }

  return { scene, camera, frame, shakeCamera, setRope, kick, dust, mine, ghost };
}
