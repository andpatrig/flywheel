// core/prepaint.js — classic (non-module) script loaded in <head> by every page, before first paint,
// so the right theme and accent are applied with no flash.
// Accent palette: d = on dark theme (neon), l = on light theme (deepened for contrast on white).
window.FW_ACCENTS = {
  cyan:   { n: 'Cyan',   d: '#00e5ff', l: '#0088a3' },
  pink:   { n: 'Pink',   d: '#ff2e93', l: '#d1106a' },
  lime:   { n: 'Lime',   d: '#c6ff00', l: '#5b8a00' },
  orange: { n: 'Orange', d: '#ff8a1f', l: '#c25700' },
  green:  { n: 'Green',  d: '#2bff88', l: '#00904a' },
  violet: { n: 'Violet', d: '#b388ff', l: '#6a3fd8' },
  yellow: { n: 'Yellow', d: '#ffe500', l: '#9a7a00' },
  mono:   { n: 'Mono',   d: '#f5f5f5', l: '#111111' },
};
(function () {
  var p = {}; try { p = JSON.parse(localStorage.getItem('flywheel.prefs') || '{}'); } catch (e) {}
  var t = p.theme || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  var r = document.documentElement, a = window.FW_ACCENTS[p.accent] || window.FW_ACCENTS.cyan;
  r.dataset.theme = dark ? 'dark' : 'light';
  r.style.setProperty('--accent', dark ? a.d : a.l);
})();
