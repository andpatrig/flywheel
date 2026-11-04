// screens/quarry/stage.js — the Quarry: a voxel rock face with real strata, crystal veins, work lights,
// and a smash system (debris, sparks, dust). Scene construction + state; the game loop drives it later.
import { THREE, rng, fbm, smooth, paint, softDot, lightCone } from '../../core/gfx.js';

const V = 0.2;                                    // voxel edge, m
const NX = 66, NY = 36, NZ = 22;                  // face is 13 m wide, 7.2 m tall, up to 4.4 m deep (benches)
const X0 = -NX / 2;

// strata from bottom to top: name, base colour (linear-ish sRGB hex), crystal chance
export const STRATA = [
  { name: 'Basalt', top: 1.3, color: 0x3a3a3b, crystal: 0.05 },
  { name: 'Granite', top: 3.0, color: 0x7d7874, crystal: 0.025 },
  { name: 'Sandstone', top: 4.8, color: 0x857c72, crystal: 0.0 },
  { name: 'Clay', top: 6.1, color: 0x675850, crystal: 0.0 },
  { name: 'Topsoil', top: 99, color: 0x34302c, crystal: 0.0 },
];

function rockMaps() {   // tiling grain shared by every voxel face; instance colour tints it
  const noise = new THREE.SimplexNoise({ random: rng(17) });
  return paint(256, 256, ['map', 'roughnessMap', 'bumpMap'], (u, v, o) => {
    const T = Math.PI * 2, cx = Math.cos(u * T), sx = Math.sin(u * T), cy = Math.cos(v * T), sy = Math.sin(v * T);   // torus mapping = seamless tile
    const n = fbm(noise, cx * 1.4, sx * 1.4, cy * 1.4 + sy * 0.7, 5), g = noise.noise3d(cx * 9, sx * 9, cy * 9 + sy * 4);
    const pit = smooth(0.55, 0.7, noise.noise3d(cx * 5 + 3, sx * 5, sy * 5));
    const mica = smooth(0.62, 0.7, noise.noise3d(cx * 22 + 5, sx * 22, cy * 22 + sy * 11));
    const spar = smooth(0.6, 0.68, noise.noise3d(cx * 17 - 3, sx * 17 + 8, cy * 17 - sy * 9));
    const c = 190 + n * 30 + g * 14 - pit * 45 - mica * 95 + spar * 45;
    o.map[0] = c; o.map[1] = c * 0.99; o.map[2] = c * 0.97;
    const r = 215 + g * 25 + pit * 30; o.roughnessMap[0] = o.roughnessMap[1] = o.roughnessMap[2] = Math.min(255, r);
    const b = 128 + n * 60 + g * 30 - pit * 70; o.bumpMap[0] = o.bumpMap[1] = o.bumpMap[2] = Math.max(0, Math.min(255, b));
  });
}
function dirtMaps() {
  const noise = new THREE.SimplexNoise({ random: rng(23) });
  return paint(512, 512, ['map', 'bumpMap'], (u, v, o) => {
    const T = Math.PI * 2, cx = Math.cos(u * T), sx = Math.sin(u * T), cy = Math.cos(v * T), sy = Math.sin(v * T);
    const n = fbm(noise, cx * 2, sx * 2, cy * 2 + sy, 5), g = noise.noise3d(cx * 30, sx * 30, cy * 30 + sy * 12);
    const c = 0.8 + n * 0.22 + g * 0.06;
    o.map[0] = 92 * c; o.map[1] = 80 * c; o.map[2] = 68 * c;
    const b = 128 + n * 70 + g * 40; o.bumpMap[0] = o.bumpMap[1] = o.bumpMap[2] = Math.max(0, Math.min(255, b));
  });
}

export function createQuarry({ renderer, envMap, accent = '#00e5ff', maxShadow = 2048 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  scene.fog = new THREE.FogExp2(0x0c0d10, 0.045);
  scene.environment = envMap; scene.environmentIntensity = 0.18;

  const noise = new THREE.SimplexNoise({ random: rng(5) }), rnd = rng(77);
  const rock = rockMaps();
  const voxelGeo = new THREE.RoundedBoxGeometry(V * 0.99, V * 0.99, V * 0.99, 2, V * 0.055);
  const rockMat = new THREE.MeshStandardMaterial({ ...rock, bumpScale: 1.8, metalness: 0 });
  const crystalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).multiplyScalar(0.35), emissive: new THREE.Color(accent), emissiveIntensity: 0.95, roughness: 0.18, metalness: 0.1 });

  // ---------- the face: a voxel volume with a noisy front surface and a fresh crater
  const crater = { x: 0.6, y: 1.55, rx: 1.15, ry: 0.85, depth: 1.25 };
  const grid = new Uint8Array(NX * NY * NZ);          // 0 empty, 1 rock, 2 crystal
  const idx = (i, j, k) => (k * NY + j) * NX + i;
  const BENCH_H = 2.4, BENCH_D = 1.1;   // stepped benches, as real quarry faces are cut
  const surfaceDepth = (x, y) => {
    const step = Math.floor(y / BENCH_H), within = y - step * BENCH_H;
    const lip = smooth(BENCH_H - 0.35, BENCH_H, within) * 0.25;                          // worn edge at each bench top
    return 0.2 + step * BENCH_D + lip + 0.75 * (0.5 + 0.5 * fbm(noise, x * 0.45, y * 0.5, 0.3, 5)) + 0.25 * noise.noise3d(x * 1.6, y * 1.6, 7);
  };
  const stratumAt = (y, x) => { const w = y + 0.45 * fbm(noise, x * 0.18, y * 0.15, 4.0, 4) + 0.12 * x * 0.1; return STRATA.findIndex((s) => w < s.top); };
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = (X0 + i + 0.5) * V, y = (j + 0.5) * V, zBack = (k + 0.5) * V;            // k grows into the wall
    if (zBack < surfaceDepth(x, y)) continue;                                            // carved front surface
    const dx = (x - crater.x) / crater.rx, dy = (y - crater.y) / crater.ry, rr = dx * dx + dy * dy;
    if (rr < 1 && zBack < surfaceDepth(x, y) + crater.depth * Math.sqrt(1 - rr) * (0.85 + 0.3 * rnd())) continue;   // crater bowl
    const s = STRATA[stratumAt(y, x)];
    const vein = fbm(noise, x * 0.9 + 11, y * 0.9, zBack * 0.9, 3);
    const nearCrater = Math.exp(-((x - crater.x) ** 2) / 2.2 - ((y - crater.y) ** 2) / 1.2);
    grid[idx(i, j, k)] = s.crystal > 0 && nearCrater > 0.3 && vein > 0.5 - nearCrater * 0.45 ? 2 : 1;
  }
  const exposed = (i, j, k) => {
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]]) {
      const ii = i + a, jj = j + b, kk = k + c;
      if (ii < 0 || ii >= NX || jj >= NY || kk < 0) return true;
      if (jj < 0) continue;
      if (!grid[idx(ii, jj, kk)]) return true;
    }
    return false;
  };
  const rockList = [], crystalList = [];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const g = grid[idx(i, j, k)]; if (!g || !exposed(i, j, k)) continue;
    (g === 2 ? crystalList : rockList).push([i, j, k]);
  }
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion();
  const rocks = new THREE.InstancedMesh(voxelGeo, rockMat, rockList.length);
  rockList.forEach(([i, j, k], n) => {
    const x = (X0 + i + 0.5) * V, y = (j + 0.5) * V, z = -(k + 0.5) * V;
    const jit = (rnd() - 0.5) * 0.012;
    m4.compose(new THREE.Vector3(x, y, z + jit), q.identity(), new THREE.Vector3(1, 1, 1)); rocks.setMatrixAt(n, m4);
    const s = STRATA[stratumAt(y, x)];
    let open = 0;
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]]) { const ii = i + a, jj = j + b, kk = k + c; if (ii >= 0 && ii < NX && jj >= 0 && jj < NY && kk >= 0 && !grid[idx(ii, jj, kk)]) open++; }
    const ao = 0.62 + 0.11 * open;                                                        // crevices dark, edges bright
    col.set(s.color).multiplyScalar(ao * (0.78 + rnd() * 0.34 + fbm(noise, x * 0.8, y * 0.8, z, 3) * 0.22) * (rnd() < 0.06 ? 0.7 : 1));
    const fresh = smooth(0.3, 1.2, -z - surfaceDepth(x, y));                              // freshly exposed rock is cleaner, lighter
    col.lerp(new THREE.Color(s.color).multiplyScalar(1.2), fresh * 0.3);
    rocks.setColorAt(n, col);
  });
  rocks.castShadow = rocks.receiveShadow = true; scene.add(rocks);
  const crystals = new THREE.InstancedMesh(voxelGeo, crystalMat, Math.max(1, crystalList.length));
  crystalList.forEach(([i, j, k], n) => { m4.compose(new THREE.Vector3((X0 + i + 0.5) * V, (j + 0.5) * V, -(k + 0.5) * V), q.identity(), new THREE.Vector3(1, 1, 1)); crystals.setMatrixAt(n, m4); });
  crystals.castShadow = true; scene.add(crystals);
  // the crystals light their surroundings a little
  const glow = new THREE.PointLight(new THREE.Color(accent), 3.2, 3.2, 2); glow.position.set(crater.x, crater.y - 0.1, -0.9); scene.add(glow);

  // ---------- quarry floor + rubble
  const dirt = dirtMaps(); for (const t of Object.values(dirt)) t.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ ...dirt, bumpScale: 2, roughness: 0.96 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 4; floor.receiveShadow = true; scene.add(floor);
  const rubbleN = 520, rubble = new THREE.InstancedMesh(voxelGeo, rockMat, rubbleN);
  for (let n = 0; n < rubbleN; n++) {
    const along = (rnd() - 0.5) * 10.5, out = Math.pow(rnd(), 2.2) * 1.9, s = 0.25 + rnd() * 0.75;
    const near = Math.exp(-Math.pow((along - crater.x) / 1.8, 2));                       // fresh pile under the crater
    const z = 0.05 + out * (1 + near * 0.6);
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    m4.compose(new THREE.Vector3(along, s * V * 0.3 + (near * (1.9 - out) * 0.12), z), q, new THREE.Vector3(s, s * (0.6 + rnd() * 0.5), s)); rubble.setMatrixAt(n, m4);
    const y = rnd() < near ? crater.y : rnd() * 5;
    col.set(STRATA[stratumAt(y, along)].color).multiplyScalar(0.75 + rnd() * 0.3); rubble.setColorAt(n, col);
  }
  rubble.castShadow = rubble.receiveShadow = true; scene.add(rubble);

  // ---------- smash: debris + sparks + dust, frozen at time t after impact
  const impact = new THREE.Vector3(crater.x, crater.y, -0.6);
  const DEBRIS = 220, debris = new THREE.InstancedMesh(voxelGeo, rockMat, DEBRIS), shards = new THREE.InstancedMesh(voxelGeo, crystalMat, 26);
  debris.castShadow = true; shards.castShadow = true; scene.add(debris, shards);
  const SPARKS = 64, sparkPos = new Float32Array(SPARKS * 6), sparkCol = new Float32Array(SPARKS * 6);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3)); sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.LineSegments(sparkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(sparks);
  const dotTex = softDot(), DUST = 60, dustPos = new Float32Array(DUST * 3), dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.9, map: dotTex, color: 0xb9ab98, transparent: true, opacity: 0.07, depthWrite: false }));
  scene.add(dust);

  /** Pose a smash `t` seconds after impact. power01 scales speed and count (0–1). */
  function smash(t, power01 = 1, seed = 3) {
    const r = rng(seed), g = new THREE.Vector3(0, -9.81, 0), p = new THREE.Vector3(), v = new THREE.Vector3();
    const n = Math.round(DEBRIS * (0.45 + 0.55 * power01));
    for (let i = 0; i < DEBRIS; i++) {
      if (i >= n) { m4.makeScale(0, 0, 0); debris.setMatrixAt(i, m4); continue; }
      const a = r() * Math.PI * 2, spread = 0.35 + r() * 0.9, sp = (2.2 + r() * 4.2) * (0.6 + 0.4 * power01);
      v.set(Math.cos(a) * spread, Math.sin(a) * spread * 0.8 + 0.35, 1).normalize().multiplyScalar(sp);
      const tt = t * (0.75 + r() * 0.5);
      p.copy(impact).addScaledVector(v, tt).addScaledVector(g, 0.5 * tt * tt);
      p.x += (r() - 0.5) * 0.4; p.y += (r() - 0.5) * 0.3;
      const s = 0.12 + Math.pow(r(), 2) * 0.7;
      q.setFromEuler(new THREE.Euler(r() * 6 + tt * 9, r() * 6, r() * 6 + tt * 7));
      m4.compose(p, q, new THREE.Vector3(s, s * (0.7 + r() * 0.5), s)); debris.setMatrixAt(i, m4);
      col.set(STRATA[r() < 0.85 ? 1 : 0].color).multiplyScalar(0.9 + r() * 0.5); debris.setColorAt(i, col);
    }
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, sp = 2.5 + r() * 3.5;
      v.set(Math.cos(a) * 0.7, Math.sin(a) * 0.6 + 0.5, 1).normalize().multiplyScalar(sp);
      p.copy(impact).addScaledVector(v, t).addScaledVector(g, 0.5 * t * t);
      const s = 0.08 + r() * 0.22; q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
      m4.compose(p, q, new THREE.Vector3(s, s * 1.6, s)); shards.setMatrixAt(i, m4);
    }
    const warm = new THREE.Color(0xffd29a), acc = new THREE.Color(accent);
    for (let i = 0; i < SPARKS; i++) {
      const a = r() * Math.PI * 2, sp = 5 + r() * 7;
      v.set(Math.cos(a) * 0.9, Math.sin(a) * 0.7 + 0.3, 0.8 + r() * 0.5).normalize().multiplyScalar(sp);
      const tt = t * (0.6 + r() * 0.6);
      p.copy(impact).addScaledVector(v, tt).addScaledVector(g, 0.5 * tt * tt);
      const tail = p.clone().addScaledVector(v, -0.012 - r() * 0.018);
      sparkPos.set([p.x, p.y, p.z, tail.x, tail.y, tail.z], i * 6);
      const c = r() < 0.8 ? warm : acc, k = 3 + r() * 3;
      sparkCol.set([c.r * k, c.g * k, c.b * k, c.r * 0.2, c.g * 0.2, c.b * 0.2], i * 6);
    }
    sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
    for (let i = 0; i < DUST; i++) {
      const a = r() * Math.PI * 2, rr = 0.2 + r() * (0.6 + t * 3);
      dustPos.set([impact.x + Math.cos(a) * rr, impact.y + Math.sin(a) * rr * 0.6 - 0.1, impact.z + 0.3 + r() * (0.4 + t * 2)], i * 3);
    }
    dustGeo.attributes.position.needsUpdate = true;
    debris.instanceMatrix.needsUpdate = true; if (debris.instanceColor) debris.instanceColor.needsUpdate = true; shards.instanceMatrix.needsUpdate = true;
  }

  // ---------- work lights: LED floods on tripods
  const steel = new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0.7, roughness: 0.4 });
  const housing = new THREE.MeshStandardMaterial({ color: 0xd8a200, metalness: 0.3, roughness: 0.45 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff3e2, emissiveIntensity: 4 });
  function workLight(pos, aim, color, intensity, shadow) {
    const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4, foot = new THREE.Vector3(Math.cos(a) * 0.55, -pos.y, Math.sin(a) * 0.55);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, foot.length(), 10), steel);
      leg.position.copy(foot).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().normalize()); leg.castShadow = true; g.add(leg);
    }
    const head = new THREE.Group(); g.add(head);
    const box = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.42, 0.3, 0.1, 3, 0.02), housing); box.castShadow = true; head.add(box);
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.24), panel); led.position.z = 0.051; head.add(led);
    head.lookAt(aim.clone().sub(pos).add(g.position));
    const light = new THREE.SpotLight(color, intensity, 0, 0.62, 0.75, 2);
    light.position.copy(pos).add(aim.clone().sub(pos).normalize().multiplyScalar(0.08)); light.target.position.copy(aim);
    if (shadow) { light.castShadow = true; light.shadow.mapSize.set(maxShadow, maxShadow); light.shadow.bias = -0.0003; light.shadow.normalBias = 0.03; light.shadow.camera.near = 1; light.shadow.camera.far = 16; }
    scene.add(light, light.target);
    const cone = lightCone({ height: 8, radius: 4.2, color, intensity: 0.022 });
    cone.position.copy(light.position); cone.lookAt(aim); cone.rotateX(-Math.PI / 2); scene.add(cone);
    return g;
  }
  workLight(new THREE.Vector3(-5.2, 1.7, 3.0), new THREE.Vector3(0.8, 2.2, -1.2), 0xffe2c0, 330, true);
  workLight(new THREE.Vector3(5.4, 1.5, 3.6), new THREE.Vector3(0.2, 1.6, -1.0), 0xcfdcff, 70, false);
  scene.add(new THREE.HemisphereLight(0x5e6a80, 0x14110e, 0.16));
  const rim = new THREE.DirectionalLight(0xb9c6e0, 0.35); rim.position.set(2, 8, -2); scene.add(rim);

  // ambient dust in the air
  const AIR = 700, air = new Float32Array(AIR * 3), ar = rng(91);
  for (let i = 0; i < AIR; i++) air.set([(ar() - 0.5) * 10, ar() * 5.5, ar() * 5 - 0.5], i * 3);
  const airGeo = new THREE.BufferGeometry(); airGeo.setAttribute('position', new THREE.BufferAttribute(air, 3));
  scene.add(new THREE.Points(airGeo, new THREE.PointsMaterial({ size: 0.012, map: dotTex, color: 0xffe9cf, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })));

  // ---------- camera
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 60);
  const target = new THREE.Vector3(0.3, 3.15, -1.6), dir = new THREE.Vector3(-0.36, 0.05, 1).normalize();
  function frame(w, h) {
    const aspect = w / h, portrait = aspect < 1;
    camera.aspect = aspect; camera.fov = portrait ? 50 : 38;
    const halfW = portrait ? 2.3 : 6.3, halfH = portrait ? 3.6 : 4.0;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * aspect;
    const d = Math.max(halfW / th, halfH / tv);
    const tgt = portrait ? target.clone().add(new THREE.Vector3(0.2, 0, 0)) : target;
    camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateProjectionMatrix();
  }
  function setAccent(hex) { crystalMat.emissive.set(hex); crystalMat.color.set(hex).multiplyScalar(0.35); glow.color.set(hex); }
  return { scene, camera, frame, smash, setAccent, crater, counts: { rocks: rockList.length, crystals: crystalList.length } };
}
