// core/gfx.js — shared 3D foundation for every game screen: renderer, post-processing chain,
// procedural texture helpers, and seeded randomness. Scenes build on this; nothing here is scene-specific.
import * as THREE from '../vendor/three-0.187.0.bundle.min.js';
export { THREE };

/** Deterministic PRNG (mulberry32) so procedural scenes look identical on every load. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Fractal noise (fBm) over three.js SimplexNoise. */
export function fbm(noise, x, y, z, octaves = 4, lac = 2.0, gain = 0.5) {
  let amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * noise.noise3d(x * f, y * f, z * f); f *= lac; amp *= gain; }
  return sum;   // ≈ [-1, 1]
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Per-pixel texture painter. fn(u, v, out) writes out = [r, g, b] in 0..255 for each map requested. */
export function paint(w, h, maps, fn) {
  const canv = {}, img = {};
  for (const m of maps) { const c = document.createElement('canvas'); c.width = w; c.height = h; canv[m] = c; img[m] = c.getContext('2d').createImageData(w, h); }
  const out = Object.fromEntries(maps.map((m) => [m, [0, 0, 0]]));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    fn((x + 0.5) / w, (y + 0.5) / h, out);
    const i = (y * w + x) * 4;
    for (const m of maps) { const d = img[m].data, o = out[m]; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255; }
  }
  const tex = {};
  for (const m of maps) {
    canv[m].getContext('2d').putImageData(img[m], 0, 0);
    const t = new THREE.CanvasTexture(canv[m]);
    t.colorSpace = m === 'map' || m === 'emissiveMap' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    tex[m] = t;
  }
  return tex;
}

/** Canvas-drawn texture (labels, decals, sprites). */
export function canvasTexture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  return t;
}

/** Soft round sprite for particles. */
export function softDot(size = 64) {
  return canvasTexture(size, size, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

/** Vignette + fine film grain — the last touch that makes CG read as photographed. */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, grain: { value: 0.035 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette, grain, time; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5; float v = 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.0, 0.85)) * 1.25);
      c.rgb *= v;
      c.rgb += (hash(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = c;
    }`,
};

/**
 * Renderer + composer with the house look: filmic tone mapping, soft shadows, restrained bloom,
 * vignette/grain, SMAA. `quality` scales pixel ratio and shadow resolution for phones.
 */
export function createRenderer(canvasParent, { quality = 'high', bloom = { strength: 0.2, radius: 0.5, threshold: 0.92 } } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const maxDpr = quality === 'high' ? 2 : 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvasParent.appendChild(renderer.domElement);

  const composer = new THREE.EffectComposer(renderer);
  const renderPass = new THREE.RenderPass(null, null);
  const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), bloom.strength, bloom.radius, bloom.threshold);
  const outputPass = new THREE.OutputPass();
  const finishPass = new THREE.ShaderPass(FinishShader);
  const smaaPass = new THREE.SMAAPass();
  composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(outputPass); composer.addPass(finishPass); composer.addPass(smaaPass);

  function setSize(w, h) { renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; composer.setSize(w, h); }
  function render(scene, camera, t = 0) { renderPass.scene = scene; renderPass.camera = camera; finishPass.uniforms.time.value = t % 10; composer.render(); }
  return { renderer, composer, bloomPass, finishPass, setSize, render, maxShadow: quality === 'high' ? 2048 : 1024 };
}

/** Studio-style image-based lighting generated in code (no HDRI download). */
export function roomEnvironment(renderer, sigma = 0.04) {
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(new THREE.RoomEnvironment(), sigma).texture;
  pm.dispose();
  return tex;
}

/** Fake volumetric light cone (additive, view-angle faded) for haze around spotlights. */
export function lightCone({ height = 6, radius = 2, color = 0xfff1dc, intensity = 0.06 }) {
  const geo = new THREE.CylinderGeometry(0.06, radius, height, 48, 1, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity }, height: { value: height } },
    vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ vH = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float intensity, height; varying float vH; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float fall = pow(1.0 - clamp(vH / height, 0.0, 1.0), 1.4);
        gl_FragColor = vec4(color * intensity * edge * (0.35 + fall), 1.0); }`,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Ground-contact shading: darkens a surface as it approaches the surface supporting it, so objects sit
 * *in* their shadow instead of floating. Returns uniforms; set .uGroundY.value to the support height each frame.
 */
export function groundAO(material, { range = 0.2, min = 0.32 } = {}) {
  const u = { uGroundY: { value: 0 }, uAORange: { value: range }, uAOMin: { value: min } };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uGroundY, uAORange, uAOMin;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= mix(uAOMin, 1.0, smoothstep(0.0, uAORange, vWPos.y - uGroundY));\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'groundAO';
  return u;
}

/** Two-layer contact shadow: a tight dark core where things touch + a wide soft falloff. */
export function contactShadowTexture() {
  return canvasTexture(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.92)'); r.addColorStop(0.1, 'rgba(0,0,0,0.78)'); r.addColorStop(0.24, 'rgba(0,0,0,0.42)');
    r.addColorStop(0.5, 'rgba(0,0,0,0.14)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

/**
 * Particle system with per-particle world size, fade and drag (dust, chalk, smoke).
 * emit(n, init) where init(p) sets p.pos, p.vel, p.life, p.size0, p.size1, p.alpha.
 * Call update(dt, camera, viewportHeightPx) every frame.
 */
export function createParticles({ max = 300, texture, color = 0xffffff, blending = THREE.NormalBlending, drag = 2.2, gravity = -0.25 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, color: { value: new THREE.Color(color) }, scale: { value: 500 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float scale;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA); }`,
    transparent: true, depthWrite: false, blending,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  const P = Array.from({ length: max }, () => ({ live: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size0: 0.1, size1: 0.3, alpha: 0.2 }));
  let cursor = 0;
  function emit(n, init) {
    for (let k = 0; k < n; k++) {
      const p = P[cursor]; cursor = (cursor + 1) % max;
      p.live = true; p.age = 0; init(p);
    }
  }
  function update(dt, camera, viewportH) {
    mat.uniforms.scale.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < max; i++) {
      const p = P[i];
      if (p.live) {
        p.age += dt;
        if (p.age >= p.life) p.live = false;
        else { p.vel.multiplyScalar(k); p.vel.y += gravity * dt; p.pos.addScaledVector(p.vel, dt); }
      }
      if (!p.live) { size[i] = 0; alpha[i] = 0; continue; }
      const t = p.age / p.life, fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      pos[i * 3] = p.pos.x; pos[i * 3 + 1] = p.pos.y; pos[i * 3 + 2] = p.pos.z;
      size[i] = p.size0 + (p.size1 - p.size0) * Math.sqrt(t); alpha[i] = p.alpha * fade;
    }
    geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
  }
  return { points, emit, update };
}

/**
 * Detail layer: a small tiling texture (R = albedo modulation around 0.5, G = height) repeated many times over
 * the base UVs and blended into colour and bump. Gives close-up crispness without a huge base texture.
 * Chains with any existing onBeforeCompile (e.g. groundAO).
 */
export function detailLayer(material, tex, repeat = [10, 5], { albedo = 0.55, bump = 0.6 } = {}) {
  const prev = material.onBeforeCompile;
  const u = { uDetail: { value: tex }, uDetailRep: { value: new THREE.Vector2(...repeat) }, uDetailAlb: { value: albedo }, uDetailBump: { value: bump } };
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; uniform vec2 uDetailRep; uniform float uDetailAlb, uDetailBump;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 dt = texture2D(uDetail, vMapUv * uDetailRep); diffuseColor.rgb *= mix(1.0, dt.r * 2.0, uDetailAlb); }')
      .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment.replace(/texture2D\( bumpMap, ([^)]*?) \)\.x/g,
        '( texture2D( bumpMap, $1 ).x + uDetailBump * ( texture2D( uDetail, ( $1 ) * uDetailRep ).g - 0.5 ) )'));
  };
  material.customProgramCacheKey = () => 'groundAO+detail';
  return u;
}

/** Interlocking rubber gym tiles: 2 × 2 tiles of 1 m per texture, seams, flecks. Shared by the arenas. */
export function rubberFloorMaps() {
  const noise = new THREE.SimplexNoise({ random: rng(7) }), rnd = rng(11);
  const flecks = new Float32Array(1024 * 1024);
  for (let i = 0; i < 60000; i++) flecks[Math.floor(rnd() * flecks.length)] = 0.4 + rnd() * 0.6;
  // texture covers 2 × 2 tiles of 1 m
  return paint(1024, 1024, ['map', 'roughnessMap', 'bumpMap'], (u, v, o) => {
    const fx = (u * 2) % 1, fy = (v * 2) % 1, seam = Math.min(fx, 1 - fx, fy, 1 - fy);
    const s = smooth(0.0, 0.004, seam);                                   // 0 at seam
    const tile = Math.floor(u * 2) + Math.floor(v * 2) * 2;
    const n = fbm(noise, u * 9 + tile, v * 9, 0.5, 3), f = flecks[Math.floor(v * 1023) * 1024 + Math.floor(u * 1023)];
    let c = 27 + n * 4 + tile * 0.8 + f * 26;
    c *= 0.55 + 0.45 * s;
    o.map[0] = c; o.map[1] = c; o.map[2] = c * 1.03;
    const r = 195 + n * 20 - f * 25 + (1 - s) * 40; o.roughnessMap[0] = o.roughnessMap[1] = o.roughnessMap[2] = Math.min(255, r);
    const b = 140 + n * 12 + f * 20 - (1 - s) * 110; o.bumpMap[0] = o.bumpMap[1] = o.bumpMap[2] = Math.max(0, b);
  });
}
