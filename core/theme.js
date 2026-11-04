// core/theme.js — preferences (theme, accent, layout, …) and their application to the document.
// Screens read `prefs` and subscribe with onThemeChange() to redraw when colors or layout change.
export const ACCENTS = window.FW_ACCENTS;   // defined by core/prepaint.js

const KEY = 'flywheel.prefs';
const DEFAULTS = { theme: 'system', accent: 'cyan', layout: 'auto', panel: 'metrics', units: 'pace', noticeDismissed: false, sound: true };
export const prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } })();
export const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };

const root = document.documentElement;
const mqDark = matchMedia('(prefers-color-scheme: dark)');
const mqWide = matchMedia('(min-width: 960px) and (orientation: landscape)');
const listeners = new Set();

export const isDark = () => root.dataset.theme === 'dark';
export const accentHex = () => getComputedStyle(root).getPropertyValue('--accent').trim();
export const onThemeChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Apply prefs to the document (data-theme, --accent, data-mode) and notify subscribers. */
export function applyPrefs() {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && mqDark.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const a = ACCENTS[prefs.accent] || ACCENTS.cyan;
  root.style.setProperty('--accent', dark ? a.d : a.l);
  root.dataset.mode = prefs.layout === 'grid' ? 'grid' : prefs.layout === 'focus' ? 'focus' : (mqWide.matches ? 'grid' : 'focus');
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#070708' : '#f3f3f1';
  listeners.forEach((fn) => fn());
}
/** Change one or more prefs, persist, and re-apply. */
export function setPrefs(patch) { Object.assign(prefs, patch); savePrefs(); applyPrefs(); }

mqDark.addEventListener('change', applyPrefs);
mqWide.addEventListener('change', applyPrefs);
