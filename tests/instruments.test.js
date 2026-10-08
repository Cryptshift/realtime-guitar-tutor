import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, getInstrument, listInstruments } from '../src/instruments/index.js';
import { noteNameToMidi } from '../src/music.js';
import { createVirtualNote, normalizePiece, parseCustomPieceInput, toPieceSnapshot } from '../src/piece.js';

// A stand-in for a future instrument: proves the generic piece model doesn't assume guitar.
const keyboard = {
  id: 'test-keyboard',
  name: 'Test keyboard',
  range: { minMidi: 21, maxMidi: 108 },
  detector: { minHz: 25, maxHz: 4200, frameSize: 4096 },
  placeNote: (raw, midi) => ({ key: midi >= 21 && midi <= 108 ? midi - 20 : null }),
  isPlayable: (note) => note.key !== null,
  serializePlacement: (note) => ({ key: note.key }),
};

describe('instrument registry', () => {
  it('defaults to the guitar', () => {
    expect(DEFAULT_INSTRUMENT_ID).toBe('guitar');
    expect(getInstrument()).toBe(INSTRUMENTS.guitar);
    expect(getInstrument('unknown')).toBe(INSTRUMENTS.guitar);
  });

  it('guitar implements the instrument interface', () => {
    const guitar = getInstrument('guitar');
    expect(guitar.range).toEqual({ minMidi: 40, maxMidi: 88 });
    expect(guitar.detector.minHz).toBeLessThan(guitar.detector.maxHz);
    for (const hook of ['placeNote', 'isPlayable', 'serializePlacement', 'describeGroup', 'describeSlot', 'renderInstrumentView']) {
      expect(typeof guitar[hook], hook).toBe('function');
    }
    expect(Object.keys(guitar.tuner.sets)).toContain(guitar.tuner.defaultSet);
    expect(typeof guitar.importers.text.parse).toBe('function');
    expect(typeof guitar.importers.page.parse).toBe('function');
  });

  it('guitar slot text describes string and fret', () => {
    const guitar = getInstrument('guitar');
    const piece = normalizePiece({ notes: [{ note: 'G3', start: 0, duration: 1 }] });
    const slot = guitar.describeSlot(piece.notes[0], piece.notes, 'empty');
    expect(slot.summary).toBe('G3 · S3 F0');
    expect(slot.diagram.split('\n')[2]).toBe('G|---0--|');
    expect(guitar.describeGroup(piece.notes[0], piece.notes)).toBe('S3 F0 (G3)');
  });
});

describe('piece model with a non-guitar instrument', () => {
  it('uses the instrument for placement, playability and serialization', () => {
    const piece = normalizePiece({
      notes: [
        { note: 'A0', start: 0, duration: 1 },
        { note: 'C8', start: 1, duration: 1 },
        { note: 'C9', start: 2, duration: 1 },
      ],
    }, keyboard);
    expect(piece.notes.map((n) => n.key)).toEqual([1, 88, null]);
    expect(piece.notes.map((n) => n.playable)).toEqual([true, true, false]);
    expect(piece.playableCount).toBe(2);
    expect(piece.notes[0].tab).toBeUndefined();
    expect(toPieceSnapshot(piece, keyboard).notes[0]).toEqual({ note: 'A0', start: 0, duration: 1, key: 1 });
    expect(createVirtualNote('A0', keyboard)).toMatchObject({ key: 1, playable: true });
  });

  it('only offers text import when the instrument has a text importer', () => {
    expect(() => parseCustomPieceInput('e|--0--|', {}, keyboard)).toThrow();
    expect(parseCustomPieceInput('[{"note":"A0","start":0,"duration":1}]', {}, keyboard).notes).toHaveLength(1);
  });
});

describe('instrument add-ons', () => {
  const positions = (instrument, name) => instrument.layout.positionsFor(noteNameToMidi(name))
    .map((p) => `${p.string}:${p.fret}`);

  it('registers guitar, bass, ukulele and piano in order', () => {
    expect(listInstruments().map((i) => i.id)).toEqual(['guitar', 'bass', 'ukulele', 'piano']);
    expect(getInstrument('piano').tuner).toBeNull();
    expect(getInstrument('ukulele').tuner.sets.standard.notes).toEqual(['G4', 'C4', 'E4', 'A4']);
  });

  it('maps the re-entrant ukulele (high G on string 4)', () => {
    const uke = getInstrument('ukulele');
    expect(positions(uke, 'G4')[0]).toBe('4:0');
    expect(positions(uke, 'C4')).toEqual(['3:0']);
    expect(positions(uke, 'D4')).toEqual(['3:2']);
    expect(positions(uke, 'A4')[0]).toBe('1:0');
    expect(positions(uke, 'F4')[0]).toBe('2:1');
    expect(positions(uke, 'G3')).toEqual([]);
    const piece = normalizePiece({ notes: [{ note: 'C4', start: 0, duration: 1 }, { note: 'B4', start: 1, duration: 1 }] }, uke);
    expect(piece.notes.map((n) => [n.tab.string, n.tab.fret, n.finger])).toEqual([[3, 0, 0], [1, 2, 2]]);
  });

  it('maps the bass', () => {
    const bass = getInstrument('bass');
    expect(positions(bass, 'E1')).toEqual(['4:0']);
    expect(positions(bass, 'C2')[0]).toBe('3:3');
    expect(bass.detector.minHz).toBeLessThan(41);
  });

  it('places piano keys and rejects notes off the keyboard', () => {
    const piano = getInstrument('piano');
    const piece = normalizePiece({ notes: [
      { note: 'C4', start: 0, duration: 1, finger: 1, hand: 'R' },
      { note: 'C#4', start: 1, duration: 1 },
      { note: 'C9', start: 2, duration: 1 },
    ] }, piano);
    expect(piece.notes[0].key).toEqual({ midi: 60, isBlack: false });
    expect(piece.notes[1].key.isBlack).toBe(true);
    expect(piece.notes[2].playable).toBe(false);
    expect(piece.notes[0]).toMatchObject({ finger: 1, hand: 'R' });
    expect(toPieceSnapshot(piece, piano).notes[0]).toEqual({ note: 'C4', start: 0, duration: 1, hand: 'R', finger: 1 });
  });

  it('suggests fretting fingers by position', () => {
    const piece = normalizePiece({ notes: [
      { note: 'E4', start: 0, duration: 1 },
      { note: 'F4', start: 1, duration: 1 },
      { note: 'G4', start: 2, duration: 1 },
      { note: 'D4', start: 3, duration: 1, tab: { string: 2, fret: 3 } },
      { note: 'A4', start: 4, duration: 1, tab: { string: 1, fret: 5 } },
      { note: 'B4', start: 5, duration: 1, tab: { string: 1, fret: 7 } },
    ] });
    expect(piece.notes.map((n) => n.finger)).toEqual([0, 1, 3, 3, 3, 3]);
  });

  it('lays out the note highway per instrument', () => {
    const guitarLayout = getInstrument('guitar').highwayLayout();
    const piece = normalizePiece({ notes: [{ note: 'G3', start: 0, duration: 1 }] });
    expect(guitarLayout.lanes.map((l) => l.label)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
    expect(guitarLayout.laneOf(piece.notes[0])).toBe(2);
    expect(guitarLayout.labelOf(piece.notes[0])).toBe('0');

    const piano = getInstrument('piano');
    const melody = normalizePiece({ notes: ['E4', 'D4', 'C4', 'D4', 'E4'].map((note, i) => ({ note, start: i, duration: 1 })) }, piano);
    const pianoLayout = piano.highwayLayout(melody);
    expect(pianoLayout.lanes.map((l) => l.label)).toEqual(['E4', 'D4', 'C4']);
    expect(pianoLayout.laneOf(melody.notes[2])).toBe(2);
    expect(pianoLayout.labelOf(melody.notes[0])).toBe('E');
  });
});

describe('instrument hints', () => {
  const guitar = getInstrument('guitar');
  const piano = getInstrument('piano');
  const target = (instrument, name) => normalizePiece({ notes: [{ note: name, start: 0, duration: 1 }] }, instrument).notes[0];

  it('speaks frets for fretted instruments', () => {
    const e4 = target(guitar, 'E4');
    expect(guitar.hintFor(e4, noteNameToMidi('F4'), 0).text).toBe('You played F, aim for E: one fret lower');
    expect(guitar.hintFor(e4, noteNameToMidi('D4'), 0).text).toBe('You played D, aim for E: two frets higher');
    expect(guitar.hintFor(e4, noteNameToMidi('E4'), 30).text).toBe('A little sharp');
    expect(guitar.hintFor(e4, noteNameToMidi('E4'), 3)).toBeNull();
    expect(guitar.hintFor(e4, noteNameToMidi('E3'), 0).text).toBe('Right note, one octave too low');
    expect(guitar.hintFor(e4, noteNameToMidi('C5'), 0).text).toBe('You played C, aim for E (open string 1)');
  });

  it('speaks keys for the piano', () => {
    const e4 = target(piano, 'E4');
    expect(piano.hintFor(e4, noteNameToMidi('F4')).text).toBe('You played F, aim for E: the key just to the left');
    expect(piano.hintFor(e4, noteNameToMidi('C4')).text).toBe('You played C, aim for E: four keys to the right');
    expect(piano.hintFor(e4, noteNameToMidi('E5')).text).toBe('Right key, one octave too high');
    expect(piano.hintFor(e4, noteNameToMidi('E4') + 0.3)).toBeNull();
  });
});
