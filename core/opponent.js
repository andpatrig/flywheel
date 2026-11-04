// core/opponent.js — something to row against. An opponent is reduced to one thing: how far it had rowed at
// each second of the piece (and when it took its strokes, for the tug-of-war yanks). It can be a replay of a
// saved session of the same event, or a fixed pace rowed perfectly evenly.
import { classify, ofEvent, personalBests, completed } from './events.js';
import { fmtPace } from './format.js';

function fromStrokes(strokes) {
  // cumulative (t, d) from stroke records, monotone in t; plus stroke times
  const T = [0], D = [0], W = [0], times = [];
  for (const s of strokes) {
    if (!(s.elapsed > T[T.length - 1])) continue;
    T.push(s.elapsed); D.push(s.distance || D[D.length - 1]); W.push(W[W.length - 1] + (s.workPerStroke || 0)); times.push(s.elapsed);
  }
  const at = (arr) => (t) => {
    if (t <= 0) return 0; const n = T.length; if (t >= T[n - 1]) return arr[n - 1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    const f = (t - T[lo]) / (T[hi] - T[lo]); return arr[lo] + (arr[hi] - arr[lo]) * f;
  };
  return { distAt: at(D), workAt: at(W), strokeTimes: times, end: T[T.length - 1] };
}

/** Replay a saved session. */
export function fromSession(s, name) {
  const e = classify(s), m = s.summary, r = fromStrokes(s.strokes);
  return { kind: 'session', name, label: `${fmtPace(m.avgPace)} /500m · ${new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, event: e, avgPace: m.avgPace, session: s, ...r };
}
/** An even pace (s/500m) at a stroke rate. */
export function fromPace(pace, spm = 24, event = null) {
  const v = 500 / pace, period = 60 / spm, end = event?.target?.time ?? (event?.target?.distance ? event.target.distance / v : 3600);
  const times = []; for (let t = period; t <= end; t += period) times.push(t);
  const watts = 2.8 / Math.pow(pace / 500, 3);
  return { kind: 'pace', name: 'Target', label: `${fmtPace(pace)} /500m even`, event, avgPace: pace, distAt: (t) => v * Math.max(0, Math.min(t, end)), workAt: (t) => watts * Math.max(0, Math.min(t, end)), strokeTimes: times, end };
}

/** The choices available for an event: last and best completed sessions of it, plus a target. */
export function choicesFor(sessions, eventKey) {
  const same = ofEvent(sessions, eventKey).filter(completed);
  const last = same[0] || null, best = personalBests(same).get(eventKey) || null;
  return { last, best, suggestPace: last?.summary.avgPace ?? best?.summary.avgPace ?? 120 };
}
