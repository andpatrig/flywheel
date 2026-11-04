// screens/tug/stage.js — the tug-of-war lane: a long raised pulling deck, metre marks either side of a lit centre
// line, two weighted sleds joined by a rope (yours solid, the opponent a ghost in your accent colour) and a
// marker at the rope's middle. setRig() poses everything from one number, the shift: positive drags the whole
// rig toward your end. The deck is long enough for a decisive lead to drag the opponent's sled over the line.
import { rubberFloorMaps, THREE, canvasTexture, softDot, lightCone, groundAO, contactShadowTexture, createParticles } from '../../core/gfx.js';

export const SLED_X = 3.2;           // m: each sled's hitch from the centre line at rest
export const X_MAX = 3.6;            // m: the most the rig can be dragged either way (past the line for the loser)
export const DECK_L = 17;            // m
const DECK_W = 1.9, DECK_H = 0.08, HITCH_H = 0.08 + (0.55 - 0.08) * 1.35, ROPE_R = 0.022;

function deckTexture(accent) {
  // metre marks and numbers painted on the deck, mirrored either side of the centre line
  const PX = 160, w = Math.round(DECK_L * PX / 4) * 4, h = Math.round(DECK_W * PX);
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    for (let m = 1; m <= 8; m++) for (const s of [-1, 1]) {
      const x = cx + s * m * PX;
      g.fillStyle = m % 2 ? 'rgba(242,240,234,0.20)' : 'rgba(242,240,234,0.42)';
      g.fillRect(x - 2, h * 0.08, 4, m % 2 ? h * 0.1 : h * 0.18); g.fillRect(x - 2, h * (m % 2 ? 0.82 : 0.74), 4, m % 2 ? h * 0.1 : h * 0.18);
    }
    for (let m = 0.5; m <= 8; m += 1) for (const s of [-1, 1]) { g.fillStyle = 'rgba(242,240,234,0.12)'; g.fillRect(cx + s * m * PX - 1, h * 0.08, 2, h * 0.06); g.fillRect(cx + s * m * PX - 1, h * 0.86, 2, h * 0.06); }
    // edge lines
    g.fillStyle = 'rgba(242,240,234,0.22)'; g.fillRect(0, h * 0.04, w, 3); g.fillRect(0, h * 0.96 - 3, w, 3);
  });
}

export function createStage({ renderer, envMap, accent = '#00e5ff', maxShadow = 2048 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060708);
  scene.fog = new THREE.FogExp2(0x060708, 0.04);
  scene.environment = envMap; scene.environmentIntensity = 0.22;
  const col = new THREE.Color(accent);

  // ---- floor and the raised pulling deck
  const floorMaps = rubberFloorMaps(); for (const t of Object.values(floorMaps)) t.repeat.set(20, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ ...floorMaps, bumpScale: 0.6, color: 0x8a8a8a, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  groundAO(floor.material, { range: 0.18, min: 0.45 });
  const deckMaps = rubberFloorMaps(); for (const t of Object.values(deckMaps)) t.repeat.set(DECK_L / 2, DECK_W / 2);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_L, DECK_H, DECK_W), new THREE.MeshStandardMaterial({ ...deckMaps, bumpScale: 0.5, color: 0xffffff, metalness: 0 }));
  deck.position.y = DECK_H / 2; deck.castShadow = deck.receiveShadow = true; scene.add(deck);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.7, roughness: 0.35 });
  for (const z of [-DECK_W / 2, DECK_W / 2]) { const e = new THREE.Mesh(new THREE.BoxGeometry(DECK_L + 0.02, DECK_H + 0.01, 0.025), edgeMat); e.position.set(0, DECK_H / 2, z); scene.add(e); }
  for (const x of [-DECK_L / 2, DECK_L / 2]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.025, DECK_H + 0.01, DECK_W + 0.02), edgeMat); e.position.set(x, DECK_H / 2, 0); scene.add(e); }
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(DECK_L, DECK_W), new THREE.MeshStandardMaterial({ map: deckTexture(accent), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  marks.rotation.x = -Math.PI / 2; marks.position.y = DECK_H + 0.001; marks.receiveShadow = true; scene.add(marks);
  // the centre line: a lit strip set into the deck
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 1.6, roughness: 0.5 });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.004, DECK_W - 0.06), lineMat); line.position.y = DECK_H + 0.002; scene.add(line);
  const lineGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, DECK_W), new THREE.MeshBasicMaterial({ map: canvasTexture(64, 8, (g, w, h) => { const r = g.createLinearGradient(0, 0, w, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }));
  lineGlow.rotation.x = -Math.PI / 2; lineGlow.position.y = DECK_H + 0.003; scene.add(lineGlow);

  // ---- sleds: two runners turned up at the front, a deck plate, a post with a stack of plates, the hitch
  const steel = new THREE.MeshStandardMaterial({ color: 0x2e3135, metalness: 0.65, roughness: 0.4 });
  const plateM = new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.35, roughness: 0.55 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101011, roughness: 0.9 });
  const accentM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 1.2, roughness: 0.5 });
  const ghostMat = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.26, roughness: 0.5, metalness: 0.1, emissive: col, emissiveIntensity: 0.45, depthWrite: false });
  function runnerGeo() {
    const pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push(new THREE.Vector3(-0.45 + 0.9 * u, 0, 0)); }
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI * 0.5; pts.push(new THREE.Vector3(0.45 + Math.sin(a) * 0.12, 0.12 - Math.cos(a) * 0.12, 0)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.02, 10, false);
  }
  function buildSled(ghost) {
    const g = new THREE.Group(), M = (m) => ghost ? ghostMat : m;
    for (const z of [-0.24, 0.24]) { const r = new THREE.Mesh(runnerGeo(), M(steel)); r.position.set(0, 0.02, z); g.add(r); }
    const deckP = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.56), M(steel)); deckP.position.set(-0.05, 0.075, 0); g.add(deckP);
    for (const x of [-0.32, 0.22]) for (const z of [-0.24, 0.24]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), M(steel)); leg.position.set(x, 0.05, z); g.add(leg); }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 16), M(steel)); post.position.set(-0.05, 0.29, 0); g.add(post);
    for (let i = 0; i < 4; i++) { const r = 0.2 - i * 0.012, p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.042, 40), M(plateM)); p.position.set(-0.05, 0.11 + i * 0.045, 0); g.add(p); }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20), M(steel)); collar.position.set(-0.05, 0.3, 0); g.add(collar);
    // tow bar from the deck up to the hitch ring, toward the rope (+x in the sled's frame)
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 10), M(steel)); bar.position.set(0.28, 0.32, 0); bar.rotation.z = -0.95; g.add(bar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 10, 24), M(steel)); ring.position.set(0.52, HITCH_H - DECK_H, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
    if (!ghost) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.006, 0.05), accentM); st.position.set(-0.05, 0.09, 0.285); g.add(st); }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.56), M(rubber)); pad.position.set(-0.43, 0.085, 0); g.add(pad);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !ghost; o.receiveShadow = !ghost; } });
    g.scale.setScalar(1.35);
    const outer = new THREE.Group(); outer.add(g); outer.position.y = DECK_H; outer.userData.body = g;
    return outer;
  }
  const mine = buildSled(false), ghost = buildSled(true);
  mine.rotation.y = 0;            // my sled sits at −x, rope toward +x
  ghost.rotation.y = Math.PI;     // mirrored
  scene.add(mine, ghost);
  const cs = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.65, depthWrite: false });
  for (const s of [mine, ghost]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), s === mine ? cs : cs.clone()); q.rotation.x = -Math.PI / 2; q.position.y = 0.002; s.add(q); if (s === ghost) q.material.opacity = 0.22; }

  // ---- rope: instanced segments along a shallow catenary between the hitches; marker at the middle
  const SEG = 160, ropeGeo = new THREE.CylinderGeometry(ROPE_R, ROPE_R, 0.06, 10); ropeGeo.rotateZ(Math.PI / 2);
  const rope = new THREE.InstancedMesh(ropeGeo, new THREE.MeshStandardMaterial({ color: 0xbfa77d, roughness: 0.95 }), SEG); rope.castShadow = true; scene.add(rope);
  const marker = new THREE.Group(); scene.add(marker);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(ROPE_R + 0.012, ROPE_R + 0.012, 0.14, 18), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 1.4, roughness: 0.5 })); sleeve.castShadow = true; marker.add(sleeve);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 1.1, side: THREE.DoubleSide, roughness: 0.8 })); flag.position.set(0, 0, 0.1); flag.rotation.x = Math.PI / 2; marker.add(flag);
  const markerGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: softDot(64), color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); markerGlow.rotation.x = -Math.PI / 2; scene.add(markerGlow);
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), X = new THREE.Vector3(1, 0, 0), _d = new THREE.Vector3();
  const pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());

  // ---- dust from the runners when a sled is dragged
  const dust = createParticles({ max: 220, texture: softDot(64), color: 0x8a8378, drag: 2.5, gravity: -0.12 }); scene.add(dust.points);
  function kick(mineSide, n = 10, v = 0.5) {
    const x = (mineSide ? mine : ghost).position.x;
    dust.emit(n, (p) => { p.pos.set(x + (Math.random() - 0.5) * 0.8, DECK_H + 0.02, (Math.random() < 0.5 ? -0.24 : 0.24) + (Math.random() - 0.5) * 0.1); p.vel.set((Math.random() - 0.5) * v, Math.random() * 0.25, (Math.random() - 0.5) * v * 0.6); p.life = 0.6 + Math.random() * 0.6; p.size0 = 0.05; p.size1 = 0.22 + Math.random() * 0.15; p.alpha = 0.14; });
  }

  /**
   * shift: the rig's displacement toward your end (m, + when you lead); tension 0..1 sets the sag; wobble ripples
   * the rope after a yank; v: rig velocity (sleds pitch as they are dragged); time in seconds.
   */
  function setRig({ shift = 0, tension = 0.5, wobble = 0, v = 0, time = 0 }) {
    mine.position.x = -SLED_X - shift; ghost.position.x = SLED_X - shift;
    // a dragged sled noses down into the deck; the anchoring one sits back on its heels
    mine.userData.body.rotation.z = THREE.MathUtils.clamp(-v * 0.02, -0.04, 0.04); ghost.userData.body.rotation.z = THREE.MathUtils.clamp(-v * 0.02, -0.04, 0.04);
    const x0 = mine.position.x + 0.52 * 1.35, x1 = ghost.position.x - 0.52 * 1.35, sag = 0.16 * (1 - 0.85 * Math.min(1, tension));
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, x = x0 + (x1 - x0) * u;
      const y = HITCH_H - sag * 4 * u * (1 - u) + wobble * Math.sin(u * Math.PI * 3) * Math.sin(time * 38);
      pts[i].set(x, Math.max(DECK_H + ROPE_R, y), wobble * 0.5 * Math.sin(u * Math.PI * 2) * Math.cos(time * 31));
    }
    for (let i = 0; i < SEG; i++) {
      _p.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5); _d.subVectors(pts[i + 1], pts[i]); _q.setFromUnitVectors(X, _d.normalize());
      _m.compose(_p, _q, _one); rope.setMatrixAt(i, _m);
    }
    rope.instanceMatrix.needsUpdate = true;
    const mid = pts[SEG / 2]; marker.position.copy(mid); _d.subVectors(pts[SEG / 2 + 1], pts[SEG / 2 - 1]).normalize(); marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _d);
    markerGlow.position.set(mid.x, DECK_H + 0.004, 0);
    camFocus = -shift * 0.45;                                                 // the camera drifts with the struggle
  }

  // ---- lights
  const key = new THREE.SpotLight(0xffeedd, 520, 0, 0.62, 0.55, 2); key.position.set(0.5, 7.5, 3.5); key.target.position.set(0, 0.3, 0); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(maxShadow, maxShadow); key.shadow.bias = -0.0001; key.shadow.normalBias = 0.01; key.shadow.radius = 3;
  for (const x of [-5.5, 5.5]) { const s = new THREE.SpotLight(0xfff0e0, 140, 0, 0.45, 0.6, 2); s.position.set(x, 6, 2.5); s.target.position.set(x, 0, 0); scene.add(s, s.target); }
  const rim = new THREE.SpotLight(0xb4c6ec, 180, 0, 0.7, 0.6, 2); rim.position.set(-2, 5, -5); rim.target.position.set(0, 0.4, 0); scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.14));
  for (const [x, z, c] of [[0.5, 3.5, 0xfff0dc], [-2, -5, 0xb4c6ec]]) { const cone = lightCone({ height: 7.4, radius: 2.8, color: c, intensity: 0.035 }); cone.position.set(x, 0, z); scene.add(cone); }

  // ---- camera: three-quarter view down the lane; landscape shows the whole contest, portrait the centre zone
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let camFocus = 0, portrait = false;
  function frame(w, h) {
    portrait = h > w * 1.1;
    camera.aspect = w / h; camera.fov = portrait ? 52 : 30; camera.updateProjectionMatrix();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const d = THREE.MathUtils.clamp((portrait ? 3.6 : 5.2) / half, 4, 30), az = portrait ? 0.35 : 0.12;
    camTarget.set(0, portrait ? 0.2 : 0.12, 0);
    camBase.set(Math.sin(az) * d, (portrait ? 0.62 : 0.5) * d + 0.25, Math.cos(az) * d);
    shakeCamera(0, 0);
  }
  function shakeCamera(dx, dy) {
    const f = portrait ? camFocus * 1.6 : camFocus;
    camera.position.set(camBase.x + f + dx, camBase.y + dy, camBase.z); camera.lookAt(camTarget.x + f + dx * 0.5, camTarget.y + dy * 0.5, camTarget.z);
  }

  return { scene, camera, frame, shakeCamera, setRig, kick, dust, mine, ghost };
}
