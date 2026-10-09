// Hand assignment for piano MIDI imports. All files are synthetic, written byte by byte.
import { describe, expect, it } from 'vitest';
import { describeMidiTracks, isSingleLine, midiToHandsPiece, planHands, splitHands } from '../src/import/midiHands.js';
import { defaultMidiTrack, midiTrackToPiece, parseMidiFile } from '../src/import/midiFile.js';
import { getInstrument } from '../src/instruments/index.js';
import { noteNameToMidi } from '../src/music.js';
import { isTwoHanded, normalizePiece } from '../src/piece.js';
import { meta, trackFromNotes, writeMidi } from './helpers/midiWriter.js';

const Q = 480;
const m = (name) => noteNameToMidi(name);
// [name, beat, beats] -> notes in ticks.
const notes = (list) => list.map(([name, beat, beats = 1]) => ({ midi: m(name), start: Math.round(beat * Q), length: Math.round(beats * Q) }));

function twoTrackFile({ rightName = 'Piano', leftName = 'Piano', withDrums = true, extra = [] } = {}) {
  return writeMidi({
    ticksPerQuarter: Q,
    tracks: [
      [{ delta: 0, bytes: meta.name('Tempo') }, { delta: 0, bytes: meta.tempo(90) }, { delta: 0, bytes: meta.end() }],
      // Left hand first in the file: the default must come from pitch, not order.
      trackFromNotes({ name: leftName, channel: 1, notes: notes([['C3', 0, 2], ['G2', 2, 2], ['F2', 4, 2], ['C3', 6, 2]]) }),
      trackFromNotes({ name: rightName, notes: notes([['E4', 0], ['D4', 1], ['C4', 2], ['D4', 3], ['E4', 4], ['E4', 5], ['E4', 6, 2]]) }),
      ...extra,
      ...(withDrums ? [trackFromNotes({ name: 'Drums', channel: 9, notes: notes([['C2', 0], ['C2', 1], ['C2', 2], ['C2', 3]]) })] : []),
    ],
  });
}

describe('MIDI tracks to hands', () => {
  it('lists tracks with note counts and ranges, and defaults the higher track to the right hand', () => {
    const parsed = parseMidiFile(twoTrackFile());
    const tracks = describeMidiTracks(parsed);
    expect(tracks.map((t) => [t.index, t.count, t.range, t.isDrums])).toEqual([
      [1, 4, 'F2–C3', false],
      [2, 7, 'C4–E4', false],
      [3, 4, 'C2–C2', true],
    ]);
    const plan = planHands(parsed);
    expect(plan.kind).toBe('tracks');
    expect(plan.assignments).toEqual({ 1: 'L', 2: 'R', 3: 'ignore' });
  });

  it('builds a piece with a hand on every note, and follows reassignments', () => {
    const parsed = parseMidiFile(twoTrackFile());
    const raw = midiToHandsPiece(parsed, { assignments: planHands(parsed).assignments, quantize: '1/16' });
    expect(raw.notes).toHaveLength(11);
    expect(raw.notes.every((n) => n.hand === 'R' || n.hand === 'L')).toBe(true);
    expect(raw.notes.filter((n) => n.hand === 'L').map((n) => n.note)).toEqual(['C3', 'G2', 'F2', 'C3']);
    expect(raw).toMatchObject({ bpm: 90, instrument: 'piano' });
    const piece = normalizePiece(raw, getInstrument('piano'));
    expect(isTwoHanded(piece)).toBe(true);
    // Both hands start at 0: one chord step.
    expect(piece.notes.slice(0, 2).map((n) => [n.note, n.hand])).toEqual([['E4', 'R'], ['C3', 'L']]);

    const swapped = midiToHandsPiece(parsed, { assignments: { 1: 'R', 2: 'ignore', 3: 'ignore' } });
    expect(swapped.notes.map((n) => n.hand)).toEqual(['R', 'R', 'R', 'R']);
    expect(swapped.name).toBe('Piano');
    expect(() => midiToHandsPiece(parsed, { assignments: { 1: 'ignore', 2: 'ignore' } })).toThrow(/at least one track/);
  });

  it('uses track names when they say which hand, and puts extra tracks with the nearer hand', () => {
    const named = parseMidiFile(twoTrackFile({ rightName: 'Piano LH', leftName: 'Piano RH', withDrums: false }));
    expect(planHands(named).assignments).toEqual({ 1: 'R', 2: 'L' });

    const inner = trackFromNotes({ name: 'Inner voice', channel: 2, notes: notes([['G3', 0, 4], ['A3', 4, 4]]) });
    const three = parseMidiFile(twoTrackFile({ withDrums: false, extra: [inner] }));
    expect(planHands(three).assignments).toEqual({ 1: 'L', 2: 'R', 3: 'R' });
  });

  it('keeps the busiest-track default and single-track conversion for one-line imports', () => {
    const parsed = parseMidiFile(twoTrackFile());
    expect(defaultMidiTrack(parsed)).toBe(2);
    const raw = midiTrackToPiece(parsed, { quantize: '1/8', instrument: 'guitar' });
    expect(raw.notes.map((n) => n.note)).toEqual(['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4']);
    expect(raw.notes.every((n) => n.hand === undefined)).toBe(true);
  });
});

describe('splitting one track between the hands', () => {
  // One track with both hands. The right hand dips to B3 (below middle C) while the left
  // hand holds a low C2, and the left hand climbs to D4 (above middle C) under a high
  // melody: a fixed split at middle C would get both wrong.
  const left = [['C3', 0, 1], ['G3', 0, 1], ['E3', 1, 1], ['G3', 1, 1], ['C2', 2, 4], ['F3', 6, 1], ['A3', 6, 1], ['D4', 7, 1]];
  const right = [['E5', 0], ['D5', 1], ['C5', 2], ['B4', 3], ['B3', 4], ['C4', 5], ['A5', 6], ['A5', 7]];
  const file = () => writeMidi({ ticksPerQuarter: Q, tracks: [trackFromNotes({ name: 'Piano', notes: notes([...left, ...right]) })] });

  it('assigns each note to the hand that plays it', () => {
    const parsed = parseMidiFile(file());
    const track = parsed.tracks[0];
    const hands = splitHands(track.notes);
    const byName = (hand) => track.notes.filter((n, i) => hands[i] === hand).map((n) => `${n.start / (60 / 120)}:${n.midi}`).sort();
    const expected = (list) => notes(list).map((n) => `${n.start / Q}:${n.midi}`).sort();
    expect(byName('L')).toEqual(expected(left));
    expect(byName('R')).toEqual(expected(right));
  });

  it('keeps each hand contiguous in every slice and within an octave and a half', () => {
    // Wide random-ish chords: three-note left-hand chords under three-note right-hand chords.
    const chords = [];
    const roots = [36, 41, 43, 38, 45, 40, 36, 43];
    roots.forEach((root, bar) => {
      [root, root + 7, root + 12].forEach((midi) => chords.push({ midi, start: bar * Q * 2, length: Q * 2 }));
      [root + 28, root + 31, root + 36].forEach((midi) => chords.push({ midi, start: bar * Q * 2, length: Q }));
      [root + 26, root + 33].forEach((midi) => chords.push({ midi, start: bar * Q * 2 + Q, length: Q }));
    });
    const parsed = parseMidiFile(writeMidi({ ticksPerQuarter: Q, tracks: [trackFromNotes({ notes: chords })] }));
    const track = parsed.tracks[0];
    const hands = splitHands(track.notes);
    const byStart = new Map();
    track.notes.forEach((note, i) => {
      const slice = byStart.get(note.startTick) || { L: [], R: [] };
      slice[hands[i]].push(note.midi);
      byStart.set(note.startTick, slice);
    });
    for (const slice of byStart.values()) {
      if (slice.L.length && slice.R.length) expect(Math.max(...slice.L)).toBeLessThan(Math.min(...slice.R));
      for (const part of [slice.L, slice.R]) if (part.length) expect(Math.max(...part) - Math.min(...part)).toBeLessThanOrEqual(18);
    }
    expect(hands.filter((h) => h === 'L')).toHaveLength(24);
  });

  it('plans a split for a two-hand track and shows the count per hand', () => {
    const plan = planHands(parseMidiFile(file()));
    expect(plan.kind).toBe('single');
    expect(plan.assignments).toEqual({ 0: 'split' });
    expect(plan.split).toEqual({ R: 8, L: 8 });
    const raw = midiToHandsPiece(parseMidiFile(file()), { assignments: plan.assignments });
    expect(raw.notes.filter((n) => n.hand === 'L')).toHaveLength(8);
  });

  it('falls back to a split near middle C, and keeps a single melody in one hand', () => {
    // Two lone chords with no history: cut at middle C.
    const chord = [{ midi: m('E3'), start: 0, length: Q }, { midi: m('G3'), start: 0, length: Q },
      { midi: m('E4'), start: 0, length: Q }, { midi: m('G4'), start: 0, length: Q }];
    const parsedChord = parseMidiFile(writeMidi({ ticksPerQuarter: Q, tracks: [trackFromNotes({ notes: chord })] }));
    const chordNotes = parsedChord.tracks[0].notes;
    const chordHands = splitHands(chordNotes);
    expect(Object.fromEntries(chordNotes.map((n, i) => [n.midi, chordHands[i]])))
      .toEqual({ [m('E3')]: 'L', [m('G3')]: 'L', [m('E4')]: 'R', [m('G4')]: 'R' });

    const melody = parseMidiFile(writeMidi({ ticksPerQuarter: Q, tracks: [trackFromNotes({ name: 'Tune', notes: notes(right) })] }));
    expect(isSingleLine(melody.tracks[0].notes)).toBe(true);
    expect(planHands(melody).assignments).toEqual({ 0: 'R' });
    const low = parseMidiFile(writeMidi({ ticksPerQuarter: Q, tracks: [trackFromNotes({ notes: notes([['C2', 0], ['G2', 1], ['E2', 2]]) })] }));
    expect(planHands(low).assignments).toEqual({ 0: 'L' });
  });
});
