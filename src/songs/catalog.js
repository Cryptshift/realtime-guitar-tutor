// Built-in practice songs. Melodies are traditional or public domain (Twinkle Twinkle,
// Mary Had a Little Lamb, Ode to Joy, Für Elise and the Minuet in G opening phrases); the
// piano versions are right hand only. Finger numbers are given only where the fingering is
// the standard one (five-finger C position, and the usual Für Elise / Minuet openings).

// Builds a raw piece from [noteName | null (rest), beats, finger?] in sequence.
function sequence(steps, bpm) {
  const secondsPerBeat = 60 / bpm;
  let beat = 0;
  const notes = [];
  steps.forEach(([note, beats, finger]) => {
    if (note) {
      const entry = {
        note,
        start: Number((beat * secondsPerBeat).toFixed(4)),
        duration: Number((beats * secondsPerBeat * 0.95).toFixed(4)),
      };
      if (Number.isInteger(finger)) {
        entry.finger = finger;
        entry.hand = 'R';
      }
      notes.push(entry);
    }
    beat += beats;
  });
  return notes;
}

function song({ id, title, instrument, difficulty, bpm, beatsPerBar = 4, steps, transpose = 0 }) {
  const shift = (name) => {
    if (!transpose || !name) return name;
    const match = name.match(/^([A-G][#b]?)(-?\d)$/);
    return `${match[1]}${Number(match[2]) + transpose}`;
  };
  return {
    id,
    title,
    instrument,
    difficulty,
    builtIn: true,
    piece: {
      name: title,
      bpm,
      beatsPerBar,
      instrument,
      notes: sequence(steps.map(([note, beats, finger]) => [shift(note), beats, finger]), bpm),
    },
  };
}

// --- Melodies (quarter note = 1 beat) -------------------------------------------------
const TWINKLE = [
  ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2],
  ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2],
];

// Five-finger C position: C1 D2 E3 F4 G5.
const C_POSITION = { C4: 1, D4: 2, E4: 3, F4: 4, G4: 5 };
const fingered = (steps) => steps.map(([note, beats]) => [note, beats, C_POSITION[note]]);

const MARY = [
  ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 2],
  ['D4', 1], ['D4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['G4', 2],
  ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['E4', 1],
  ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 1], ['C4', 4],
];

const ODE_TO_JOY = [
  ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
  ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2],
  ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
  ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', 0.5], ['C4', 2],
];

// Für Elise opening (sixteenths = 0.5 beat at this tempo); fingers on the first phrase.
const FUR_ELISE = [
  ['E5', 0.5, 5], ['D#5', 0.5, 4], ['E5', 0.5, 5], ['D#5', 0.5, 4], ['E5', 0.5, 5],
  ['B4', 0.5, 2], ['D5', 0.5, 4], ['C5', 0.5, 3], ['A4', 1.5, 1],
  ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1.5],
  ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5], ['C5', 1.5],
  ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5],
  ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 1.5],
  ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1.5],
  ['E4', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 2],
];

// Minuet in G (Petzold), bars 1-8, 3/4; fingers on bars 1-2 (G position).
const MINUET_IN_G = [
  ['D5', 1, 5], ['G4', 0.5, 1], ['A4', 0.5, 2], ['B4', 0.5, 3], ['C5', 0.5, 4],
  ['D5', 1, 5], ['G4', 1, 1], ['G4', 1, 1],
  ['E5', 1], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5],
  ['G5', 1], ['G4', 1], ['G4', 1],
  ['C5', 1], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5],
  ['B4', 1], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5],
  ['F#4', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['G4', 0.5],
  ['A4', 3],
];

// Twelve-bar blues roots in E for bass: two half notes per bar.
const BLUES_ROOTS = [
  ...Array(8).fill(['E1', 2]), ...Array(4).fill(['A1', 2]), ...Array(4).fill(['E1', 2]),
  ['B1', 2], ['B1', 2], ['A1', 2], ['A1', 2], ['E1', 2], ['E1', 2], ['B1', 2], ['B1', 2],
];

export const BUILT_IN_SONGS = [
  // Guitar
  song({
    id: 'guitar-open-strings',
    title: 'Open strings warm-up',
    instrument: 'guitar',
    difficulty: 'beginner',
    bpm: 60,
    steps: [['E2', 2], ['A2', 2], ['D3', 2], ['G3', 2], ['B3', 2], ['E4', 2]],
  }),
  song({ id: 'guitar-mary', title: 'Mary Had a Little Lamb', instrument: 'guitar', difficulty: 'beginner', bpm: 90, steps: MARY }),
  song({ id: 'guitar-twinkle', title: 'Twinkle Twinkle Little Star', instrument: 'guitar', difficulty: 'beginner', bpm: 90, steps: TWINKLE }),
  song({ id: 'guitar-ode', title: 'Ode to Joy', instrument: 'guitar', difficulty: 'easy', bpm: 100, steps: ODE_TO_JOY }),

  // Bass
  song({
    id: 'bass-open-strings',
    title: 'Open strings warm-up',
    instrument: 'bass',
    difficulty: 'beginner',
    bpm: 60,
    steps: [['E1', 2], ['A1', 2], ['D2', 2], ['G2', 2]],
  }),
  song({ id: 'bass-blues-roots', title: '12-bar blues roots in E', instrument: 'bass', difficulty: 'easy', bpm: 90, steps: BLUES_ROOTS }),
  song({ id: 'bass-ode', title: 'Ode to Joy (low)', instrument: 'bass', difficulty: 'easy', bpm: 90, steps: ODE_TO_JOY, transpose: -2 }),

  // Ukulele
  song({
    id: 'ukulele-open-strings',
    title: 'Open strings warm-up',
    instrument: 'ukulele',
    difficulty: 'beginner',
    bpm: 60,
    steps: [['G4', 2], ['C4', 2], ['E4', 2], ['A4', 2]],
  }),
  song({ id: 'ukulele-twinkle', title: 'Twinkle Twinkle Little Star', instrument: 'ukulele', difficulty: 'beginner', bpm: 90, steps: TWINKLE }),
  song({ id: 'ukulele-mary', title: 'Mary Had a Little Lamb', instrument: 'ukulele', difficulty: 'beginner', bpm: 90, steps: MARY }),

  // Piano (right hand)
  song({ id: 'piano-twinkle', title: 'Twinkle Twinkle Little Star', instrument: 'piano', difficulty: 'beginner', bpm: 90, steps: TWINKLE }),
  song({ id: 'piano-mary', title: 'Mary Had a Little Lamb', instrument: 'piano', difficulty: 'beginner', bpm: 90, steps: fingered(MARY) }),
  song({ id: 'piano-ode', title: 'Ode to Joy', instrument: 'piano', difficulty: 'beginner', bpm: 100, steps: fingered(ODE_TO_JOY) }),
  song({ id: 'piano-fur-elise', title: 'Für Elise (opening)', instrument: 'piano', difficulty: 'intermediate', bpm: 70, beatsPerBar: 1.5, steps: FUR_ELISE }),
  song({ id: 'piano-minuet-g', title: 'Minuet in G (opening)', instrument: 'piano', difficulty: 'easy', bpm: 100, beatsPerBar: 3, steps: MINUET_IN_G }),
];

export const DIFFICULTY_LABELS = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate' };
