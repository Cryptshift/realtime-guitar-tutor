import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTRUMENT_ID, INSTRUMENTS, getInstrument } from '../src/instruments/index.js';
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
