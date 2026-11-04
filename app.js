// app.js — the app shell: header, connection, settings, and the screen switcher.
// Screens are modules with { id, mount(el, app), show(), hide() }. They're mounted once and kept alive,
// so switching screens never drops the Bluetooth connection or the session being recorded.
import { engine } from './core/session.js';
import { prefs, setPrefs, applyPrefs, onThemeChange, ACCENTS } from './core/theme.js';
import { $, toast, twoTap } from './core/ui.js';
import { fmtInt, fmtTime } from './core/format.js';
import * as live from './screens/live.js';
import * as history from './screens/history.js';
import * as about from './screens/about.js';
import * as stones from './screens/stones/screen.js';

const SCREENS = { live, stones, history, about };
const app = { startDemo, show: showScreen };
let active = null;

// ---------- screens
for (const s of Object.values(SCREENS)) s.mount($('view-' + s.id), app);
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => showScreen(b.dataset.view));
function showScreen(id) {
  if (active === id) return;
  if (active) SCREENS[active].hide();
  active = id;
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x.dataset.view === id));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + id));
  SCREENS[id].show();
}

// ---------- connection
$('connectBtn').onclick = async () => {
  if (engine.connected) { twoTap($('connectBtn'), () => engine.disconnect()); return; }
  if (!engine.supported) { startDemo(); return; }
  try { await engine.connect(); } catch (e) { if (!/cancel/i.test(e.message)) toast(e.message); }
};
function startDemo({ stay = false } = {}) { engine.demo(); if (!stay) showScreen('live'); }
engine.on('conn', ({ state, name }) => {
  const btn = $('connectBtn'), norm = btn.querySelector('.norm');
  btn.classList.remove('armed');
  btn.classList.toggle('primary', state !== 'connected');
  norm.innerHTML = state === 'connected' ? `<i class="dot"></i><span id="connName">${name || 'PM5'}</span>` : state === 'connecting' ? 'Connecting…' : 'Connect';
  if (state === 'connected') toast('Connected — start rowing');
  if (state === 'idle' && engine.recording) toast('Disconnected — tap Save to keep this session');
});
engine.on('saved', ({ session: s }) => toast(`Saved · ${fmtInt(s.summary.distance)} m in ${fmtTime(s.summary.elapsed)}`));
engine.on('end', () => toast('Workout finished on the PM5 — saved'));
engine.on('stroke', () => { $('discardBtn').disabled = false; });
engine.on('reset', () => { $('discardBtn').disabled = true; });

// ---------- Bluetooth availability notice
if (!engine.supported && !prefs.noticeDismissed) {
  const n = $('bleNotice'); n.hidden = false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  n.innerHTML = (ios
    ? `<b>No Bluetooth in this browser.</b> On iPhone open this link in the free <a href="https://apps.apple.com/app/id1492822055" target="_blank" rel="noopener">Bluefy</a> browser. Or <a href="#" id="demoLink">try the demo</a>.`
    : `<b>Web Bluetooth isn't available here.</b> Use Chrome or Edge. Or <a href="#" id="demoLink">try the demo</a>.`) + `<button class="x" aria-label="Dismiss">×</button>`;
  n.querySelector('.x').onclick = () => { n.hidden = true; setPrefs({ noticeDismissed: true }); };
  $('demoLink').onclick = (e) => { e.preventDefault(); startDemo(); };
}

// ---------- settings
$('settingsBtn').onclick = () => $('settings').showModal();
$('closeSettings').onclick = () => $('settings').close();
$('settings').addEventListener('click', (e) => { if (e.target === $('settings')) $('settings').close(); });
$('swatches').innerHTML = Object.entries(ACCENTS).map(([k, v]) => `<button type="button" class="sw" data-accent="${k}"><i></i>${v.n}</button>`).join('');
document.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (b) setPrefs({ [seg.dataset.pref]: b.value });
}));
$('swatches').addEventListener('click', (e) => { const b = e.target.closest('.sw'); if (b) setPrefs({ accent: b.dataset.accent }); });
$('discardBtn').onclick = () => twoTap($('discardBtn'), () => { engine.reset(); $('settings').close(); toast('Session discarded'); });
onThemeChange(() => {
  document.querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.value === prefs[seg.dataset.pref])));
  const dark = document.documentElement.dataset.theme === 'dark';
  document.querySelectorAll('.sw').forEach((b) => {
    const a = ACCENTS[b.dataset.accent];
    b.querySelector('i').style.background = dark ? a.d : a.l;
    b.classList.toggle('on', b.dataset.accent === prefs.accent);
  });
});

// ---------- boot
applyPrefs();
showScreen('live');
// Service worker: check for a new version on launch and whenever the app comes back to the foreground;
// when a new version takes over, reload once so the new code is what's running.
export const APP_VERSION = 'v9';
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !engine.recording) { reloaded = true; location.reload(); } });
}
{ const v = document.getElementById('appVer'); if (v) v.textContent = APP_VERSION; }
// keep the screen awake while connected (Android Chrome; iOS ignores)
setInterval(async () => { try { if (engine.connected && !window._wl && 'wakeLock' in navigator) { window._wl = await navigator.wakeLock.request('screen'); window._wl.onrelease = () => { window._wl = null; }; } } catch {} }, 5000);
// console / test hook
window.__fw = { prefs, engine, setPanel: live.setPanel, applyPrefs, startDemo };
