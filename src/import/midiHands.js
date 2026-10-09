// Hand assignment for piano MIDI imports.
//
// Multi-track files: each track goes to the right hand, the left hand or nowhere. By default
// the higher-pitched track is the right hand and the lower one the left (track names like
// "RH" / "Left hand" win when present); any other tracks join the hand they sit closest to.
//
// Single-track files with both hands: the notes are split by pitch, one time slice (notes
// that start together) at a time. Each slice is cut into a lower part (left hand) and an
// upper part (right hand), so each hand's notes stay contiguous; the cut is chosen to keep
// each hand within about an octave and a half (counting keys it still holds), close to
// where that hand has been playing, and otherwise near middle C.
import { midiToNoteName } from '../music.js';
import { CHORD_GROUP_EPSILON_SECONDS } from '../piece.js';
import { midiNotesToRaw } from './midiFile.js';

export const MIDDLE_C = 60;
// About an octave and a half: what one hand covers over time, counting keys it still holds.
export const HAND_SPAN = 18;
// What one hand reaches in a single chord (about a tenth).
export const CHORD_REACH = 15;
const MAX_FINGERS = 5;

const RIGHT_NAME = /\b(right|rh|r\.h\.?|treble|upper|melody)\b/i;
const LEFT_NAME = /\b(left|lh|l\.h\.?|bass|lower)\b/i;

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

function percentile(sorted, fraction) {
  if (!sorted.length) return MIDDLE_C;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

// Tracks that have notes, with what the import dialog lists: count and range.
export function describeMidiTracks(parsed) {
  return parsed.tracks.filter((track) => track.notes.length).map((track) => {
    const pitches = track.notes.map((n) => n.midi);
    const minMidi = Math.min(...pitches);
    const maxMidi = Math.max(...pitches);
    return {
      index: track.index,
      name: track.name || `Track ${track.index + 1}`,
      count: track.notes.length,
      minMidi,
      maxMidi,
      meanMidi: mean(pitches),
      range: `${midiToNoteName(minMidi)}–${midiToNoteName(maxMidi)}`,
      isDrums: track.isDrums,
    };
  });
}

// Groups notes (sorted by start) into slices of notes that start together.
function slicesOf(notes) {
  const order = notes.map((note, i) => i).sort((a, b) => notes[a].start - notes[b].start || notes[a].midi - notes[b].midi);
  const slices = [];
  order.forEach((i) => {
    const last = slices.at(-1);
    if (last && notes[i].start - notes[last[0]].start <= CHORD_GROUP_EPSILON_SECONDS) last.push(i);
    else slices.push([i]);
  });
  return slices.map((slice) => slice.sort((a, b) => notes[a].midi - notes[b].midi));
}

// True when a track is one melodic line (hardly any notes start together): one hand.
export function isSingleLine(notes) {
  if (notes.length < 2) return true;
  const slices = slicesOf(notes);
  const chords = slices.filter((slice) => slice.length > 1).length;
  return chords / slices.length < 0.05;
}

// Splits one track's notes between the hands. notes: [{ midi, start, duration }] (seconds).
// Returns 'R' | 'L' per note, in the order given.
export function splitHands(notes) {
  const hands = new Array(notes.length).fill('R');
  if (!notes.length) return hands;
  const sorted = notes.map((n) => n.midi).sort((a, b) => a - b);
  const low = percentile(sorted, 0.25);
  const high = percentile(sorted, 0.75);
  // The fallback split: middle C, unless the whole piece sits above or below it.
  const split = low <= MIDDLE_C && MIDDLE_C <= high ? MIDDLE_C : percentile(sorted, 0.5);
  const center = { R: Math.max(high, split + 5), L: Math.min(low, split - 7) };
  const sounding = { R: [], L: [] };

  slicesOf(notes).forEach((slice) => {
    const now = notes[slice[0]].start;
    ['R', 'L'].forEach((hand) => {
      sounding[hand] = sounding[hand].filter((i) => notes[i].start + notes[i].duration > now + CHORD_GROUP_EPSILON_SECONDS);
    });
    const pitches = slice.map((i) => notes[i].midi);

    const partCost = (hand, part) => {
      if (!part.length) return 0;
      const held = sounding[hand].map((i) => notes[i].midi);
      const all = [...part, ...held];
      const span = Math.max(...all) - Math.min(...all);
      const reach = Math.max(...part) - Math.min(...part);
      let cost = Math.abs(mean(part) - center[hand]);
      if (span > HAND_SPAN) cost += (span - HAND_SPAN) * 12;
      if (reach > CHORD_REACH) cost += (reach - CHORD_REACH) * 12;
      if (all.length > MAX_FINGERS) cost += (all.length - MAX_FINGERS) * 25;
      // Gentle pull toward the fallback split: left hand below it, right hand above.
      part.forEach((p) => {
        if (hand === 'L' && p > split + 4) cost += (p - split - 4) * 0.5;
        if (hand === 'R' && p < split - 5) cost += (split - 5 - p) * 0.5;
      });
      return cost;
    };

    let best = null;
    for (let cut = 0; cut <= pitches.length; cut += 1) {
      const left = pitches.slice(0, cut);
      const right = pitches.slice(cut);
      const cost = partCost('L', left) + partCost('R', right);
      // Ties: the cut nearest the fallback split.
      const tieBreak = Math.abs(cut - pitches.filter((p) => p < split).length);
      if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && tieBreak < best.tieBreak)) {
        best = { cut, cost, tieBreak, left, right };
      }
    }

    slice.forEach((noteIndex, k) => {
      const hand = k < best.cut ? 'L' : 'R';
      hands[noteIndex] = hand;
      sounding[hand].push(noteIndex);
    });
    if (best.left.length) center.L = 0.6 * center.L + 0.4 * mean(best.left);
    if (best.right.length) center.R = 0.6 * center.R + 0.4 * mean(best.right);
  });
  return hands;
}

export function splitCounts(hands) {
  return { R: hands.filter((h) => h === 'R').length, L: hands.filter((h) => h === 'L').length };
}

// The default plan for a parsed file:
//   { kind: 'tracks', tracks, assignments: { [trackIndex]: 'R' | 'L' | 'ignore' } }  (2+ tracks)
//   { kind: 'single', tracks, assignments: { [trackIndex]: 'split' | 'R' | 'L' }, split: { R, L } }
export function planHands(parsed) {
  const tracks = describeMidiTracks(parsed);
  const usable = tracks.filter((t) => !t.isDrums);
  const assignments = {};
  tracks.forEach((t) => { assignments[t.index] = 'ignore'; });

  if (usable.length >= 2) {
    const named = (pattern) => usable.filter((t) => pattern.test(t.name) && !(pattern === LEFT_NAME ? RIGHT_NAME : LEFT_NAME).test(t.name));
    const byName = { R: named(RIGHT_NAME), L: named(LEFT_NAME) };
    const byPitch = [...usable].sort((a, b) => b.meanMidi - a.meanMidi);
    const rightAnchor = byName.R.length && byName.L.length ? byName.R : [byPitch[0]];
    const leftAnchor = byName.R.length && byName.L.length ? byName.L : [byPitch.at(-1)];
    rightAnchor.forEach((t) => { assignments[t.index] = 'R'; });
    leftAnchor.forEach((t) => { assignments[t.index] = 'L'; });
    const rightMean = mean(rightAnchor.map((t) => t.meanMidi));
    const leftMean = mean(leftAnchor.map((t) => t.meanMidi));
    usable.forEach((t) => {
      if (assignments[t.index] !== 'ignore') return;
      assignments[t.index] = Math.abs(t.meanMidi - rightMean) <= Math.abs(t.meanMidi - leftMean) ? 'R' : 'L';
    });
    return { kind: 'tracks', tracks, assignments };
  }

  const only = usable[0] || tracks[0];
  if (!only) return { kind: 'single', tracks, assignments, split: { R: 0, L: 0 } };
  const notes = parsed.tracks.find((t) => t.index === only.index).notes;
  const split = splitCounts(splitHands(notes));
  if (isSingleLine(notes)) assignments[only.index] = only.meanMidi >= 55 ? 'R' : 'L';
  else assignments[only.index] = 'split';
  return { kind: 'single', tracks, assignments, split };
}

// Builds a raw piano piece from a parsed file and per-track assignments ('R' | 'L' |
// 'split' | 'ignore'). Every note gets hand: 'R' | 'L'. Notes both hands would play at once
// (the same key at the same time) are kept once.
export function midiToHandsPiece(parsed, { assignments, quantize = null, name = '', instrument = 'piano' } = {}) {
  const chosen = parsed.tracks.filter((t) => t.notes.length && assignments?.[t.index] && assignments[t.index] !== 'ignore');
  if (!chosen.length) throw new Error('Choose a hand for at least one track.');

  const notes = [];
  chosen.forEach((track) => {
    const mode = assignments[track.index];
    const hands = mode === 'split' ? splitHands(track.notes) : track.notes.map(() => mode);
    midiNotesToRaw(parsed, track.notes, quantize).forEach((raw, i) => notes.push({ ...raw, hand: hands[i] }));
  });
  notes.sort((a, b) => a.start - b.start || (a.hand === b.hand ? 0 : a.hand === 'R' ? -1 : 1));
  const seen = new Set();
  const unique = notes.filter((note) => {
    const key = `${note.note}@${note.start.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const single = chosen.length === 1 ? chosen[0].name : '';
  const signature = parsed.timeSignature;
  return {
    name: name || single || 'MIDI import',
    bpm: parsed.bpm,
    ...(signature?.numerator && signature?.denominator ? { beatsPerBar: signature.numerator * (4 / signature.denominator) } : {}),
    instrument,
    notes: unique,
  };
}
