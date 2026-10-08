// Piece model: preset pieces, normalization, onset windows, custom piece input.
import { MAX_FRET_FOR_BEGINNER_TAB, isValidTab, tabPositionsForMidi } from './instruments/guitar/strings.js';
import { countTabLines, parsePastedTab } from './instruments/guitar/tabParser.js';
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

export function normalizePiece(piece) {
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

    const inferredTabs = tabPositionsForMidi(midi);
    const preferredTab = isValidTab(n.tab)
      ? {
        string: n.tab.string,
        fret: n.tab.fret,
        isExtended: n.tab.fret > MAX_FRET_FOR_BEGINNER_TAB,
        chordSize: Number.isFinite(n.tab.chordSize) ? n.tab.chordSize : 1,
        chordIndex: Number.isFinite(n.tab.chordIndex) ? n.tab.chordIndex : 0,
        isChordTone: Boolean(n.tab.isChordTone) || (Number.isFinite(n.tab.chordSize) && n.tab.chordSize > 1),
      }
      : inferredTabs[0] || null;

    return {
      note: canonicalNoteName(n.note),
      start,
      duration,
      end: start + duration,
      midi,
      freq: midiToFrequency(midi),
      tab: preferredTab,
      tabAlternatives: inferredTabs,
      index: idx,
    };
  });

  notes.sort((a, b) => a.start - b.start);
  notes.forEach((note, index) => {
    note.index = index;
  });
  assignOnsetWindows(notes);

  return {
    name: piece.name || 'Custom Piece',
    bpm: piece.bpm || 100,
    notes,
    // The last-starting note is not necessarily the last to end.
    totalDuration: notes.reduce((max, note) => Math.max(max, note.end), 0),
    playableCount: notes.filter((note) => !isStepNoteEmptyOrUnmapped(note)).length,
  };
}

// Timed-mode onset tolerance per note (seconds): half the gap to the neighbouring note
// starts (chord tones share a start), clamped to [TIMED_MIN_ONSET_WINDOW_MS, TIMED_ONSET_WINDOW_MS].
export function assignOnsetWindows(notes) {
  const groupStarts = [];
  notes.forEach((note) => {
    if (!groupStarts.length || note.start - groupStarts.at(-1) > CHORD_GROUP_EPSILON_SECONDS) {
      groupStarts.push(note.start);
    }
  });

  let groupIndex = 0;
  notes.forEach((note) => {
    while (groupIndex + 1 < groupStarts.length && groupStarts[groupIndex + 1] <= note.start + 1e-9) {
      groupIndex += 1;
    }
    const prevGap = groupIndex > 0 ? note.start - groupStarts[groupIndex - 1] : Infinity;
    const nextGap = groupIndex + 1 < groupStarts.length ? groupStarts[groupIndex + 1] - note.start : Infinity;
    const halfGap = Math.min(prevGap, nextGap) / 2;
    note.onsetWindow = Math.min(
      TIMED_ONSET_WINDOW_MS / 1000,
      Math.max(TIMED_MIN_ONSET_WINDOW_MS / 1000, halfGap),
    );
  });
}

export function createVirtualNote(noteName) {
  const upperName = canonicalNoteName(noteName);
  const midi = noteNameToMidi(upperName);
  const inferredTabs = tabPositionsForMidi(midi);

  return {
    note: upperName,
    start: 0,
    duration: 1,
    end: 1,
    midi,
    freq: midiToFrequency(midi),
    tab: inferredTabs[0] || null,
    tabAlternatives: inferredTabs,
    index: -1,
  };
}

export function toPieceSnapshot(normalizedPiece) {
  return {
    name: normalizedPiece.name,
    bpm: normalizedPiece.bpm,
    notes: normalizedPiece.notes.map(({ note, start, duration, tab }) => ({ note, start, duration, tab })),
  };
}

export function isStepNoteEmptyOrUnmapped(note) {
  if (!note) return true;
  return !Number.isFinite(note.freq) || !note.tab;
}

export function clampBpm(bpm) {
  const numeric = Number(bpm);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(40, Math.min(240, Math.round(numeric)));
}

// Accepts piece JSON (array or { notes }), optionally in a ```json fence, or raw ASCII tab.
export function parseCustomPieceInput(raw, tabOptions = {}) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Custom piece is empty');
  }

  // Accept pasted markdown code fences like ```json ... ```
  const fencedMatch = trimmed.match(/^```(?:json|text|txt)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const looksLikeJson = /^[[{]/.test(candidate);
  if (!looksLikeJson && countTabLines(candidate) >= 6) {
    return parsePastedTab(candidate, tabOptions);
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
    if (countTabLines(candidate) >= 6) {
      return parsePastedTab(candidate, tabOptions);
    }
    throw new Error(`${lastError?.message || 'Could not parse JSON'} (and no 6-line ASCII tab system was found)`);
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
