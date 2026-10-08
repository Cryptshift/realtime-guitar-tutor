import { describe, expect, it } from 'vitest';
import { getInstrument } from '../src/instruments/index.js';
import { noteNameToMidi } from '../src/music.js';
import { normalizePiece } from '../src/piece.js';
import { createPracticeSession } from '../src/practice/session.js';

const piano = getInstrument('piano');
const guitar = getInstrument('guitar');
const midi = (name) => noteNameToMidi(name);

function makePiece(names, { bpm = 60, instrument = piano, beats = 1, starts = null } = {}) {
  return normalizePiece({
    bpm,
    notes: names.map((note, i) => ({ note, start: starts ? starts[i] : i * beats, duration: beats })),
  }, instrument);
}

// Feeds a steady microphone pitch from `fromMs` to `toMs` every 5 ms (one onset at fromMs).
function strum(session, name, fromMs, toMs, { onset = true } = {}) {
  for (let t = fromMs; t <= toMs; t += 5) {
    session.onPitch({ timeMs: t, midi: midi(name), onsetTimeMs: onset && t === fromMs ? fromMs : null });
  }
}

describe('practice session: Wait for me', () => {
  it('advances on correct MIDI notes and explains wrong ones', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'D4', 'E4']), instrument: piano, mode: 'wait' });
    session.start(0);
    expect(session.status).toBe('ready');
    session.onNoteOn({ midi: midi('C4'), timeMs: 100 });
    session.onNoteOff({ midi: midi('C4'), timeMs: 200 });
    expect(session.status).toBe('running');
    expect(session.view(200).target.note).toBe('D4');

    session.onNoteOn({ midi: midi('C4'), timeMs: 300 });
    const view = session.view(300);
    expect(view.feedback.text).toBe('You played C, aim for D: two keys to the right');
    expect(view.feedback.icon).toBe('right');
    expect(session.results[1].wrongAttempts).toBe(1);
    expect(session.streak).toBe(0);
    session.onNoteOff({ midi: midi('C4'), timeMs: 350 });

    session.onNoteOn({ midi: midi('D4'), timeMs: 400 });
    session.onNoteOn({ midi: midi('E4'), timeMs: 500 });
    expect(session.status).toBe('finished');
    expect(session.results.map((r) => r.hit)).toEqual([true, true, true]);
    expect(session.takeEvents().filter((e) => e.type === 'hit')).toHaveLength(3);
  });

  it('needs a fresh attack for a repeated note (microphone)', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'C4', 'G4'], { instrument: guitar }), instrument: guitar, mode: 'wait' });
    session.start(0);
    strum(session, 'C4', 0, 1500);
    expect(session.results.map((r) => r.hit)).toEqual([true, false, false]);
    expect(session.view(1500).feedback.text).toBe('Play it again');
    strum(session, 'C4', 1600, 1900);
    expect(session.results[1].hit).toBe(true);
    // Too short to count yet.
    strum(session, 'G4', 2000, 2100);
    expect(session.results[2].hit).toBe(false);
    expect(session.view(2100).feedback.text).toBe('Hold it…');
    strum(session, 'G4', 2105, 2300, { onset: false });
    expect(session.status).toBe('finished');
  });

  it('gives fret hints and intonation hints on guitar', () => {
    const session = createPracticeSession({ piece: makePiece(['E4'], { instrument: guitar }), instrument: guitar, mode: 'wait' });
    session.start(0);
    strum(session, 'F4', 0, 200);
    expect(session.view(200).feedback.text).toBe('You played F, aim for E: one fret lower');
    session.onPitch({ timeMs: 400, midi: midi('E4') + 0.45, onsetTimeMs: 400 });
    for (let t = 405; t <= 500; t += 5) session.onPitch({ timeMs: t, midi: midi('E4') + 0.45 });
    expect(session.view(500).feedback.text).toBe('A little sharp');
  });

  it('keeps the praise while the previous note still sounds', () => {
    const session = createPracticeSession({ piece: makePiece(['G4', 'F4']), instrument: piano, mode: 'wait' });
    session.start(0);
    session.onNoteOn({ midi: midi('G4'), timeMs: 100 });
    session.tick(150);
    session.tick(300);
    expect(session.view(300).feedback.tone).toBe('hit');
    expect(session.results[1].wrongAttempts).toBe(0);
  });

  it('loops a section', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'D4', 'E4', 'F4']), instrument: piano, mode: 'wait' });
    session.setLoop(0, { start: 1, end: 3 });
    session.start(0);
    expect(session.view(0).target.note).toBe('D4');
    session.onNoteOn({ midi: midi('D4'), timeMs: 10 });
    session.onNoteOn({ midi: midi('E4'), timeMs: 20 });
    expect(session.laps).toBe(1);
    expect(session.view(30).target.note).toBe('D4');
    expect(session.status).not.toBe('finished');
  });

  it('accepts a whole chord shape from MIDI', () => {
    const piece = normalizePiece({ bpm: 60, notes: [
      { note: 'C4', start: 0, duration: 1 }, { note: 'E4', start: 0, duration: 1 }, { note: 'G4', start: 0, duration: 1 },
      { note: 'F4', start: 1, duration: 1 },
    ] }, piano);
    const session = createPracticeSession({ piece, instrument: piano, mode: 'wait', requireFullShape: true });
    session.start(0);
    expect(session.view(0).current.map((n) => n.note)).toEqual(['C4', 'E4', 'G4']);
    session.onNoteOn({ midi: midi('C4'), timeMs: 10 });
    session.onNoteOn({ midi: midi('E4'), timeMs: 12 });
    expect(session.view(12).target.note).toBe('G4');
    session.onNoteOn({ midi: midi('G4'), timeMs: 14 });
    expect(session.view(14).target.note).toBe('F4');
  });
});

describe('practice session: Play along', () => {
  it('scores timing, misses skipped notes and finishes', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'D4', 'E4']), instrument: piano, mode: 'play', countInBeats: 0 });
    session.start(1000);
    expect(session.status).toBe('running');
    session.onNoteOn({ midi: midi('C4'), timeMs: 1020 });
    expect(session.results[0]).toMatchObject({ hit: true });
    expect(session.results[0].timingMs).toBeCloseTo(20, 6);
    expect(session.view(1020).feedback.detail).toBe('On time');
    // D4 is never played.
    for (let t = 1100; t <= 3000; t += 50) session.tick(t);
    expect(session.results[1].missed).toBe(true);
    session.onNoteOn({ midi: midi('E4'), timeMs: 2950 });
    expect(session.results[2].timingMs).toBeCloseTo(-50, 6);
    expect(session.view(2950).feedback.detail).toBe('50 ms early');
    for (let t = 3000; t <= 4500; t += 50) session.tick(t);
    expect(session.status).toBe('finished');
  });

  it('reports timing in real milliseconds at slower tempo and compensates latency', () => {
    const slow = createPracticeSession({ piece: makePiece(['C4', 'D4']), instrument: piano, mode: 'play', countInBeats: 0, tempoPercent: 50 });
    slow.start(0);
    // D4 is at piece 1.0 s = real 2.0 s at 50 %.
    slow.onNoteOn({ midi: midi('D4'), timeMs: 2040 });
    expect(slow.results[1].timingMs).toBeCloseTo(40, 6);

    const laggy = createPracticeSession({ piece: makePiece(['C4']), instrument: piano, mode: 'play', countInBeats: 0, latencyMs: 100 });
    laggy.start(0);
    laggy.onNoteOn({ midi: midi('C4'), timeMs: 100 });
    expect(laggy.results[0].timingMs).toBeCloseTo(0, 6);
  });

  it('rejects a late attack outside the onset window', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'D4']), instrument: piano, mode: 'play', countInBeats: 0 });
    session.start(0);
    session.onNoteOn({ midi: midi('C4'), timeMs: 400 });
    expect(session.results[0].hit).toBe(false);
  });

  it('does not count the previous note ringing into a new attack as a wrong note', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'G4'], { instrument: guitar }), instrument: guitar, mode: 'play', countInBeats: 0 });
    session.start(0);
    strum(session, 'C4', 0, 1030);
    // New attack at 1.0 s, but the detector still reports C4 for 40 ms.
    session.onPitch({ timeMs: 1035, midi: midi('C4'), onsetTimeMs: 1000 });
    for (let t = 1040; t <= 1045; t += 5) session.onPitch({ timeMs: t, midi: midi('C4') });
    strum(session, 'G4', 1050, 1400, { onset: false });
    expect(session.results[1]).toMatchObject({ hit: true, wrongAttempts: 0 });
  });

  it('counts in, pauses and resumes without losing its place', () => {
    const session = createPracticeSession({ piece: makePiece(['C4', 'D4', 'E4'], { bpm: 120, beats: 0.5 }), instrument: piano, mode: 'play', countInBeats: 4 });
    session.start(0);
    expect(session.status).toBe('countin');
    expect(session.view(100).countInBeat).toBe(4);
    expect(session.view(1700).countInBeat).toBe(1);
    session.tick(2000);
    expect(session.status).toBe('running');
    session.pause(2600);
    expect(session.status).toBe('paused');
    session.start(10000);
    expect(session.status).toBe('countin');
    session.tick(12000);
    expect(session.view(12000).position).toBeCloseTo(0.6, 2);
  });

  it('hits with the microphone when the pitch is held after an on-time attack', () => {
    const session = createPracticeSession({ piece: makePiece(['A3', 'C4'], { instrument: guitar }), instrument: guitar, mode: 'play', countInBeats: 0 });
    session.start(0);
    strum(session, 'A3', 10, 300);
    expect(session.results[0].hit).toBe(true);
    expect(session.results[0].timingMs).toBeCloseTo(10, 6);
  });
});
