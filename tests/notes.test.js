import { describe, expect, it } from 'vitest';
import {
  centsDifference,
  frequencyToMidi,
  midiToFrequency,
  midiToNoteName,
  noteNameToMidi,
  normalizePiece,
} from '../src/main.js';

describe('note-name helpers', () => {
  it('maps note names to MIDI numbers', () => {
    expect(noteNameToMidi('E2')).toBe(40);
    expect(noteNameToMidi('A4')).toBe(69);
    expect(noteNameToMidi('C#4')).toBe(61);
    expect(noteNameToMidi('Bb3')).toBe(58);
    expect(noteNameToMidi('e4')).toBe(64);
  });

  it('rejects invalid note names', () => {
    expect(() => noteNameToMidi('H2')).toThrow();
    expect(() => noteNameToMidi('E')).toThrow();
  });

  it('round-trips MIDI and frequency', () => {
    expect(midiToNoteName(40)).toBe('E2');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(frequencyToMidi(82.41)).toBe(40);
  });

  it('computes cents', () => {
    expect(centsDifference(440, 440)).toBe(0);
    expect(centsDifference(880, 440)).toBeCloseTo(1200, 6);
    expect(centsDifference(midiToFrequency(70), midiToFrequency(69))).toBeCloseTo(100, 6);
  });
});

describe('normalizePiece', () => {
  it('sorts notes and infers beginner tab positions', () => {
    const piece = normalizePiece({
      notes: [
        { note: 'A2', start: 1, duration: 1 },
        { note: 'E2', start: 0, duration: 1 },
      ],
    });
    expect(piece.notes.map((n) => n.note)).toEqual(['E2', 'A2']);
    expect(piece.notes[0].tab).toMatchObject({ string: 6, fret: 0 });
    expect(piece.notes[1].tab).toMatchObject({ string: 5, fret: 0 });
  });

  it('rejects empty or malformed pieces', () => {
    expect(() => normalizePiece({ notes: [] })).toThrow();
    expect(() => normalizePiece({ notes: [{ note: 'E2', start: 0, duration: 0 }] })).toThrow();
  });
});
