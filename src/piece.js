// Piece model: preset pieces, normalization, onset windows, custom piece input.
import { getInstrument } from './instruments/index.js';
import { canonicalNoteName, midiToFrequency, noteNameToMidi } from './music.js';

// A timed note counts only if a fresh onset (pluck or pitch change) lands within this
// distance of note.start; narrower for fast passages (half the gap to the neighbours).
export const TIMED_ONSET_WINDOW_MS = 200;

export const TIMED_MIN_ONSET_WINDOW_MS = 60;

export const CHORD_GROUP_EPSILON_SECONDS = 0.035;

export const presetPieces = [
  {
    name: 'Open String Warmup',
    bpm: 90,
    notes: [
      { note: 'E2', start: 0.0, duration: 1.5 },
      { note: 'A2', start: 1.5, duration: 1.5 },
      { note: 'D3', start: 3.0, duration: 1.5 },
      { note: 'G3', start: 4.5, duration: 1.5 },
      { note: 'B3', start: 6.0, duration: 1.5 },
      { note: 'E4', start: 7.5, duration: 1.5 },
    ],
  },
  {
    name: 'Simple Melody (Twinkle Fragment)',
    bpm: 100,
    notes: [
      { note: 'C4', start: 0.0, duration: 0.7 },
      { note: 'C4', start: 0.7, duration: 0.7 },
      { note: 'G4', start: 1.4, duration: 0.7 },
      { note: 'G4', start: 2.1, duration: 0.7 },
      { note: 'A4', start: 2.8, duration: 0.7 },
      { note: 'A4', start: 3.5, duration: 0.7 },
      { note: 'G4', start: 4.2, duration: 1.4 },
      { note: 'F4', start: 5.6, duration: 0.7 },
      { note: 'F4', start: 6.3, duration: 0.7 },
      { note: 'E4', start: 7.0, duration: 0.7 },
      { note: 'E4', start: 7.7, duration: 0.7 },
      { note: 'D4', start: 8.4, duration: 0.7 },
      { note: 'D4', start: 9.1, duration: 0.7 },
      { note: 'C4', start: 9.8, duration: 1.4 },
    ],
  },
];

export function normalizePiece(piece, instrument = getInstrument()) {
  if (!piece || !Array.isArray(piece.notes) || piece.notes.length === 0) {
    throw new Error('Piece must include a non-empty notes array');
  }

  const notes = piece.notes.map((n, idx) => {
    if (typeof n.note !== 'string') {
      throw new Error(`Invalid note at index ${idx}`);
    }

    let midi;
    try {
      midi = noteNameToMidi(n.note);
    } catch {
      throw new Error(`Invalid note at index ${idx}`);
    }

    const start = Number(n.start);
    const duration = Number(n.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid start/duration at index ${idx}`);
    }

    const normalizedNote = {
      note: canonicalNoteName(n.note),
      start,
      duration,
      end: start + duration,
      midi,
      freq: midiToFrequency(midi),
      // Instrument-specific placement (fretted: tab + tabAlternatives; piano: key).
      ...instrument.placeNote(n, midi),
      index: idx,
    };
    // Optional performance hints: which hand, which finger (1 = thumb/index ... 5).
    if (n.hand === 'L' || n.hand === 'R') normalizedNote.hand = n.hand;
    if (Number.isInteger(n.finger) && n.finger >= 0 && n.finger <= 5) normalizedNote.finger = n.finger;
    normalizedNote.playable = instrument.isPlayable(normalizedNote);
    return normalizedNote;
  });

  notes.sort((a, b) => a.start - b.start);
  notes.forEach((note, index) => {
    note.index = index;
  });
  instrument.annotatePiece?.(notes);
  assignOnsetWindows(notes);

  return {
    name: piece.name || 'Custom Piece',
    instrument: instrument.id,
    bpm: piece.bpm || 100,
    ...(Number(piece.beatsPerBar) > 0 ? { beatsPerBar: Number(piece.beatsPerBar) } : {}),
    notes,
    // The last-starting note is not necessarily the last to end.
    totalDuration: notes.reduce((max, note) => Math.max(max, note.end), 0),
    playableCount: notes.filter((note) => !isStepNoteEmptyOrUnmapped(note)).length,
  };
}

// Timed-mode onset tolerance per note (seconds): half the gap to the neighbouring note
// starts (chord tones share a start), clamped to [TIMED_MIN_ONSET_WINDOW_MS, TIMED_ONSET_WINDOW_MS].
// Returns one window per note, in the order given (notes must be sorted by start).
export function onsetWindowsFor(notes) {
  const groupStarts = [];
  notes.forEach((note) => {
    if (!groupStarts.length || note.start - groupStarts.at(-1) > CHORD_GROUP_EPSILON_SECONDS) {
      groupStarts.push(note.start);
    }
  });

  let groupIndex = 0;
  return notes.map((note) => {
    while (groupIndex + 1 < groupStarts.length && groupStarts[groupIndex + 1] <= note.start + 1e-9) {
      groupIndex += 1;
    }
    const prevGap = groupIndex > 0 ? note.start - groupStarts[groupIndex - 1] : Infinity;
    const nextGap = groupIndex + 1 < groupStarts.length ? groupStarts[groupIndex + 1] - note.start : Infinity;
    const halfGap = Math.min(prevGap, nextGap) / 2;
    return Math.min(
      TIMED_ONSET_WINDOW_MS / 1000,
      Math.max(TIMED_MIN_ONSET_WINDOW_MS / 1000, halfGap),
    );
  });
}

export function assignOnsetWindows(notes) {
  onsetWindowsFor(notes).forEach((window, i) => {
    notes[i].onsetWindow = window;
  });
}

// ---- hands (piano) ----------------------------------------------------------------------
// Notes may carry hand: 'R' | 'L'. Unlabelled notes belong to the right hand (built-in piano
// pieces were right hand first). A practice selection is 'R', 'L' or 'both'.
export const HAND_CHOICES = ['R', 'L', 'both'];

export const HAND_NAMES = { R: 'Right hand', L: 'Left hand', both: 'Both hands' };

export const handOf = (note) => (note?.hand === 'L' ? 'L' : 'R');

export function normalizeHands(value) {
  return HAND_CHOICES.includes(value) ? value : 'both';
}

// True when a note is part of the selected hand(s).
export function inHands(note, hands = 'both') {
  return hands === 'both' || handOf(note) === hands;
}

// Note counts per hand ({ R, L }), counting playable notes only.
export function handCounts(piece) {
  const counts = { R: 0, L: 0 };
  (piece?.notes || []).forEach((note) => {
    if (note.playable !== false) counts[handOf(note)] += 1;
  });
  return counts;
}

// A piece has two hands when both hands have notes to play.
export function isTwoHanded(piece) {
  const counts = handCounts(piece);
  return counts.R > 0 && counts.L > 0;
}

export function createVirtualNote(noteName, instrument = getInstrument()) {
  const upperName = canonicalNoteName(noteName);
  const midi = noteNameToMidi(upperName);

  const virtualNote = {
    note: upperName,
    start: 0,
    duration: 1,
    end: 1,
    midi,
    freq: midiToFrequency(midi),
    ...instrument.placeNote({}, midi),
    index: -1,
  };
  virtualNote.playable = instrument.isPlayable(virtualNote);
  return virtualNote;
}

export function toPieceSnapshot(normalizedPiece, instrument = getInstrument()) {
  return {
    name: normalizedPiece.name,
    instrument: normalizedPiece.instrument || instrument.id,
    bpm: normalizedPiece.bpm,
    ...(normalizedPiece.beatsPerBar ? { beatsPerBar: normalizedPiece.beatsPerBar } : {}),
    notes: normalizedPiece.notes.map((note) => ({
      note: note.note,
      start: note.start,
      duration: note.duration,
      ...instrument.serializePlacement(note),
      ...(note.hand ? { hand: note.hand } : {}),
      ...(Number.isInteger(note.finger) ? { finger: note.finger } : {}),
    })),
  };
}

// True when a note can't be played on the active instrument (outside its range or with
// no placement); such notes are skipped and reported as "unplayable".
export function isStepNoteEmptyOrUnmapped(note) {
  if (!note) return true;
  return !Number.isFinite(note.freq) || !note.playable;
}

export function clampBpm(bpm) {
  const numeric = Number(bpm);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(40, Math.min(240, Math.round(numeric)));
}

// Accepts piece JSON (array or { notes }), optionally in a ```json fence, or any plain-text
// format the instrument can import (guitar: raw ASCII tab).
export function parseCustomPieceInput(raw, tabOptions = {}, instrument = getInstrument()) {
  const textImporter = instrument.importers?.text;
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Custom piece is empty');
  }

  // Accept pasted markdown code fences like ```json ... ```
  const fencedMatch = trimmed.match(/^```(?:json|text|txt)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const looksLikeJson = /^[[{]/.test(candidate);
  if (!looksLikeJson && textImporter?.canParse(candidate)) {
    return textImporter.parse(candidate, tabOptions);
  }

  const parseAttempts = [candidate];
  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');
  const first = [firstObj, firstArr].filter((idx) => idx >= 0).sort((a, b) => a - b)[0];
  const lastObj = candidate.lastIndexOf('}');
  const lastArr = candidate.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (Number.isInteger(first) && Number.isInteger(last) && first < last) {
    parseAttempts.push(candidate.slice(first, last + 1).trim());
  }

  let parsed = null;
  let lastError = null;
  for (const attempt of parseAttempts) {
    if (!attempt) continue;
    try {
      parsed = JSON.parse(attempt);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (parsed === null) {
    if (textImporter?.canParse(candidate)) {
      return textImporter.parse(candidate, tabOptions);
    }
    const alternative = textImporter?.formatName ? ` (and no ${textImporter.formatName} was found)` : '';
    throw new Error(`${lastError?.message || 'Could not parse JSON'}${alternative}`);
  }

  if (Array.isArray(parsed)) {
    return { name: 'Custom Piece', notes: parsed };
  }
  if (parsed && Array.isArray(parsed.notes)) {
    return parsed;
  }
  if (parsed && parsed.piece && Array.isArray(parsed.piece.notes)) {
    return parsed.piece;
  }

  throw new Error('JSON must be an array of notes or an object with a notes array');
}

export function chordGroupBoundsAtIndex(notes, index) {
  if (!Array.isArray(notes) || !notes.length || index < 0 || index >= notes.length) {
    return { startIndex: -1, endIndex: -1 };
  }

  let startIndex = index;
  while (
    startIndex > 0
    && Math.abs(notes[startIndex].start - notes[startIndex - 1].start) <= CHORD_GROUP_EPSILON_SECONDS
  ) {
    startIndex -= 1;
  }

  let endIndex = index;
  while (
    endIndex < notes.length - 1
    && Math.abs(notes[endIndex + 1].start - notes[endIndex].start) <= CHORD_GROUP_EPSILON_SECONDS
  ) {
    endIndex += 1;
  }

  return { startIndex, endIndex };
}
