// screens/stones/stage.js — the Atlas Stones arena: real-scale stones, platforms, A-frame gantry with
// an electric chain hoist, arena lighting and atmosphere. Pure scene construction + state setters;
// the game loop (screens/stones/game.js, later) drives it from engine stroke events.
import { rubberFloorMaps, THREE, rng, fbm, smooth, paint, canvasTexture, softDot, lightCone, groundAO, detailLayer, contactShadowTexture, createParticles } from '../../core/gfx.js';

// ---------- real-world parameters
export const G = 9.81;
export const PLATFORM_H = 1.30;                       // m, top of platform
export const STONE_MASSES = [180, 240, 300, 400, 500];  // kg — the crane makes any mass liftable
const CONCRETE = 2400;                                // kg/m³
export const stoneRadius = (m) => Math.cbrt((3 * m) / (4 * Math.PI * CONCRETE));
export const LANES = [-3.2, -1.6, 0, 1.6, 3.2];       // platform x positions
const START_Z = 0.95;                                 // stones start on the floor in front of their platform
// Seat on each platform: a rubber ring whose top is cupped to its stone, so contact is full all round
// (rubber conforms; no light between stone and seat). The stone presses SEAT_SINK into the rubber.
export const SEAT_MIN = 0.012, SEAT_SINK = 0.0025;                                   // min rubber thickness, how far the stone presses in
export const seatA = (r) => 0.31 * r, seatOut = (r) => 0.64 * r;                      // hole radius, outer radius (sized to the stone)
export const SEAT_T = 0.02;                                                            // nominal height used for clearance
/** Center height of a stone of radius r pressed into its seat. */
export const seatY = (r) => PLATFORM_H + SEAT_MIN + Math.sqrt(r * r - seatA(r) ** 2) - SEAT_SINK;
/** Platform width for a stone of radius r. */
export const platW = (r) => Math.max(0.62, 2 * r + 0.1);

// ---------- materials & textures (procedural, generated once)
// Weathered concrete as on real atlas stones: light cement base, large charcoal stains (some blue-grey),
// dark flecks, pits, a rare rust tint, light chalk on top. `dark` 0–1 sets how stained the stone is.
function stoneMaps(seed, dark) {
  const noise = new THREE.SimplexNoise({ random: rng(seed) });
  return paint(768, 384, ['map', 'roughnessMap', 'bumpMap'], (u, v, o) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    const x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th);
    const mott = fbm(noise, x * 2.4, y * 2.4, z * 2.4, 3);
    const stainN = fbm(noise, x * 1.5 + 7, y * 1.5, z * 1.5, 5) + 0.35 * fbm(noise, x * 6, y * 6, z * 6 + 3, 3);
    const lo = 0.32 - dark * 0.62;
    const stain = Math.pow(smooth(lo, lo + 0.55, stainN), 1.25);                      // broad, soft-edged weathering
    const wash = smooth(-0.35, 0.45, fbm(noise, x * 1.1 + 13, y * 1.1, z * 1.1, 3));   // mid-grey grime between clean and stained
    const blue = smooth(0.05, 0.4, fbm(noise, x * 2.2 - 4, y * 2.2, z * 2.2, 3)) * stain;
    const wx = 0.08 * noise.noise3d(x * 9, y * 9, z * 9 + 50);
    const fleck = smooth(0.8, 0.88, noise.noise3d((x + wx) * 18, (y - wx) * 18, (z + wx) * 18 + 9)) * (0.3 + 0.7 * (1 - stain));
    const pit = Math.max(smooth(0.74, 0.84, noise.noise3d((x + wx) * 40 + 5, (y + wx) * 40, z * 40)), 0.6 * smooth(0.78, 0.88, noise.noise3d(x * 95, y * 95 + 3, z * 95)));
    const rust = smooth(0.76, 0.84, noise.noise3d(x * 6 + 3, y * 6, z * 6)) * 0.35;
    const grain = noise.noise3d(x * 120, y * 120, z * 120);
    const chalk = smooth(0.1, 0.6, fbm(noise, x * 5 + 20, y * 5, z * 5, 4) + 0.3 * y) * 0.22;
    const base = 152 + mott * 16 + grain * 6;
    let r = base * 1.0, g = base * 0.975, b = base * 0.935;
    const w = wash * 0.35; r += (128 - r) * w; g += (125 - g) * w; b += (120 - b) * w;
    const dk = 62 + mott * 14 + fbm(noise, x * 9, y * 9, z * 9, 2) * 12;            // charcoal, itself mottled
    const sr = dk * (1 - blue * 0.12), sg = dk * (1 + blue * 0.02), sb = dk * (1 + blue * 0.28);
    const k = stain * 0.88;
    r = r + (sr - r) * k; g = g + (sg - g) * k; b = b + (sb - b) * k;
    const f = 1 - fleck * 0.2 - pit * 0.3; r *= f; g *= f; b *= f;
    r = r * (1 - rust) + 120 * rust; g = g * (1 - rust) + 86 * rust; b = b * (1 - rust) + 58 * rust;
    r += (226 - r) * chalk; g += (223 - g) * chalk; b += (216 - b) * chalk;
    o.map[0] = r; o.map[1] = g; o.map[2] = b;
    const rough = 214 - stain * 30 + pit * 40 + grain * 14 + chalk * 30; o.roughnessMap[0] = o.roughnessMap[1] = o.roughnessMap[2] = Math.max(0, Math.min(255, rough));
    const poleFade = smooth(0.04, 0.3, Math.sin(ph));                                   // equirect mapping pinches at the poles: fade relief there
    const bump = 128 + (grain * 22 + mott * 18 - pit * 85 - fleck * 30 + stain * 6) * poleFade; o.bumpMap[0] = o.bumpMap[1] = o.bumpMap[2] = Math.max(0, Math.min(255, bump));
  });
}
// Real stones are chipped: carve flat-bottomed craters with steep, irregular rims (fresh, lighter aggregate inside),
// a couple of broad shallow spalls, slight lumpiness, and a raised mould seam at the equator.
function chippedSphere(r, seed) {
  // Real stones are not true spheres: a few mm out of round, flattened where they've been dropped hundreds of
  // times, and chipped at every scale. ~35 deep mid-size chips (1–2.8 cm) that throw shadows, ~150 small nicks,
  // shallow dents, the mould seam. Dense mesh so features under 1 cm exist.
  const g = new THREE.SphereGeometry(r, 288, 216), pos = g.attributes.position, n = pos.count;
  const rnd = rng(seed), noise = new THREE.SimplexNoise({ random: rng(seed + 99) });
  const randDir = () => { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z); return new THREE.Vector3(s * Math.cos(a), z, s * Math.sin(a)); };
  const chips = [], A = (r / 0.24) ** 2;                                               // chip counts scale with surface area
  for (let k = 0, N = Math.round((30 + rnd() * 12) * A); k < N; k++) { const rad = 0.01 + Math.pow(rnd(), 1.5) * 0.018; chips.push({ d: randDir(), rad, depth: Math.min(0.0065, rad * (0.28 + rnd() * 0.12)), sharp: 2.4 + rnd() * 1.1, fresh: 0.2 }); }
  for (let k = 0, N = Math.round((140 + rnd() * 30) * A); k < N; k++) { const rad = 0.003 + Math.pow(rnd(), 1.8) * 0.007; chips.push({ d: randDir(), rad, depth: rad * 0.35, sharp: 4, fresh: 0.22 }); }
  for (let k = 0; k < 6; k++) chips.push({ d: randDir(), rad: 0.02 + rnd() * 0.03, depth: 0.001 + rnd() * 0.0015, sharp: 2, fresh: 0 });
  for (const c of chips) c.cosMax = Math.cos((c.rad * 1.3) / r);
  const flats = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => ({ d: randDir(), lim: r - (0.002 + rnd() * 0.0045) }));
  const col = new Float32Array(n * 3), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    let h = 0.0042 * fbm(noise, d.x * 1.3, d.y * 1.3, d.z * 1.3, 3) + 0.0014 * fbm(noise, d.x * 4.5 + 3, d.y * 4.5, d.z * 4.5, 3)
          + 0.0004 * noise.noise3d(d.x * 22, d.y * 22, d.z * 22);
    h += 0.0009 * Math.exp(-Math.pow(d.y / 0.006, 2));                                  // mould seam
    let fresh = 0;
    for (const c of chips) {
      const dot = d.dot(c.d); if (dot < c.cosMax) continue;
      const s = Math.acos(Math.min(1, dot)) * r;
      const edge = c.rad * (0.65 + 0.7 * (0.5 + 0.5 * noise.noise3d(d.x * 30 + c.rad * 300, d.y * 30, d.z * 30)));
      const t = s / edge; if (t >= 1) continue;
      const prof = 1 - Math.pow(t, c.sharp);
      h -= c.depth * prof * (0.85 + 0.25 * noise.noise3d(d.x * 70, d.y * 70, d.z * 70));
      fresh = Math.max(fresh, prof * c.fresh);
    }
    let R = r + h;
    for (const f of flats) { const dot = d.dot(f.d); if (dot > 0.75 && R * dot > f.lim) { R = f.lim / dot; fresh = Math.max(fresh, 0.08); } }   // worn flats
    pos.setXYZ(i, d.x * R, d.y * R, d.z * R);
    const lift = 1 + fresh; col[i * 3] = lift; col[i * 3 + 1] = lift * 0.99; col[i * 3 + 2] = lift * 0.96;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // UV-sphere poles gather 288 sliver triangles into one point; their normals fan out into a star artifact.
  // Average each pole (and the ring next to it) so the poles shade like any other point on the stone.
  const nrm = g.attributes.normal, W = 289, H = 216, avg = new THREE.Vector3(), t = new THREE.Vector3();
  for (const rows of [[0, 1], [H, H - 1]]) {
    avg.set(0, 0, 0);
    for (let x = 0; x < W; x++) avg.add(t.fromBufferAttribute(nrm, rows[1] * W + x));
    avg.normalize();
    for (let x = 0; x < W; x++) nrm.setXYZ(rows[0] * W + x, avg.x, avg.y, avg.z);
  }
  nrm.needsUpdate = true;
  return g;
}
function plywoodMaps() {   // birch ply top: warm, faint grain
  const noise = new THREE.SimplexNoise({ random: rng(21) });
  return paint(256, 256, ['map'], (u, v, o) => {
    const g = Math.sin((v * 38 + fbm(noise, u * 3, v * 3, 0, 3) * 4) * Math.PI) * 0.5 + 0.5;
    const c = 0.82 + g * 0.08 + noise.noise3d(u * 40, v * 4, 1) * 0.03;
    o.map[0] = 176 * c; o.map[1] = 140 * c; o.map[2] = 98 * c;
  });
}
// Fine concrete detail, tiled many times over each stone: R = albedo modulation (0.5 neutral), G = height.
// Sand grains, micro-pits and hairline scratches at a scale the base map can't hold.
function stoneDetailMap() {
  const noise = new THREE.SimplexNoise({ random: rng(61) });
  const t = paint(512, 512, ['map'], (u, v, o) => {
    const T = Math.PI * 2, cx = Math.cos(u * T), sx = Math.sin(u * T), cy = Math.cos(v * T), sy = Math.sin(v * T);
    const at = (f, k = 0) => noise.noise3d(cx * f + k, sx * f, (cy + sy * 0.7) * f);            // seamless tile
    const sand = at(9) * 0.5 + at(19, 3) * 0.3 + at(41, 7) * 0.2;
    const pit = smooth(0.62, 0.76, at(13, 11)), micro = smooth(0.7, 0.82, at(31, 17));
    const scratch = smooth(0.92, 0.985, 1 - Math.abs(at(3, 21))) * smooth(0.2, 0.6, at(5, 27));
    o.map[0] = Math.max(0, Math.min(255, 128 + sand * 24 - pit * 55 - micro * 30 + scratch * 30));
    o.map[1] = Math.max(0, Math.min(255, 128 + sand * 40 - pit * 110 - micro * 60 - scratch * 25));
    o.map[2] = 128;
  });
  t.map.colorSpace = THREE.NoColorSpace;
  return t.map;
}
function weaveMap() {   // round-sling polyester sleeve: fine diagonal weave
  return paint(64, 256, ['bumpMap'], (u, v, o) => {
    const w = 0.5 + 0.5 * Math.sin((u * 6 + v * 40) * Math.PI * 2) * Math.sin((u * 6 - v * 40) * Math.PI * 2);
    o.bumpMap[0] = o.bumpMap[1] = o.bumpMap[2] = 110 + w * 120;
  }).bumpMap;
}
function plateTexture(n, mass) {
  return canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#f2f2f0'; g.textBaseline = 'alphabetic';
    g.font = '700 190px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillText(String(n), 38, 222);
    g.font = '600 64px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillText(`${mass}`, 210, 160);
    g.fillStyle = 'rgba(242,242,240,0.6)'; g.font = '600 40px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillText('KG', 212, 222);
  });
}
function decalTexture(kind, seed) {
  const rnd = rng(seed);
  return canvasTexture(256, 256, (g, w) => {
    if (kind === 'shadow') {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.45, 'rgba(0,0,0,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    } else {   // chalk smudge
      for (let i = 0; i < 140; i++) {
        const x = w / 2 + (rnd() - 0.5) * w * 0.7, y = w / 2 + (rnd() - 0.5) * w * 0.5, rr = 6 + rnd() * 26;
        const r = g.createRadialGradient(x, y, 0, x, y, rr);
        r.addColorStop(0, `rgba(240,238,232,${0.05 + rnd() * 0.12})`); r.addColorStop(1, 'rgba(240,238,232,0)');
        g.fillStyle = r; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      }
    }
  });
}
function boardTexture(accent) {
  return canvasTexture(2048, 320, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(80, 150, 8, 70);
    g.fillStyle = '#ffffff'; g.font = '700 120px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
    g.fillText('ATLAS STONES', 120, 215);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '500 54px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
    g.fillText('FLYWHEEL STRONGMAN · 5 STONES · 700 KG', 1050, 200);
    g.globalCompositeOperation = 'multiply';                 // LED pixel grid
    for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 2, h); }
    for (let y = 0; y < h; y += 6) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 2); }
  });
}

// ---------- geometry helpers
function iBeam(len, h = 0.26, b = 0.16, tf = 0.018, tw = 0.011) {
  const s = new THREE.Shape();
  s.moveTo(-b / 2, -h / 2); s.lineTo(b / 2, -h / 2); s.lineTo(b / 2, -h / 2 + tf); s.lineTo(tw / 2, -h / 2 + tf);
  s.lineTo(tw / 2, h / 2 - tf); s.lineTo(b / 2, h / 2 - tf); s.lineTo(b / 2, h / 2); s.lineTo(-b / 2, h / 2);
  s.lineTo(-b / 2, h / 2 - tf); s.lineTo(-tw / 2, h / 2 - tf); s.lineTo(-tw / 2, -h / 2 + tf); s.lineTo(-b / 2, -h / 2 + tf); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  g.translate(0, 0, -len / 2);
  return g;
}
function beamBetween(a, b, size, mat) {   // square hollow section from point a to point b
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.RoundedBoxGeometry(size, len, size, 2, 0.006), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = m.receiveShadow = true;
  return m;
}
// ---------- the stage
export function createStage({ renderer, envMap, accent = '#00e5ff', maxShadow = 2048 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060708);
  scene.fog = new THREE.FogExp2(0x060708, 0.055);
  scene.environment = envMap;
  scene.environmentIntensity = 0.22;

  // materials
  const floorMaps = rubberFloorMaps();
  for (const t of Object.values(floorMaps)) t.repeat.set(14, 14);
  const floorMat = new THREE.MeshStandardMaterial({ ...floorMaps, bumpScale: 0.6, color: 0xffffff, metalness: 0 });
  const steelPaint = new THREE.MeshStandardMaterial({ color: 0x2e3135, metalness: 0.6, roughness: 0.42 });
  const rubberPad = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.92 });
  const ply = new THREE.MeshStandardMaterial({ ...plywoodMaps(), roughness: 0.78 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe3a400, metalness: 0.25, roughness: 0.42 });
  const hoistGrey = new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.5, roughness: 0.4 });
  const galv = new THREE.MeshStandardMaterial({ color: 0x9a9da1, metalness: 1, roughness: 0.32 });
  const forged = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.85, roughness: 0.38 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x55544f, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(accent), emissiveIntensity: 1.4 });
  const STAIN = [0.4, 0.72, 0.86, 0.18, 0.55];                    // how weathered each stone is (as in real sets)

  // floor + tape lines
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const addTape = (w, d, x, z) => { const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tape); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.002, z); t.receiveShadow = true; scene.add(t); };
  addTape(9.4, 0.05, 0, 1.75);                                   // start line
  for (let i = 0; i <= LANES.length; i++) addTape(0.03, 2.4, -4.0 + i * 1.6, 0.5);   // lane lines

  const decal = (tex, size, x, y, z, rot = 0, opacity = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y, z); scene.add(m); return m;
  };
  const shadowTex = decalTexture('shadow'), chalkTex = [decalTexture('chalk', 1), decalTexture('chalk', 2), decalTexture('chalk', 3)];

  // platforms
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x161617, metalness: 0, roughness: 0.88 });
  function seatGeoFor(r) {   // lathe profile: flat base, rounded outer lip, top surface following the stone (+ sink)
    const SEAT_A = seatA(r), SEAT_OUT = seatOut(r);
    const yc = SEAT_MIN + Math.sqrt(r * r - SEAT_A * SEAT_A);                          // stone centre, relative to platform top
    const top = (rho) => yc - Math.sqrt(r * r - rho * rho);                              // stone underside at radius rho
    const pts = [new THREE.Vector2(SEAT_A, 0), new THREE.Vector2(SEAT_OUT - 0.006, 0), new THREE.Vector2(SEAT_OUT, 0.006)];
    const hOut = top(SEAT_OUT - 0.006) + 0.0005;
    pts.push(new THREE.Vector2(SEAT_OUT, hOut - 0.005), new THREE.Vector2(SEAT_OUT - 0.002, hOut - 0.001), new THREE.Vector2(SEAT_OUT - 0.006, hOut));
    for (let k = 1; k <= 16; k++) { const rho = SEAT_OUT - 0.006 - (k / 16) * (SEAT_OUT - 0.006 - SEAT_A); pts.push(new THREE.Vector2(rho, top(rho) + 0.0005)); }
    pts.push(new THREE.Vector2(SEAT_A, 0));
    return new THREE.LatheGeometry(pts, 96);
  }
  const platforms = LANES.map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 0, 0); scene.add(g);
    const W = platW(stoneRadius(STONE_MASSES[i]));
    const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(W, PLATFORM_H - 0.03, W, 3, 0.015), steelPaint);
    body.position.set(0, (PLATFORM_H - 0.03) / 2, 0); body.castShadow = body.receiveShadow = true; g.add(body);
    const pad = new THREE.Mesh(new THREE.RoundedBoxGeometry(W + 0.04, 0.03, W + 0.04, 2, 0.004), ply);
    pad.position.set(0, PLATFORM_H - 0.015, 0); pad.castShadow = pad.receiveShadow = true; g.add(pad);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2125), new THREE.MeshStandardMaterial({ map: plateTexture(i + 1, STONE_MASSES[i]), roughness: 0.5, metalness: 0.2 }));
    plate.position.set(0, 0.92, W / 2 + 0.001); g.add(plate);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.006), accentMat);
    strip.position.set(0, 0.06, W / 2 + 0.002); g.add(strip);
    const seat = new THREE.Mesh(seatGeoFor(stoneRadius(STONE_MASSES[i])), seatMat); seat.position.set(0, PLATFORM_H, 0); seat.castShadow = seat.receiveShadow = true; g.add(seat);
    decal(shadowTex, W * 2, x, 0.003, 0.02, 0, 0.9);
    decal(chalkTex[i % 3], 1.1, x + 0.05, 0.004, START_Z - 0.05, i * 1.3, 0.13);
    return g;
  });

  // stones
  const contactTex = contactShadowTexture(), detailTex = stoneDetailMap();
  const stones = STONE_MASSES.map((m, i) => {
    const r = stoneRadius(m);
    const mat = new THREE.MeshStandardMaterial({ ...stoneMaps(31 + i * 7, STAIN[i]), bumpScale: 2.4, metalness: 0, vertexColors: true });
    const ao = groundAO(mat, { range: r * 0.75, min: 0.3 });
    const rep = Math.round((r / 0.24) * 9);
    detailLayer(mat, detailTex, [rep * 2, rep], { albedo: 0.5, bump: 0.9 });
    const mesh = new THREE.Mesh(chippedSphere(r, 101 + i * 13), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.rotation.set(0, i * 2.3 + 0.6, 0);                       // spin only: keep the texture poles top (grazing) and bottom (seated)
    scene.add(mesh);
    const contact = decal(contactTex, r * 2.5, 0, 0, 0, 0, 0.95);
    return { mass: m, r, mesh, contact, ao, lane: LANES[i] };
  });

  // overhead bridge crane: two runway beams along x (columns only at the far ends), a bridge girder
  // that travels to each lane, and an electric chain hoist that rides the bridge in z.
  const TOP = 3.75, FRONT_Z = 1.9, BACK_Z = -1.1, SPAN_X = 5.3;
  for (const z of [FRONT_Z, BACK_Z]) {
    const rw = new THREE.Mesh(iBeam(SPAN_X * 2 + 0.4, 0.3, 0.17), yellow); rw.rotation.y = Math.PI / 2; rw.position.set(0, TOP + 0.3, z);
    rw.castShadow = rw.receiveShadow = true; scene.add(rw);
    for (const x of [-SPAN_X, SPAN_X]) {
      const col = new THREE.Mesh(iBeam(TOP + 0.15, 0.24, 0.2), yellow); col.rotation.x = Math.PI / 2; col.position.set(x, (TOP + 0.15) / 2, z);
      col.castShadow = col.receiveShadow = true; scene.add(col);
      const base = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.42, 0.03, 0.42, 2, 0.006), steelPaint); base.position.set(x, 0.015, z); base.receiveShadow = true; scene.add(base);
      scene.add(beamBetween(new THREE.Vector3(x, TOP - 0.55, z), new THREE.Vector3(x - Math.sign(x) * 0.6, TOP + 0.15, z), 0.07, yellow));
    }
  }
  const gantry = new THREE.Group(); scene.add(gantry);          // the bridge: moves in x
  const bridge = new THREE.Mesh(iBeam(FRONT_Z - BACK_Z + 0.5, 0.34, 0.18), yellow);
  bridge.position.set(0, TOP + 0.62, (FRONT_Z + BACK_Z) / 2); bridge.castShadow = bridge.receiveShadow = true; gantry.add(bridge);
  for (const z of [FRONT_Z, BACK_Z]) {
    const truck = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.62, 0.16, 0.28, 2, 0.02), yellow); truck.position.set(0, TOP + 0.52, z); truck.castShadow = true; gantry.add(truck);
  }
  const hoist = new THREE.Group(); gantry.add(hoist);             // the hoist: moves in z along the bridge
  const trolley = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.24, 0.08, 0.26, 2, 0.01), hoistGrey); trolley.position.y = TOP + 0.41; hoist.add(trolley);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.028, 20), forged); w.rotation.z = Math.PI / 2; w.position.set(sx * 0.07, TOP + 0.46, sz * 0.085); hoist.add(w);
  }
  const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.26, 0.32, 0.22, 3, 0.035), yellow); body.position.y = TOP + 0.18; hoist.add(body);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 32), hoistGrey); motor.rotation.z = Math.PI / 2; motor.position.set(0.22, TOP + 0.16, 0); hoist.add(motor);
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 32), hoistGrey); gear.rotation.z = Math.PI / 2; gear.position.set(-0.155, TOP + 0.18, 0); hoist.add(gear);
  hoist.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  const CHAIN_TOP = TOP + 0.01;

  // chain (instanced links) and the hydraulic grab — posed by setRig()
  const LINK_PITCH = 0.0235, MAX_LINKS = 160;
  const linkGeo = new THREE.TorusGeometry(0.0105, 0.0033, 8, 18); linkGeo.scale(1, 1.6, 1);
  const chain = new THREE.InstancedMesh(linkGeo, galv, MAX_LINKS); chain.castShadow = true; gantry.add(chain);

  // Four-tine stone grab. Local origin = chain eye; y down the ram to the head; tines hinge on a ring below the
  // head and swing outward (open) or close until they touch the stone. Geometry solved so the same grab fits
  // every stone: open clears the largest by 11 cm, closed tips tuck under the smallest by 4 cm.
  const GRAB = { HR: 0.32, HINGE_Y: -0.24, PAD_T: 0.02, RT: 0.5, A: 1.2, TUBE: 0.02, OPEN: 1.05 };
  const HEAD = GRAB.PAD_T - GRAB.HINGE_Y;                          // chain eye → stone top (0.27 m)
  const tineSteel = new THREE.MeshStandardMaterial({ color: 0x6b6e73, metalness: 0.85, roughness: 0.42 });
  const hook = new THREE.Group(); gantry.add(hook);
  {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 10, 24), forged); hook.add(eye);
    const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.13, 20), forged); ram.position.y = -0.09; hook.add(ram);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.1, 40), yellow); body.position.y = -0.19; hook.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(GRAB.HR, 0.022, 12, 56), forged); ring.rotation.x = Math.PI / 2; ring.position.y = GRAB.HINGE_Y; hook.add(ring);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 32), rubberPad); pad.position.y = GRAB.HINGE_Y - GRAB.PAD_T + 0.025; hook.add(pad);
    for (let k = 0; k < 4; k++) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.05), yellow); const a = k * Math.PI / 2 + Math.PI / 4;
      br.position.set(Math.cos(a) * 0.26, -0.2, -Math.sin(a) * 0.26); br.rotation.y = a; hook.add(br);
    }
  }
  // tine profile in its pivot frame (x outward, y up), hinge at the origin
  const tineCurve = (() => { const pts = []; for (let i = 0; i <= 24; i++) { const a = GRAB.A * i / 24; pts.push(new THREE.Vector3(-GRAB.RT + GRAB.RT * Math.cos(a), -GRAB.RT * Math.sin(a), 0)); } return new THREE.CatmullRomCurve3(pts); })();
  const tineGeo = new THREE.TubeGeometry(tineCurve, 48, GRAB.TUBE, 12, false);
  const tineTip = tineCurve.getPoint(1);
  const tines = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, arm = new THREE.Group();
    arm.position.set(Math.cos(a) * GRAB.HR, GRAB.HINGE_Y, -Math.sin(a) * GRAB.HR); arm.rotation.y = a;   // local +x points outward
    const pivot = new THREE.Group(); arm.add(pivot);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 14), forged); pin.rotation.x = Math.PI / 2; pivot.add(pin);
    const tube = new THREE.Mesh(tineGeo, tineSteel); pivot.add(tube);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 18, 14), rubberPad); tip.position.copy(tineTip); pivot.add(tip);
    hook.add(arm); tines.push(pivot);
  }
  hook.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  /** Tine angle at which the grab just touches a stone of radius r (solved once per stone, cached). */
  function closedAngle(st) {
    if (st.clawAngle != null) return st.clawAngle;
    const c = [-GRAB.HR, -(GRAB.PAD_T + st.r)], samples = tineCurve.getPoints(60);
    const minD = (phi) => { let m = 1e9; for (const p of samples) { const u = p.x * Math.cos(phi) - p.y * Math.sin(phi), y = p.x * Math.sin(phi) + p.y * Math.cos(phi); m = Math.min(m, Math.hypot(u - c[0], y - c[1])); } return m; };
    let lo = -0.8, hi = 1.3; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (minD(m) - (st.r + GRAB.TUBE + 0.003) > 0) hi = m; else lo = m; }
    return (st.clawAngle = (lo + hi) / 2);
  }
  const _top = new THREE.Vector3(), _ht = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
  const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0), TW = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2);

  /**
   * Pose the crane. bridgeX: bridge position; hoistZ: hoist along the bridge; hook: chain-eye position of the grab
   * (bridge-local, may swing away from under the hoist); target: the stone the grab is working (sets its closed
   * angle); grip: 0 open → 1 closed; thrum: chain vibration amplitude under load; winding: hoist motor running
   * (0–1); time: seconds (for vibration).
   */
  function setRig({ bridgeX, hoistZ, hook: hk, target = null, grip = 0, thrum = 0, winding = 0, time = 0 }) {
    gantry.position.x = bridgeX; hoist.position.z = hoistZ;
    hoist.position.y = winding * (Math.sin(time * 93) * 0.0011 + Math.sin(time * 57.3) * 0.0007);
    _top.set(0, CHAIN_TOP + hoist.position.y, hoistZ); _ht.set(hk.x, hk.y + 0.02, hk.z);
    _d.subVectors(_ht, _top); const len = _d.length(); _d.normalize();
    _q.setFromUnitVectors(DOWN, _d);
    const n = Math.min(MAX_LINKS, Math.floor(len / LINK_PITCH));
    for (let i = 0; i < MAX_LINKS; i++) {
      if (i < n) {
        const sN = i / Math.max(1, n), wob = thrum * Math.sin(Math.PI * sN) * Math.sin(time * 47 + sN * 9);
        _p.copy(_top).addScaledVector(_d, i * LINK_PITCH); _p.x += wob;
        const q = i % 2 ? _q.clone().multiply(TW) : _q;
        _m4.compose(_p, q, _one);
      } else _m4.makeScale(0, 0, 0);
      chain.setMatrixAt(i, _m4);
    }
    chain.instanceMatrix.needsUpdate = true;
    hook.position.copy(hk); hook.quaternion.copy(_q);
    const closed = target ? closedAngle(target) : 0.3;
    const phi = GRAB.OPEN + (closed - GRAB.OPEN) * grip;
    for (const t of tines) t.rotation.z = phi;
  }
  /** Grab geometry: chain-eye height for a stone held with its center at y. */
  const hookYFor = (st, centerY) => centerY + st.r + HEAD;

  const supportAt = (st, x, z) => { const h = platW(st.r) / 2 + 0.02; return Math.abs(x - st.lane) < h && Math.abs(z) < h ? PLATFORM_H : 0; };
  /** Pose a stone by its center; contact shading and the contact shadow follow the gap to the support below. */
  function poseStone(i, x, y, z, quat = null, supportOffset = null) {
    const st = stones[i]; st.mesh.position.set(x, y, z); if (quat) st.mesh.quaternion.copy(quat);
    const support = supportAt(st, x, z), gap = Math.max(0, y - st.r - support);
    st.ao.uGroundY.value = support;
    const k = Math.max(0, 1 - gap / (st.r * 1.8));
    st.contact.visible = k > 0.01;
    st.contact.position.set(x + (supportOffset?.x || 0), support + 0.004 + (supportOffset?.y || 0), z);
    st.contact.scale.setScalar(1 + (gap / st.r) * 1.6);
    st.contact.material.opacity = 0.95 * k * k;
  }
  /** Static placement used by stills: 'floor' | 'platform' | 'air' (bottom height y). Rests sink 2 mm. */
  function placeStone(i, where, y = 0) {
    const st = stones[i];
    if (where === 'platform') poseStone(i, st.lane, seatY(st.r), 0);
    else if (where === 'air') poseStone(i, st.lane, y + st.r, START_Z);
    else poseStone(i, st.lane, st.r - 0.002, START_Z);
  }

  // ---------- arena: back wall, LED board, lighting truss
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.95 }));
  wall.position.set(0, 6, -7.5); wall.receiveShadow = true; scene.add(wall);
  const washTex = canvasTexture(512, 256, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.55);
    r.addColorStop(0, 'rgba(110,112,120,0.34)'); r.addColorStop(0.5, 'rgba(60,62,70,0.1)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(22, 7), new THREE.MeshBasicMaterial({ map: washTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  wash.position.set(0.5, 3.5, -7.4); scene.add(wash);
  for (let i = -7; i <= 7; i++) {   // acoustic panel seams
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 12), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 }));
    seam.position.set(i * 1.8, 6, -7.48); scene.add(seam);
  }

  const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, metalness: 0.7, roughness: 0.45 });
  const lampLens = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0xfff2dd), emissiveIntensity: 1.1 });
  const lampBody = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.6, roughness: 0.5 });
  function truss(z, y, len) {
    const g = new THREE.Group(), s = 0.3;
    for (const [dy, dz] of [[0, 0], [0, s], [s, 0], [s, s]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, len, 10), trussMat); c.rotation.z = Math.PI / 2; c.position.set(0, y + dy, z + dz); g.add(c);
    }
    for (let x = -len / 2; x < len / 2; x += 0.3) for (const [a, b] of [[[0, 0], [s, 0]], [[0, s], [s, s]], [[0, 0], [0, s]], [[s, 0], [s, s]]]) {
      g.add(beamBetween(new THREE.Vector3(x, y + a[0], z + a[1]), new THREE.Vector3(x + 0.3, y + b[0], z + b[1]), 0.018, trussMat));
    }
    return g;
  }
  scene.add(truss(-4.2, 5.4, 14));
  for (let i = 0; i < 7; i++) {   // lamp heads on the back truss, aimed at the stage
    const lamp = new THREE.Group(); lamp.position.set(-4.5 + i * 1.5, 5.2, -4.05);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 28), lampBody); can.rotation.x = Math.PI / 2; lamp.add(can);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), i % 3 === 1 ? lampLens : new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2dd, emissiveIntensity: 0.25 }));
    lens.position.z = 0.151; lamp.add(lens);
    lamp.lookAt(0, 0.5, 1); scene.add(lamp);
  }

  // lights
  const key = new THREE.SpotLight(0xffeedd, 380, 0, 0.34, 0.6, 2);
  key.position.set(0.9, 6.4, 2.9); key.target.position.set(0, 0.9, 0.45);
  key.castShadow = true; key.shadow.mapSize.set(maxShadow, maxShadow); key.shadow.bias = -0.00012; key.shadow.normalBias = 0.006; key.shadow.radius = 3;
  key.shadow.camera.near = 2; key.shadow.camera.far = 12;
  scene.add(key, key.target);
  for (const x of [-3.2, -1.6, 1.6, 3.2]) {
    const s = new THREE.SpotLight(0xffeedd, 55, 0, 0.3, 0.75, 2); s.position.set(x * 1.05, 6.2, 2.2); s.target.position.set(x, 0.8, 0.3); scene.add(s, s.target);
  }
  for (const x of [-3.4, 3.6]) {
    const rim = new THREE.SpotLight(0xc9d8ff, 200, 0, 0.45, 0.8, 2); rim.position.set(x, 4.8, -3.8); rim.target.position.set(0, 1.2, 0.6); scene.add(rim, rim.target);
    const cone = lightCone({ height: 7.2, radius: 2.1, color: 0xb4c6ec, intensity: 0.04 });
    cone.position.copy(rim.position); cone.lookAt(rim.target.position); cone.rotateX(-Math.PI / 2); scene.add(cone);
  }
  scene.add(new THREE.HemisphereLight(0x9a9a9a, 0x0a0a0a, 0.1));
  const keyCone = lightCone({ height: 6.6, radius: 2.2, color: 0xfff0dc, intensity: 0.045 });
  keyCone.position.copy(key.position); keyCone.lookAt(key.target.position); keyCone.rotateX(-Math.PI / 2); scene.add(keyCone);

  // atmosphere: dust motes drifting in the key light; chalk dust bursts (dustBurst)
  const dotTex = softDot();
  const rnd = rng(42), motes = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const t = rnd(), a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (0.15 + t * 1.6);
    motes[i * 3] = 0.9 - t * 0.9 + Math.cos(a) * rr; motes[i * 3 + 1] = 6.2 - t * 5.4; motes[i * 3 + 2] = 2.9 - t * 2.4 + Math.sin(a) * rr;
  }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  const motePts = new THREE.Points(moteGeo, new THREE.PointsMaterial({ size: 0.011, map: dotTex, color: 0xfff3e0, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(motePts);
  const dust = createParticles({ max: 320, texture: dotTex, color: 0xe6e2da, drag: 2.8, gravity: -0.04 });
  scene.add(dust.points);
  /** Chalk burst along the contact ring at point c (support height y), strength 0–1. */
  function dustBurst(c, y, radius, strength = 1, n = 46) {
    dust.emit(Math.round(n * (0.5 + 0.5 * strength)), (p) => {
      const a = Math.random() * Math.PI * 2, sp = (0.45 + Math.random() * 0.8) * (0.5 + 0.5 * strength);
      p.pos.set(c.x + Math.cos(a) * radius * 0.45, y + 0.005 + Math.random() * 0.015, c.z + Math.sin(a) * radius * 0.45);
      p.vel.set(Math.cos(a) * sp, 0.03 + Math.random() * 0.09, Math.sin(a) * sp);
      p.life = 0.5 + Math.random() * 0.7; p.size0 = 0.025; p.size1 = 0.07 + Math.random() * 0.08; p.alpha = 0.08 + 0.06 * strength;
    });
  }

  // ---------- camera framing that respects aspect ratio
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 60);
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let focusX = 0;
  const cam = { follow: true };
  /** Set a fixed view (disables lane following); shakes are relative to it. */
  function setView(pos, tgt) { cam.follow = false; focusX = 0; camBase.copy(pos); camTarget.copy(tgt); camera.position.copy(pos); camera.lookAt(tgt); }
  /** Pan the camera along the lanes (metres); keeps any active shake. */
  function setFocus(x) { focusX = x; }
  function shakeCamera(dx, dy, dz) {
    camera.position.set(camBase.x + focusX + dx, camBase.y + dy, camBase.z + dz);
    camera.lookAt(camTarget.x + focusX + dx * 0.4, camTarget.y + dy * 0.4, camTarget.z);
  }
  const target = new THREE.Vector3(0, 1.95, 0.2), dir = new THREE.Vector3(-0.4, 0.06, 1).normalize();
  function frame(w, h) {
    const aspect = w / h, portrait = aspect < 1;
    camera.aspect = aspect; camera.fov = portrait ? 46 : 34;
    const halfW = portrait ? 1.6 : 3.55, halfH = portrait ? 2.15 : 2.3;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), th = tv * aspect;
    const d = Math.max(halfW / th, halfH / tv);
    const tgt = portrait ? new THREE.Vector3(0, 1.45, 0.35) : target;
    camera.position.copy(tgt).addScaledVector(dir, d);
    camera.lookAt(tgt);
    camBase.copy(camera.position); camTarget.copy(tgt);
    camera.updateProjectionMatrix();
  }

  function setAccent(hex) {
    accentMat.emissive.set(hex);
  }

  return { scene, camera, cam, frame, setView, setFocus, shakeCamera, stones, platforms, placeStone, poseStone, setRig, hookYFor, dust, dustBurst, setAccent, constants: { TOP, FRONT_Z, BACK_Z, START_Z, CHAIN_TOP } };
}
