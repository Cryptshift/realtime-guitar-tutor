// Instrument-agnostic music helpers: note names <-> MIDI <-> Hz, cents, pitch classes.
export const A4 = 440;

export const A4_MIDI = 69;

export const OCTAVE_FOLD_TOLERANCE_CENTS = 100;

export const NOTE_SEMITONES = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

export function noteNameToMidi(noteName) {
  const normalized = noteName.trim().toUpperCase();
  const match = normalized.match(/^([A-G])([#B]?)(-?\d)$/);
  if (!match) {
    throw new Error(`Invalid note: ${noteName}`);
  }

  const [, letter, accidental, octaveRaw] = match;
  const octave = Number(octaveRaw);
  const letterOffsets = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let semitone = letterOffsets[letter];
  if (accidental === '#') semitone += 1;
  if (accidental === 'B') semitone -= 1;

  return (octave + 1) * 12 + semitone;
}

export function midiToFrequency(midi) {
  return A4 * 2 ** ((midi - A4_MIDI) / 12);
}

export function frequencyToMidi(freq) {
  return Math.round(12 * Math.log2(freq / A4) + A4_MIDI);
}

export function midiToNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// Normalizes user/imported spellings ("bb3", "Bb3", "BB3", " c#4 ") to "Bb3" / "C#4".
// An upper-case "B" accidental is read as flat, matching noteNameToMidi.
export function canonicalNoteName(noteName) {
  const match = String(noteName).trim().match(/^([A-Ga-g])([#bB]?)(-?\d)$/);
  if (!match) {
    throw new Error(`Invalid note: ${noteName}`);
  }
  const [, letter, accidental, octave] = match;
  const accidentalText = accidental === '#' ? '#' : (accidental ? 'b' : '');
  return `${letter.toUpperCase()}${accidentalText}${octave}`;
}

export function centsDifference(actualFreq, targetFreq) {
  return 1200 * Math.log2(actualFreq / targetFreq);
}

// Tuner deviation with octave errors folded away: if the detector locks onto a harmonic
// (or sub-harmonic) that sits within OCTAVE_FOLD_TOLERANCE_CENTS of a whole octave from
// the target, report the deviation from that octave instead of "1200 cents sharp".
// Readings that are far from any octave keep their raw value so very slack/tight strings
// still get the right tighten/loosen direction.
export function tunerCentsFromTarget(detectedFreq, targetFreq) {
  const raw = centsDifference(detectedFreq, targetFreq);
  const octaveShift = Math.round(raw / 1200);
  if (octaveShift === 0) return { cents: raw, octaveShift: 0 };
  const folded = raw - octaveShift * 1200;
  if (Math.abs(folded) <= OCTAVE_FOLD_TOLERANCE_CENTS) {
    return { cents: folded, octaveShift };
  }
  return { cents: raw, octaveShift: 0 };
}

export function parseTuningToken(rawToken) {
  if (!rawToken) return null;
  const cleaned = rawToken
    .trim()
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/[^A-Ga-g0-9#b-]/g, '');
  const match = cleaned.match(/^([A-Ga-g])([#b]?)(-?\d+)?$/);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const octave = typeof match[3] === 'string' ? Number(match[3]) : null;
  if (match[3] && !Number.isFinite(octave)) return null;

  const pitchClass = `${letter}${accidental}`;
  if (!Object.hasOwn(NOTE_SEMITONES, pitchClass)) return null;

  return {
    pitchClass,
    octave,
  };
}

export function midiForPitchClassOctave(pitchClass, octave) {
  if (!Object.hasOwn(NOTE_SEMITONES, pitchClass) || !Number.isFinite(octave)) {
    return null;
  }
  return (octave + 1) * 12 + NOTE_SEMITONES[pitchClass];
}

export function nearestMidiForPitchClass(pitchClass, targetMidi) {
  const semitone = NOTE_SEMITONES[pitchClass];
  if (!Number.isFinite(semitone) || !Number.isFinite(targetMidi)) {
    return null;
  }

  return semitone + (12 * Math.round((targetMidi - semitone) / 12));
}

export function frequencyToFractionalMidi(freq) {
  return 12 * Math.log2(freq / A4) + A4_MIDI;
}
