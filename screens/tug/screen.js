// screens/tug/screen.js — Tug-of-war app screen. Program a fixed piece on the PM5 (a distance or a time);
// pick an opponent — your last row of that piece, your best, or an even target pace — and row. Each stroke
// yanks the rope toward you; the marker settles at your true lead; whoever is ahead when the piece ends wins.
// The row itself is a normal session, saved by the monitor's own end-of-workout, so files stay comparable.
import { engine } from '../../core/session.js';
import { prefs, setPrefs } from '../../core/theme.js';
import { db } from '../../core/store.js';
import { classify, workoutFromStatus } from '../../core/events.js';
import { fromSession, fromPace, choicesFor } from '../../core/opponent.js';
import { fmtPace, fmtTime, fmtInt } from '../../core/format.js';

export const id = 'tug';
let el, host, hudEl, gfx, stage, game, sfx, mods = null, built = false, shown = false, raf = 0, last = 0, ro;
let mode = 'setup', event = null, choice = { kind: 'pace', pace: 120 }, choices = { last: null, best: null };
let lastStatus = { elapsed: 0, distance: 0, pace: null }, savedFlag = false;

const css = `
#view-tug { position: relative; }
#view-tug .tg-host { position: absolute; top: 0; right: 0; bottom: 0; left: 0; border-radius: var(--radius); overflow: hidden; background: #060708; }
#view-tug .tg-host canvas { display: block; }
#view-tug .tg-hud { position: absolute; top: 0; right: 0; bottom: 0; left: 0; pointer-events: none; color: #f2f2f0; padding: 1.1rem 1.25rem; display: grid; grid-template-rows: auto 1fr auto; text-shadow: 0 1px 12px rgba(0,0,0,0.45); border-radius: var(--radius); overflow: hidden; isolation: isolate; }
#view-tug .tg-hud::before, #view-tug .tg-hud::after { content: ''; position: absolute; left: 0; right: 0; pointer-events: none; z-index: -1; }
#view-tug .tg-hud::before { top: 0; height: 9rem; background: linear-gradient(rgba(4,5,6,0.62), rgba(4,5,6,0)); }
#view-tug .tg-hud::after { bottom: 0; height: 6.5rem; background: linear-gradient(rgba(4,5,6,0), rgba(4,5,6,0.55)); }
#view-tug .eyebrow { color: rgba(242,242,240,0.62); }
#view-tug .tg-top, #view-tug .tg-bottom { display: flex; justify-content: space-between; gap: 1rem; }
#view-tug .tg-top { align-items: flex-start; } #view-tug .tg-bottom { align-items: flex-end; }
#view-tug .tg-top > div:first-child { min-width: 0; }
#view-tug .tg-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.15rem; font-weight: 600; margin-top: 0.35rem; letter-spacing: -0.01em; }
#view-tug .tg-title span { color: rgba(242,242,240,0.6); font-weight: 500; }
#view-tug .tg-lead { text-align: right; flex: none; }
#view-tug .tg-big { font-size: clamp(2.4rem, 7vw, 4.6rem); font-weight: 500; letter-spacing: -0.035em; line-height: 0.95; color: var(--accent-dark, var(--accent)); font-variant-numeric: tabular-nums; }
#view-tug .tg-big.behind { color: #f2f2f0; }
#view-tug .tg-big .u { font-size: 0.34em; color: rgba(242,242,240,0.7); font-weight: 500; letter-spacing: 0; margin-left: 0.15em; }
#view-tug .tg-sub { color: rgba(242,242,240,0.62); font-size: 0.85rem; margin-top: 0.35rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
#view-tug .tg-stat { text-align: right; } #view-tug .tg-stat .v { font-size: 1.6rem; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
#view-tug .tg-left .v { font-size: 1.6rem; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
#view-tug .tg-prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.12); }
#view-tug .tg-prog i { display: block; height: 100%; width: 0; background: var(--accent-dark, var(--accent)); }
#view-tug .tg-center { align-self: center; justify-self: center; text-align: center; pointer-events: auto; max-width: min(92%, 34rem); }
#view-tug .tg-center .msg { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.3rem; }
#view-tug .tg-center .hint { color: rgba(242,242,240,0.68); font-size: 0.88rem; margin-bottom: 1rem; }
#view-tug .tg-card { background: rgba(6,7,8,0.72); border: 1px solid rgba(242,242,240,0.14); padding: 1.1rem 1.2rem; text-align: left; backdrop-filter: blur(6px); }
#view-tug .tg-card .eyebrow { margin-bottom: 0.4rem; }
#view-tug .tg-opts { display: grid; gap: 6px; margin: 0.6rem 0 0.9rem; }
#view-tug .tg-opt { pointer-events: auto; display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid rgba(242,242,240,0.18); background: transparent; color: #f2f2f0; padding: 0.6rem 0.8rem; text-align: left; font: inherit; cursor: pointer; }
#view-tug .tg-opt:disabled { opacity: 0.4; cursor: default; }
#view-tug .tg-opt.on { border-color: var(--accent-dark, var(--accent)); box-shadow: inset 0 0 0 1px var(--accent-dark, var(--accent)); }
#view-tug .tg-opt b { font-weight: 600; } #view-tug .tg-opt small { color: rgba(242,242,240,0.6); font-variant-numeric: tabular-nums; }
#view-tug .tg-step { display: inline-flex; gap: 4px; align-items: center; }
#view-tug .tg-step button { width: 2rem; height: 2rem; border: 1px solid rgba(242,242,240,0.25); background: transparent; color: #f2f2f0; font-size: 1rem; cursor: pointer; }
#view-tug .tg-res { font-size: clamp(2rem, 6vw, 3.4rem); font-weight: 600; letter-spacing: -0.03em; line-height: 1; margin-bottom: 0.4rem; color: var(--accent-dark, var(--accent)); }
#view-tug .tg-res.lost { color: #f2f2f0; }
#view-tug .tg-snd { pointer-events: auto; width: 2.4rem; height: 2.4rem; border: 1px solid rgba(242,242,240,0.22); background: rgba(6,7,8,0.35); color: rgba(242,242,240,0.75); display: grid; place-items: center; cursor: pointer; }
#view-tug .tg-snd svg { width: 1.1rem; height: 1.1rem; } #view-tug .tg-snd .off { display: none; } #view-tug .tg-snd[data-muted="1"] .on { display: none; } #view-tug .tg-snd[data-muted="1"] .off { display: block; }
#view-tug .tg-mid { flex: 1; display: flex; justify-content: center; align-items: flex-end; }
#view-tug .tg-loading { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: grid; place-items: center; color: rgba(242,242,240,0.6); font-size: 0.9rem; }
#view-tug .tg-fail { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: grid; place-items: center; padding: 1.5rem; text-align: center; color: #f2f2f0; }
#view-tug .tg-fail .why { color: rgba(242,242,240,0.65); font-size: 0.85rem; font-family: var(--mono); word-break: break-word; max-width: 36rem; }
@media (max-width: 560px) { #view-tug .tg-hud { padding: 0.9rem 1rem; } #view-tug .tg-title { font-size: 1rem; } #view-tug .tg-stat .v, #view-tug .tg-left .v { font-size: 1.2rem; } #view-tug .wide-only { display: none; } }
`;
const SND = `<svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg><svg class="off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>`;

export function mount(container, app) {
  el = container;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  el.innerHTML = `
    <div class="tg-host"><div class="tg-loading">Laying the rope…</div></div>
    <div class="tg-hud">
      <div class="tg-top">
        <div><div class="eyebrow">Tug of war</div><div class="tg-title" id="tgTitle">—</div></div>
        <div class="tg-lead"><div class="tg-big num" id="tgBig">0.0<span class="u">m</span></div><div class="tg-sub" id="tgSub">lead</div></div>
      </div>
      <div class="tg-center" id="tgCenter"></div>
      <div class="tg-bottom">
        <div class="tg-left"><div class="v num" id="tgTime">0:00</div><div class="tg-sub" id="tgDist">0 m</div></div>
        <div class="tg-mid"><button class="tg-snd" id="tgSnd" title="Sound" aria-label="Sound">${SND}</button></div>
        <div class="tg-stat"><div class="v num" id="tgPace">–:––</div><div class="tg-sub" id="tgOppPace">vs –:––</div></div>
      </div>
      <div class="tg-prog"><i id="tgProg"></i></div>
    </div>`;
  host = el.querySelector('.tg-host'); hudEl = el.querySelector('.tg-hud');
  el.app = app;
  const snd = el.querySelector('#tgSnd'); snd.dataset.muted = prefs.sound === false ? '1' : '0';
  snd.onclick = () => { const m = snd.dataset.muted !== '1'; snd.dataset.muted = m ? '1' : '0'; setPrefs({ sound: !m }); sfx?.setMuted(m); if (!m) sfx?.unlock(); };
  document.addEventListener('pointerdown', () => { if (shown) sfx?.unlock(); }, { passive: true });

  engine.on('status', ({ latest }) => {
    lastStatus = { elapsed: latest.elapsed, distance: latest.distance, pace: latest.pace };
    if (game && mode === 'racing') game.status(lastStatus);
    if (mode === 'setup' && shown) refreshEvent();
  });
  // the stroke record lands at the end of the drive; its force curve follows a moment later, so the yank's
  // shape uses the previous curve's peak timing (strokes rarely change shape stroke to stroke)
  engine.on('stroke', ({ stroke }) => { if (game && mode === 'racing' && engine.connected) game.onStroke(stroke.workPerStroke, engine.latest.curvePeakAt); });
  engine.on('conn', ({ state }) => { if (state === 'idle' && mode === 'racing') { mode = 'setup'; game = null; } renderCenter(); });
  engine.on('saved', () => { if (mode === 'racing' || mode === 'done') { savedFlag = true; const r = el.querySelector('#tgSaved'); if (r) r.textContent = 'Saved to History'; } });
}

/** The piece programmed on the monitor right now, as an event. */
function liveEvent() {
  const w = workoutFromStatus(engine.latest); if (!w) return null;
  return classify({ workout: w });
}
async function refreshEvent() {
  const e = liveEvent(), key = e?.key;
  if (key === event?.key) return;
  event = e;
  if (event?.target) { const all = await db.all().catch(() => []); choices = choicesFor(all, event.key); choice = { kind: choices.last ? 'last' : 'pace', pace: Math.round(choices.suggestPace) }; }
  renderCenter();
}

function renderCenter() {
  if (!el) return;
  const c = el.querySelector('#tgCenter'), app = el.app;
  c.innerHTML = '';
  if (mode === 'racing') return;
  if (mode === 'done' && game) {
    const r = game.S.result, m = Math.abs(r.margin), secs = r.oppElapsed != null ? Math.abs(r.elapsed - r.oppElapsed) : null;
    c.innerHTML = `<div class="tg-card" style="text-align:center">
      <div class="tg-res ${r.draw ? '' : r.win ? '' : 'lost'}">${r.draw ? 'Dead heat' : r.win ? 'You won' : 'They won'}</div>
      <div class="hint">${r.draw ? 'level at the line' : `by ${m.toFixed(1)} m${secs != null ? ` · ${secs.toFixed(1)} s` : ''}`} · ${fmtTime(r.elapsed)} for ${fmtInt(r.distance)} m</div>
      <div class="hint" id="tgSaved">${savedFlag ? 'Saved to History' : ''}</div>
      <div class="row" style="justify-content:center"><button class="btn primary" id="tgAgain">Row again</button></div></div>`;
    c.querySelector('#tgAgain').onclick = () => { mode = 'setup'; game = null; event = null; if (engine.simulated) app.startDemo({ stay: true, opts: { distance: 500, rate: 26, pace: 118 } }); else refreshEvent(); renderCenter(); };
    return;
  }
  // setup
  if (!engine.connected) {
    c.innerHTML = `<div class="msg">Connect your PM5 to start</div><div class="hint">${engine.supported ? 'Program a distance or time piece on the monitor, pick an opponent, row.' : 'No Bluetooth here — try it against a target pace with the simulated erg.'}</div>
      <div class="row" style="justify-content:center"><button class="btn primary" id="tgAct">${engine.supported ? 'Connect' : 'Try demo'}</button></div>`;
    c.querySelector('#tgAct').onclick = () => { if (engine.supported) document.getElementById('connectBtn').click(); else app.startDemo({ stay: true, opts: { distance: 500, rate: 26, pace: 118 } }); };
    return;
  }
  if (!event?.target) {
    c.innerHTML = `<div class="msg">Set a piece on the PM5</div><div class="hint">Tug of war needs a fixed distance or time — Select Workout → Single Distance or Single Time (2000 m, 30 min…). The screen follows along.</div>`;
    return;
  }
  const ws = engine.latest.workoutState;
  if (ws >= 10 || (!engine.simulated && engine.latest.elapsed > 0 && engine.latest.distance > 0 && ws !== 0)) {
    c.innerHTML = `<div class="msg">${ws >= 10 ? 'That piece is finished' : 'Already rowing'}</div><div class="hint">${ws >= 10 ? 'Set up the next piece on the PM5 and this screen follows.' : 'Tug of war starts from a standing start: finish or reset this piece on the PM5, then choose an opponent.'}</div>
      ${engine.simulated ? '<div class="row" style="justify-content:center"><button class="btn primary" id="tgRedemo">New demo piece</button></div>' : ''}`;
    c.querySelector('#tgRedemo')?.addEventListener('click', () => { event = null; app.startDemo({ stay: true, opts: { distance: 500, rate: 26, pace: 118 } }); });
    return;
  }
  const opt = (kind, title, sub, dis = false) => `<button class="tg-opt${choice.kind === kind ? ' on' : ''}" data-k="${kind}" ${dis ? 'disabled' : ''}><span><b>${title}</b></span><small>${sub}</small></button>`;
  const L = choices.last, B = choices.best;
  c.innerHTML = `<div class="tg-card">
    <div class="eyebrow">${event.label} · choose your opponent</div>
    <div class="tg-opts">
      ${opt('last', `Last ${event.label}`, L ? `${fmtPace(L.summary.avgPace)} /500m · ${new Date(L.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'none yet', !L)}
      ${opt('best', `Best ${event.label}`, B ? `${fmtPace(B.summary.avgPace)} /500m · ${new Date(B.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'none yet', !B)}
      ${opt('pace', 'Target pace', `<span class="tg-step"><button data-d="-1">−</button><span class="num" id="tgPaceV">${fmtPace(choice.pace)}</span><button data-d="1">+</button></span> /500m`)}
    </div>
    <div class="row" style="justify-content:space-between;align-items:center"><span class="hint" style="margin:0">Then just start rowing.</span><button class="btn primary" id="tgGo">Ready</button></div></div>`;
  c.querySelectorAll('.tg-opt').forEach((b) => b.onclick = (ev) => {
    const d = ev.target.closest('[data-d]'); if (d) { choice.pace = Math.max(60, Math.min(300, choice.pace + +d.dataset.d)); choice.kind = 'pace'; renderCenter(); return; }
    choice.kind = b.dataset.k; renderCenter();
  });
  c.querySelector('#tgGo').onclick = arm;
}

function arm() {
  if (!mods || !event?.target) return;
  const opp = choice.kind === 'last' && choices.last ? fromSession(choices.last, `Last ${event.label}`) : choice.kind === 'best' && choices.best ? fromSession(choices.best, `Best ${event.label}`) : fromPace(choice.pace, 24, event);
  game = mods[2].createTugGame({ opponent: opp, target: event.target, onEvent });
  game.status(lastStatus); savedFlag = false;
  mode = 'racing'; renderCenter();
  el.querySelector('#tgTitle').innerHTML = `vs ${opp.name} <span>· ${opp.label}</span>`;
}
function onEvent(name, d) {
  if (name === 'yank') { sfx?.yank(d.dv, d.mine); if (stage) { stage.kick(d.mine ? stage.mine.position.x : stage.ghost.position.x, 6 + Math.round(d.dv * 5), 0.4 * d.dv); } }
  if (name === 'finish') { mode = 'done'; sfx?.finish(d.win); renderCenter(); }
}

function fail(err, where) { console.error('[tug]', where, err); cancelAnimationFrame(raf); game = null; host.innerHTML = `<div class="tg-fail"><div><div class="msg">The arena couldn't start</div><div class="why">${where}: ${String(err?.message || err).slice(0, 240)}</div></div></div>`; hudEl.style.display = 'none'; }
function hasWebGL2() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } }
async function build() {
  built = true;
  try { await buildInner(); } catch (e) { fail(e, 'build'); }
}
async function buildInner() {
  if (!hasWebGL2()) throw new Error('this browser has no WebGL 2 (needed for the 3D arena)');
  mods = await Promise.all([import('../../core/gfx.js'), import('./stage.js'), import('./game.js'), import('./audio.js')]);
  const [{ createRenderer, roomEnvironment }, stageMod] = mods;
  await new Promise((r) => setTimeout(r, 30));
  const p = prefs, accent = (window.FW_ACCENTS[p.accent] || window.FW_ACCENTS.cyan).d;
  el.style.setProperty('--accent-dark', accent);
  gfx = createRenderer(host, { quality: 'high', bloom: { strength: 0.14, radius: 0.5, threshold: 0.94 } });
  gfx.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail(new Error('WebGL context lost (out of GPU memory?)'), 'gpu'); });
  stage = stageMod.createStage({ renderer: gfx.renderer, envMap: roomEnvironment(gfx.renderer), accent, maxShadow: gfx.maxShadow });
  host.querySelector('.tg-loading')?.remove();
  ro = new ResizeObserver(resize); ro.observe(host); resize();
  sfx = mods[3].createTugAudio(); sfx.setMuted(prefs.sound === false); if (shown) sfx.start();
  stage.setRope({ shift: 0, tension: 0.4 });
  renderCenter();
  if (shown) loop(performance.now());
}
function resize() { if (!gfx) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; gfx.setSize(w, h); stage.frame(w, h); }

function hud() {
  const $ = (s) => el.querySelector(s);
  if (!game) { $('#tgBig').innerHTML = `0.0<span class="u">m</span>`; $('#tgSub').textContent = 'lead'; $('#tgTime').textContent = fmtTime(lastStatus.elapsed); $('#tgDist').textContent = `${fmtInt(lastStatus.distance)} m`; $('#tgPace').textContent = fmtPace(lastStatus.pace); $('#tgOppPace').textContent = ''; $('#tgProg').style.width = '0'; $('#tgTitle').textContent = event?.label || '—'; return; }
  const S = game.S, lead = S.lead;
  $('#tgBig').innerHTML = `${lead >= 0 ? '+' : '−'}${Math.abs(lead).toFixed(1)}<span class="u">m</span>`; $('#tgBig').classList.toggle('behind', lead < -0.05);
  $('#tgSub').textContent = S.started ? (lead >= 0 ? 'ahead' : 'behind') : 'start rowing';
  $('#tgTime').textContent = fmtTime(S.elapsed);
  $('#tgDist').textContent = `${fmtInt(S.myDist)}${S.target.distance ? ' / ' + fmtInt(S.target.distance) : ''} m${S.target.time ? ' · of ' + fmtTime(S.target.time) : ''}`;
  $('#tgPace').textContent = fmtPace(S.myPace); $('#tgOppPace').textContent = `vs ${fmtPace(S.oppPace)}`;
  const prog = S.target.distance ? S.myDist / S.target.distance : S.elapsed / S.target.time;
  $('#tgProg').style.width = `${Math.min(100, prog * 100).toFixed(1)}%`;
}
function loop(now) {
  if (!shown || !stage) return;
  const dt = Math.min(0.5, (now - last) / 1000 || 0); last = now;
  if (game) {
    const S = game.update(dt);
    stage.setRope({ shift: S.x, tension: S.tension, wobble: S.wobble, time: S.time });
    stage.shakeCamera(S.v * 0.012, Math.abs(S.v) * 0.004);
    sfx?.update(S);
  }
  try { hud(); stage.dust.update(dt, stage.camera, gfx.renderer.domElement.height); gfx.render(stage.scene, stage.camera, now / 1000); } catch (e) { fail(e, 'render'); return; }
  raf = requestAnimationFrame(loop);
}

export function show() {
  shown = true; last = performance.now();
  if (!built) build(); else { resize(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); sfx?.start(); }
  if (mode === 'setup') refreshEvent(); renderCenter();
}
export function hide() { shown = false; cancelAnimationFrame(raf); sfx?.stop(); }
