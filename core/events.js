// core/events.js — what kind of piece a session was. The PM5 reports the programmed workout in every status
// packet (type, duration, duration units); we keep that with the session and reduce it to an event key such
// as "d2000" (a 2k) or "t1800" (30 minutes). Sessions of the same event are comparable: that is what History
// groups by and what the tug-of-war opponent is drawn from.
import { fmtTime } from './format.js';

// PM5 OBJ_WORKOUTTYPE_T
const TYPE = { 0: 'row', 1: 'row', 2: 'distance', 3: 'distance', 4: 'time', 5: 'time', 6: 'interval', 7: 'interval', 8: 'interval', 9: 'interval', 10: 'calories', 11: 'wattmin', 12: 'interval' };
// PM5 duration type byte: 0 time (0.01 s), 0x40 calories, 0x80 distance (m), 0xC0 watt-minutes
const DUR = { 0: 'time', 0x40: 'calories', 0x80: 'distance', 0xc0: 'wattmin' };

/** Workout descriptor from a general-status packet. */
export function workoutFromStatus(m) {
  if (m.workoutType == null) return null;
  const dt = DUR[m.workoutDurationType] ?? 'time';
  return { type: m.workoutType, intervalType: m.intervalType, duration: dt === 'time' ? m.workoutDuration / 100 : m.workoutDuration, durationType: dt };
}

const NAMED = { 21097: 'Half marathon', 42195: 'Marathon' };
export function distanceLabel(m) {
  if (NAMED[m]) return NAMED[m];
  if (m >= 1000 && m % 1000 === 0) return `${m / 1000}k`;
  if (m >= 1000 && m % 500 === 0) return `${(m / 1000).toFixed(1)}k`;
  return `${m.toLocaleString()} m`;
}
export function timeLabel(s) { return s % 60 === 0 ? `${s / 60} min` : fmtTime(s); }

/**
 * Classify a session: { kind, key, label, target }.
 * kind: 'distance' | 'time' | 'interval' | 'row' | 'other'; target: { distance } or { time } for fixed pieces.
 */
export function classify(session) {
  const w = session.workout, kind = w ? (TYPE[w.type] ?? 'other') : 'row';
  if (kind === 'distance' && w.duration > 0) return { kind, key: `d${w.duration}`, label: distanceLabel(w.duration), target: { distance: w.duration } };
  if (kind === 'time' && w.duration > 0) return { kind, key: `t${w.duration}`, label: timeLabel(w.duration), target: { time: w.duration } };
  if (kind === 'interval') {
    const unit = w.durationType === 'distance' ? distanceLabel(w.duration) : w.durationType === 'time' ? timeLabel(w.duration) : '';
    return { kind, key: `i${w.durationType[0]}${w.duration}`, label: unit ? `Intervals · ${unit}` : 'Intervals', target: null };
  }
  if (kind === 'calories') return { kind: 'other', key: `c${w.duration}`, label: `${w.duration} cal`, target: null };
  if (kind === 'wattmin') return { kind: 'other', key: `w${w.duration}`, label: `${w.duration} W·min`, target: null };
  return { kind: 'row', key: 'row', label: 'Just row', target: null };
}

/** Did the session complete its programmed piece? (fixed pieces only) */
export function completed(session) {
  const e = classify(session), m = session.summary;
  if (!e.target || !m) return false;
  if (e.target.distance) return m.distance >= e.target.distance - 1;
  if (e.target.time) return m.elapsed >= e.target.time - 0.5;
  return false;
}

/**
 * Personal bests per event key among completed fixed pieces: fastest time for a distance, longest distance
 * for a time. Returns Map key → session.
 */
export function personalBests(sessions) {
  const pb = new Map();
  for (const s of sessions) {
    const e = classify(s); if (!e.target || !completed(s)) continue;
    const cur = pb.get(e.key);
    const better = !cur || (e.target.distance ? s.summary.elapsed < cur.summary.elapsed : s.summary.distance > cur.summary.distance);
    if (better) pb.set(e.key, s);
  }
  return pb;
}

/** Sessions of one event, newest first. */
export const ofEvent = (sessions, key) => sessions.filter((s) => classify(s).key === key).sort((a, b) => b.startedAt - a.startedAt);
