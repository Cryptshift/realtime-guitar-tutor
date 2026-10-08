// Instrument add-on registry. Generic code (piece model, scoring, practice session, audio,
// screens) talks to instruments only through this interface:
//
//   id, name, kind ('fretted' | 'keyboard'), description
//   range: { minMidi, maxMidi }                    playable range in the standard setup
//   detector: { minHz, maxHz, frameSize }          microphone pitch-detector hints
//   placeNote(rawNote, midi) -> object             placement fields merged into the note
//   isPlayable(note) -> boolean                    false = skipped / "unplayable"
//   serializePlacement(note) -> object             placement kept in saved piece JSON
//   annotatePiece?(notes)                          e.g. suggested fingers for a whole piece
//   shortLabel(note), positionText(note)           highway label / "String 3 (G), fret 2"
//   describeGroup(note, group), describeSlot(note, group, empty)
//   hintFor(target, playedMidi, cents) -> { text, icon, tone } | null
//   highwayLayout(piece) -> { lanes: [{ label }], laneOf(note), labelOf(note) }
//   view: { title, legend }
//   renderInstrumentView(container, { current, upcoming, leftHanded, showLabels, pieceRange })
//   tuner: { sets: { key: { label, notes } }, defaultSet } | null
//   importers: { text?: { formatName, canParse, parse }, page?: { defaultMsPerColumn, parse } }
import { bass } from './bass/index.js';
import { guitar } from './guitar/index.js';
import { piano } from './piano/index.js';
import { ukulele } from './ukulele/index.js';

export const INSTRUMENT_ORDER = ['guitar', 'bass', 'ukulele', 'piano'];
export const INSTRUMENTS = { guitar, bass, ukulele, piano };
export const DEFAULT_INSTRUMENT_ID = guitar.id;

export function getInstrument(id = DEFAULT_INSTRUMENT_ID) {
  return INSTRUMENTS[id] || INSTRUMENTS[DEFAULT_INSTRUMENT_ID];
}

export function listInstruments() {
  return INSTRUMENT_ORDER.map((id) => INSTRUMENTS[id]);
}
