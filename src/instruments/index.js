// Instrument registry. Generic code (piece model, scoring, timeline, audio, rendering)
// talks to the active instrument only through this interface:
//
//   id, name
//   range: { minMidi, maxMidi }                 playable range in standard setup
//   detector: { minHz, maxHz, frameSize }       pitch-detector hints
//   placeNote(rawNote, midi) -> object          instrument placement fields merged into the note
//   isPlayable(note) -> boolean                 false = skipped / "unplayable"
//   serializePlacement(note) -> object          placement fields kept in piece JSON
//   describeGroup(note, group) -> string        timeline label
//   describeSlot(note, group, empty) -> { summary, hint, diagram }
//   view: { title, legend }
//   renderInstrumentView(container, { current, upcoming }) -> { target, hint, legend, next }
//   tuner?: { sets: { key: { label, notes } }, defaultSet }
//   importers?: { text?: { canParse, parse }, page?: { defaultMsPerColumn, parse } }
import { guitar } from './guitar/index.js';

export const INSTRUMENTS = { [guitar.id]: guitar };
export const DEFAULT_INSTRUMENT_ID = guitar.id;

export function getInstrument(id = DEFAULT_INSTRUMENT_ID) {
  return INSTRUMENTS[id] || INSTRUMENTS[DEFAULT_INSTRUMENT_ID];
}
