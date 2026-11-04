// core/ui.js — tiny DOM helpers shared by the shell and screens.
export const $ = (id) => document.getElementById(id);

export function toast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

/** Destructive or session-ending actions need a second tap within 3 s (no browser dialogs mid-row). */
export function twoTap(btn, action) {
  if (btn.classList.contains('armed')) { btn.classList.remove('armed'); clearTimeout(btn._t); action(); return; }
  btn.classList.add('armed'); clearTimeout(btn._t); btn._t = setTimeout(() => btn.classList.remove('armed'), 3000);
}
