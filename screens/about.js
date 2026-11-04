// screens/about.js — how to connect, data notes, connected device details.
import html from './about.html.js';
import { engine } from '../core/session.js';
import { $ } from '../core/ui.js';

export const id = 'about';
export function mount(el, app) {
  el.innerHTML = html;
  $('demoBtn').onclick = () => app.startDemo();
  engine.on('conn', ({ state, name, info }) => {
    if (state !== 'connected') return;
    $('devTable').innerHTML = Object.entries({ Status: 'connected', Name: name, ...info }).map(([k, v]) => `<tr><td>${k}</td><td>${v ?? ''}</td></tr>`).join('');
  });
}
export function show() {}
export function hide() {}
