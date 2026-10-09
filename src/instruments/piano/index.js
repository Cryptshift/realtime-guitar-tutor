// Piano add-on: keyboard view, key placement, hints and microphone hints tuned to the
// piano register. No tuner (pianos are tuned by a technician).
import { pianoHint } from './hints.js';
import { isBlackKey, renderKeyboard } from './keyboard.js';
import { pitchClassName } from '../hintText.js';

const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const MAX_LANES = 14;

function describeNote(note) {
  if (!note) return '';
  const finger = Number.isInteger(note.finger) && note.finger > 0 ? `, finger ${note.finger}` : '';
  const hand = note.hand === 'L' ? ' (left hand)' : '';
  return `${note.note}${finger}${hand}`;
}

export const piano = {
  id: 'piano',
  name: 'Piano',
  kind: 'keyboard',
  description: 'Keyboard, right hand first',
  range: { minMidi: LOWEST, maxMidi: HIGHEST },
  // Beginner pieces sit around middle C; 4096-sample frames keep low notes reliable.
  detector: { minHz: 50, maxHz: 2200, frameSize: 4096 },

  placeNote: (rawNote, midi) => ({
    key: midi >= LOWEST && midi <= HIGHEST ? { midi, isBlack: isBlackKey(midi) } : null,
  }),
  isPlayable: (note) => Boolean(note?.key),
  serializePlacement: () => ({}),

  shortLabel: (note) => (note ? pitchClassName(note.midi) : ''),
  positionText: describeNote,
  describeGroup: (note, group = [note]) => group.map(describeNote).join(' + '),
  describeSlot: (note, group = [note], emptyMessage = '') => ({
    summary: note ? group.map((n) => n.note).join(' + ') : '--',
    hint: note ? describeNote(note) : emptyMessage,
    diagram: '',
  }),
  hintFor: (target, playedMidi, cents, context) => pianoHint(target, playedMidi, context),

  // Note highway: one lane per distinct pitch (high at the top), compressed when a piece
  // uses many pitches; blocks show the key name.
  highwayLayout: (piece) => {
    const pitches = [...new Set((piece?.notes || []).map((n) => n.midi))].sort((a, b) => b - a);
    const lanesNeeded = Math.min(MAX_LANES, Math.max(1, pitches.length));
    const laneIndex = new Map();
    if (pitches.length <= MAX_LANES) {
      pitches.forEach((midi, i) => laneIndex.set(midi, i));
    } else {
      const top = pitches[0];
      const span = Math.max(1, top - pitches.at(-1));
      pitches.forEach((midi) => laneIndex.set(midi, Math.round(((top - midi) / span) * (MAX_LANES - 1))));
    }
    const lanes = Array.from({ length: lanesNeeded }, (_, i) => {
      const midi = [...laneIndex.entries()].find(([, lane]) => lane === i)?.[0];
      return { label: midi === undefined ? '' : `${pitchClassName(midi)}${Math.floor(midi / 12) - 1}` };
    });
    return {
      lanes,
      laneOf: (note) => (laneIndex.has(note?.midi) ? laneIndex.get(note.midi) : -1),
      labelOf: (note) => (note ? pitchClassName(note.midi) : ''),
    };
  },

  view: { title: 'Keyboard', legend: 'Numbers are fingers: 1 thumb … 5 little finger.' },
  renderInstrumentView: (container, context) => renderKeyboard(container, context),

  tuner: null,
  importers: {},
};
