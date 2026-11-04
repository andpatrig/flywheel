// screens/stones/screen.js — Atlas Stones as an app screen. Uses the shared engine: real PM5 strokes (or the
// simulator in demo mode) lift the stones. 3D is built lazily on first open and only renders while visible.
import { engine } from '../../core/session.js';

export const id = 'stones';
let el, hudEl, host, gfx, stage, game, built = false, shown = false, raf = 0, last = 0, ro;
let mods = null;

const css = `
#view-stones { position: relative; }
#view-stones .st-host { position: absolute; inset: 0; border-radius: var(--radius); overflow: hidden; background: #060708; }
#view-stones .st-host canvas { display: block; }
#view-stones .st-hud { position: absolute; inset: 0; pointer-events: none; color: #f2f2f0; padding: 1.1rem 1.25rem; display: grid; grid-template-rows: auto 1fr auto;
  text-shadow: 0 1px 12px rgba(0,0,0,0.45); border-radius: var(--radius); overflow: hidden; isolation: isolate; }
#view-stones .st-hud::before, #view-stones .st-hud::after { content: ''; position: absolute; left: 0; right: 0; pointer-events: none; z-index: -1; }
#view-stones .st-hud::before { top: 0; height: 8rem; background: linear-gradient(rgba(4,5,6,0.62), rgba(4,5,6,0)); }
#view-stones .st-hud::after { bottom: 0; height: 6.5rem; background: linear-gradient(rgba(4,5,6,0), rgba(4,5,6,0.55)); }
#view-stones .eyebrow { color: rgba(242,242,240,0.62); }
#view-stones .st-top, #view-stones .st-bottom { display: flex; justify-content: space-between; gap: 1rem; }
#view-stones .st-top { align-items: flex-start; } #view-stones .st-bottom { align-items: flex-end; }
#view-stones .st-top > div:first-child, #view-stones .st-bottom > div:last-child { min-width: 0; }
#view-stones .st-read, #view-stones .st-bar { flex: none; }
#view-stones .st-title, #view-stones .st-sub { overflow: hidden; text-overflow: ellipsis; }
#view-stones .st-title { white-space: nowrap; font-size: 1.15rem; font-weight: 600; margin-top: 0.35rem; letter-spacing: -0.01em; }
#view-stones .st-title span { color: rgba(242,242,240,0.6); font-weight: 500; }
#view-stones .st-read { text-align: right; }
#view-stones .st-big { font-size: clamp(2.2rem, 6.5vw, 4.25rem); font-weight: 500; letter-spacing: -0.035em; line-height: 0.95; color: var(--accent-dark, var(--accent)); }
#view-stones .st-big .u { font-size: 0.34em; color: rgba(242,242,240,0.7); font-weight: 500; letter-spacing: 0; margin-left: 0.15em; }
#view-stones .st-sub { color: rgba(242,242,240,0.62); font-size: 0.85rem; margin-top: 0.35rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
#view-stones .st-gain { color: var(--accent-dark, var(--accent)); }
#view-stones .st-bar { display: flex; gap: 6px; align-items: flex-end; }
#view-stones .st-bar .s { width: 2.5rem; }
#view-stones .st-bar .track { height: 3px; border-radius: 0; background: rgba(255,255,255,0.18); overflow: hidden; }
#view-stones .st-bar .fill { height: 100%; width: 0; background: var(--accent-dark, var(--accent)); }
#view-stones .st-bar .kg { font-family: var(--mono); font-size: 0.7rem; color: rgba(242,242,240,0.55); margin-top: 6px; font-variant-numeric: tabular-nums; }
#view-stones .st-bar .s.cur .kg { color: #f2f2f0; }
#view-stones .st-stat { text-align: right; }
#view-stones .st-stat .v { font-size: 1.6rem; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
#view-stones .st-center { align-self: center; justify-self: center; text-align: center; pointer-events: auto; }
#view-stones .st-center .msg { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.4rem; }
#view-stones .st-center .hint { color: rgba(242,242,240,0.65); font-size: 0.88rem; margin-bottom: 1rem; }
#view-stones .st-loading { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(242,242,240,0.6); font-size: 0.9rem; }
@media (max-width: 560px) { #view-stones .st-hud { padding: 0.9rem 1rem; } #view-stones .st-title { font-size: 1rem; } #view-stones .st-bar .s { width: 1.8rem; } #view-stones .st-bar { gap: 4px; } #view-stones .st-stat .v { font-size: 1.25rem; } #view-stones .wide-only { display: none; } }
`;

export function mount(container, app) {
  el = container;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  el.innerHTML = `
    <div class="st-host"><div class="st-loading">Building the arena…</div></div>
    <div class="st-hud">
      <div class="st-top">
        <div><div class="eyebrow">Atlas stones</div><div class="st-title" id="stTitle">Stone 1</div></div>
        <div class="st-read"><div class="st-big num" id="stBig">0.00<span class="u">m</span></div><div class="st-sub" id="stSub">of 1.30 m</div></div>
      </div>
      <div class="st-center" id="stCenter" hidden>
        <div class="msg" id="stMsg"></div><div class="hint" id="stHint"></div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="stAction"></button></div>
      </div>
      <div class="st-bottom">
        <div class="st-bar" id="stBar"></div>
        <div class="st-stat"><div class="v" id="stTime">0:00.0</div><div class="st-sub" id="stTotal">0.0 kJ rowed</div></div>
      </div>
    </div>`;
  host = el.querySelector('.st-host'); hudEl = el.querySelector('.st-hud');
  el.querySelector('#stAction').onclick = () => {
    if (!engine.connected) { if (engine.supported) document.getElementById('connectBtn').click(); else app.startDemo({ stay: true }); return; }
    restart();
  };
  engine.on('stroke', ({ stroke }) => { if (game && engine.connected) game.onStroke(stroke.workPerStroke, stroke.driveTime); });
  engine.on('conn', () => updateCenter());
}

async function build() {
  built = true;
  mods = await Promise.all([import('../../core/gfx.js'), import('./stage.js'), import('./game.js')]);
  const [{ createRenderer, roomEnvironment }, stageMod] = mods;
  await new Promise((r) => setTimeout(r, 30));                                    // let "Building…" paint first
  // the arena is always lit for night: use the dark (neon) accent variant whatever the app theme
  const p = (() => { try { return JSON.parse(localStorage.getItem('flywheel.prefs') || '{}'); } catch { return {}; } })();
  const accent = (window.FW_ACCENTS[p.accent] || window.FW_ACCENTS.cyan).d;
  el.style.setProperty('--accent-dark', accent);
  gfx = createRenderer(host, { quality: 'high' });
  stage = stageMod.createStage({ renderer: gfx.renderer, envMap: roomEnvironment(gfx.renderer), accent, maxShadow: gfx.maxShadow });
  host.querySelector('.st-loading')?.remove();
  ro = new ResizeObserver(resize); ro.observe(host); resize();
  restart();
  if (shown) loop(performance.now());
}
function restart() {
  const [, stageMod, gameMod] = mods;
  if (game) { stageMod.STONE_MASSES.forEach((_, i) => stage.placeStone(i, 'floor')); }
  game = gameMod.createStonesGame(stage);
  el.querySelector('#stBar').innerHTML = stageMod.STONE_MASSES.map((m) => `<div class="s"><div class="track"><div class="fill"></div></div><div class="kg">${m}</div></div>`).join('');
  updateCenter();
}
function resize() { if (!gfx) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; gfx.setSize(w, h); stage.frame(w, h); }

function updateCenter() {
  if (!el) return;
  const c = el.querySelector('#stCenter'), st = game?.state();
  let msg = '', hint = '', action = '';
  if (!engine.connected) { msg = 'Connect your PM5 to start'; hint = engine.supported ? 'Every stroke lifts the stone by exactly work ÷ (m·g).' : 'No Bluetooth here — try it with the simulated erg.'; action = engine.supported ? 'Connect' : 'Try demo'; }
  else if (st?.finished) { msg = `All five loaded in ${fmt(st.time)}`; hint = `${(st.total / 1000).toFixed(1)} kJ rowed`; action = 'Go again'; }
  else if (st && !st.time && !st.total) { msg = ''; }
  c.hidden = !msg;
  if (msg) { el.querySelector('#stMsg').textContent = msg; el.querySelector('#stHint').textContent = hint; el.querySelector('#stAction').textContent = action; }
}
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function hud() {
  const [, stageMod] = mods, st = game.state(), $ = (s) => el.querySelector(s);
  const total = stageMod.STONE_MASSES.reduce((a, b) => a + b, 0);
  $('#stTitle').innerHTML = st.finished ? `All five <span>· ${total.toLocaleString()} kg loaded</span>` : `Stone ${st.index + 1} <span>of 5 · ${st.mass} kg</span>`;
  $('#stBig').innerHTML = `${st.height.toFixed(2)}<span class="u">m</span>`;
  $('#stSub').innerHTML = `of ${stageMod.PLATFORM_H.toFixed(2)} m${st.lastGain ? ` · <span class="st-gain">+${st.lastGain.toFixed(2)} m</span><span class="wide-only"> last stroke</span>` : ''}`;
  el.querySelectorAll('#stBar .s').forEach((b, i) => { b.querySelector('.fill').style.width = (st.progress[i] * 100).toFixed(0) + '%'; b.classList.toggle('cur', i === st.index); });
  $('#stTime').textContent = fmt(st.time);
  $('#stTotal').innerHTML = `${(st.total / 1000).toFixed(1)} kJ<span class="wide-only"> rowed</span>${st.bank > 30 ? `<span class="wide-only"> · ${Math.round(st.bank)} J banked</span>` : ''}`;
  if (st.finished !== hud._fin) { hud._fin = st.finished; updateCenter(); }
}
function loop(now) {
  if (!shown || !game) return;
  // physics keeps real time whatever the frame rate: fixed sub-steps, at most 0.5 s caught up per frame
  let acc = Math.min(0.5, (now - last) / 1000 || 0); last = now;
  while (acc > 1e-4) { const step = Math.min(1 / 30, acc); game.update(step, gfx.renderer.domElement.height); acc -= step; }
  hud();
  gfx.render(stage.scene, stage.camera, now / 1000);
  raf = requestAnimationFrame(loop);
}

export function show() {
  shown = true; last = performance.now();
  if (!built) build(); else { resize(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
  updateCenter();
}
export function hide() { shown = false; cancelAnimationFrame(raf); }
