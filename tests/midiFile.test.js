import { describe, expect, it } from 'vitest';
import { defaultMidiTrack, midiTrackToPiece, parseMidiFile } from '../src/import/midiFile.js';
import { normalizePiece } from '../src/piece.js';
import { getInstrument } from '../src/instruments/index.js';
import { meta, writeMidi } from './helpers/midiWriter.js';

const Q = 480;

function melodyFile() {
  return writeMidi({
    ticksPerQuarter: Q,
    tracks: [
      // Tempo track: 120 BPM, then 60 BPM from beat 4.
      [
        { delta: 0, bytes: meta.name('Conductor') },
        { delta: 0, bytes: meta.tempo(120) },
        { delta: Q * 4, bytes: meta.tempo(60) },
        { delta: 0, bytes: meta.end() },
      ],
      // Melody: E4 D4 C4 (running status, note-on velocity 0 as note-off) then G4 after the
      // tempo change; slightly early start on D4 to exercise quantising.
      [
        { delta: 0, bytes: meta.name('Melody') },
        { delta: 0, bytes: [0x90, 64, 90] },
        { delta: Q, bytes: [64, 0] },
        { delta: 0, bytes: [62, 80] },
        { delta: Q - 20, bytes: [0x80, 62, 0] },
        { delta: 20, bytes: [0x90, 60, 70] },
        { delta: Q * 2, bytes: [60, 0] },
        { delta: 0, bytes: [67, 70] },
        { delta: Q, bytes: [67, 0] },
        { delta: 0, bytes: meta.end() },
      ],
      // Drums on channel 10 (more notes, but should not be the default track).
      [
        ...Array.from({ length: 8 }, () => [
          { delta: 0, bytes: [0x99, 36, 100] },
          { delta: Q / 2, bytes: [0x89, 36, 0] },
        ]).flat(),
        { delta: 0, bytes: meta.end() },
      ],
    ],
  });
}

describe('parseMidiFile', () => {
  it('reads tracks, names, tempo and note timing through tempo changes', () => {
    const parsed = parseMidiFile(melodyFile());
    expect(parsed.format).toBe(1);
    expect(parsed.bpm).toBe(120);
    expect(parsed.tracks.map((t) => t.name)).toEqual(['Conductor', 'Melody', '']);
    const melody = parsed.tracks[1].notes;
    expect(melody.map((n) => n.midi)).toEqual([64, 62, 60, 67]);
    expect(melody[0].start).toBeCloseTo(0, 6);
    expect(melody[1].start).toBeCloseTo(0.5, 6);
    expect(melody[2].start).toBeCloseTo(1.0, 6);
    // G4 starts at beat 4 (2.0 s at 120 BPM) and lasts one beat at 60 BPM.
    expect(melody[3].start).toBeCloseTo(2.0, 6);
    expect(melody[3].duration).toBeCloseTo(1.0, 6);
    expect(parsed.tracks[2].isDrums).toBe(true);
  });

  it('picks the melody track over drums by default', () => {
    expect(defaultMidiTrack(parseMidiFile(melodyFile()))).toBe(1);
  });

  it('converts a track to a piece, optionally quantised', () => {
    const parsed = parseMidiFile(melodyFile());
    const raw = midiTrackToPiece(parsed, { instrument: 'piano' });
    expect(raw).toMatchObject({ name: 'Melody', bpm: 120, instrument: 'piano' });
    expect(raw.notes.map((n) => n.note)).toEqual(['E4', 'D4', 'C4', 'G4']);
    expect(raw.notes[1].duration).toBeCloseTo((Q - 20) / Q / 2, 3);

    const snapped = midiTrackToPiece(parsed, { quantize: '1/8' });
    expect(snapped.notes[1].duration).toBeCloseTo(0.5, 6);

    const piece = normalizePiece(raw, getInstrument('piano'));
    expect(piece.playableCount).toBe(4);
    expect(piece.instrument).toBe('piano');
  });

  it('rejects files that are not MIDI', () => {
    expect(() => parseMidiFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/Not a MIDI file/);
  });
});
