import { describe, expect, it } from 'vitest';
import { getInstrument } from '../src/instruments/index.js';
import { noteNameToMidi } from '../src/music.js';
import { handCounts, isTwoHanded, normalizePiece } from '../src/piece.js';
import { createPracticeSession } from '../src/practice/session.js';

const piano = getInstrument('piano');
const midi = (name) => noteNameToMidi(name);

// Steps with both hands: [C4 + C3], [D4], [E4 + A2].
function twoHands() {
  return normalizePiece({
    bpm: 60,
    notes: [
      { note: 'C4', start: 0, duration: 1, hand: 'R', finger: 1 },
      { note: 'D4', start: 1, duration: 1, hand: 'R', finger: 2 },
      { note: 'E4', start: 2, duration: 1, hand: 'R', finger: 3 },
      { note: 'C3', start: 0, duration: 2, hand: 'L', finger: 5 },
      { note: 'A2', start: 2, duration: 1, hand: 'L' },
    ],
  }, piano);
}

const press = (session, name, timeMs) => session.onNoteOn({ midi: midi(name), timeMs });
const release = (session, name, timeMs) => session.onNoteOff({ midi: midi(name), timeMs });

describe('hands in the piece model', () => {
  it('counts notes per hand, treating unlabelled notes as right hand', () => {
    const piece = twoHands();
    expect(handCounts(piece)).toEqual({ R: 3, L: 2 });
    expect(isTwoHanded(piece)).toBe(true);
    const melody = normalizePiece({ notes: [{ note: 'C4', start: 0, duration: 1 }] }, piano);
    expect(isTwoHanded(melody)).toBe(false);
  });
});

describe('practice session with hands: Wait for me', () => {
  it('makes notes that start together in both hands one chord step, all required', () => {
    const session = createPracticeSession({ piece: twoHands(), instrument: piano, mode: 'wait', hands: 'both' });
    session.start(0);
    expect(session.hands).toBe('both');
    expect(session.view(0).current.map((n) => n.note)).toEqual(['C4', 'C3']);
    expect(session.view(0).total).toBe(5);

    press(session, 'C4', 100);
    // Still holding C4 a few frames later: not a wrong attempt at C3, and no hint.
    session.tick(150);
    session.tick(400);
    expect(session.results.map((r) => r.wrongAttempts)).toEqual([0, 0, 0, 0, 0]);
    expect(session.view(400).feedback.tone).toBe('hit');
    expect(session.view(400).target.note).toBe('C3');

    press(session, 'C3', 450);
    expect(session.view(450).current.map((n) => n.note)).toEqual(['D4']);
    release(session, 'C4', 500);
    release(session, 'C3', 500);
    press(session, 'D4', 600);
    // The whole chord at once is also accepted.
    press(session, 'E4', 700);
    press(session, 'A2', 702);
    expect(session.status).toBe('finished');
    expect(session.results.every((r) => r.hit)).toBe(true);
  });

  it('names the hand in the hint for a wrong left-hand note', () => {
    const session = createPracticeSession({ piece: twoHands(), instrument: piano, mode: 'wait', hands: 'both' });
    session.start(0);
    press(session, 'C4', 10);
    press(session, 'C3', 20);
    press(session, 'D4', 30);
    press(session, 'E4', 40);
    // E4 is right; C3 is three keys above the left hand's A2.
    press(session, 'C3', 50);
    const view = session.view(50);
    expect(view.feedback.text).toBe('Left hand: you played C3, aim for A2: three keys to the left');
    expect(view.feedback.icon).toBe('left');
    const a2 = session.results[view.current.find((n) => n.note === 'A2').index];
    expect(a2.wrongAttempts).toBe(1);
    release(session, 'C3', 60);
    press(session, 'A2', 70);
    expect(session.status).toBe('finished');
  });

  it('requires only the right hand when Right is selected, and ignores the left hand', () => {
    const session = createPracticeSession({ piece: twoHands(), instrument: piano, mode: 'wait', hands: 'R' });
    session.start(0);
    expect(session.hands).toBe('R');
    expect(session.view(0).current.map((n) => n.note)).toEqual(['C4']);
    expect(session.view(0).total).toBe(3);
    // Playing the left hand along is fine: not required, not a mistake.
    press(session, 'C3', 5);
    expect(session.results.every((r) => r.wrongAttempts === 0)).toBe(true);
    press(session, 'C4', 10);
    press(session, 'D4', 20);
    press(session, 'E4', 30);
    expect(session.status).toBe('finished');
    const piece = session;
    expect(piece.isActive(twoHands().notes.find((n) => n.note === 'A2'))).toBe(false);
  });

  it('practises the left hand alone, with octave names and no hand prefix', () => {
    const session = createPracticeSession({ piece: twoHands(), instrument: piano, mode: 'wait', hands: 'L' });
    session.start(0);
    expect(session.view(0).current.map((n) => n.note)).toEqual(['C3']);
    press(session, 'C3', 10);
    press(session, 'C3', 20);
    expect(session.view(20).feedback.text).toBe('You played C3, aim for A2: three keys to the left');
    press(session, 'A2', 30);
    expect(session.status).toBe('finished');
    const left = session.results.filter((r) => r.hit).length;
    expect(left).toBe(2);
  });

  it('ignores the hands choice on one-handed pieces', () => {
    const piece = normalizePiece({ notes: [{ note: 'C4', start: 0, duration: 1 }, { note: 'D4', start: 1, duration: 1 }] }, piano);
    const session = createPracticeSession({ piece, instrument: piano, mode: 'wait', hands: 'L' });
    session.start(0);
    expect(session.hands).toBe('both');
    expect(session.view(0).total).toBe(2);
  });
});

describe('practice session with hands: Play along', () => {
  it('judges a two-hand chord as one timing group, key by key', () => {
    const session = createPracticeSession({ piece: twoHands(), instrument: piano, mode: 'play', countInBeats: 0, hands: 'both' });
    session.start(1000);
    press(session, 'C4', 1010);
    for (let t = 1015; t < 1040; t += 5) session.tick(t);
    press(session, 'C3', 1040);
    expect(session.results[0]).toMatchObject({ hit: true, wrongAttempts: 0 });
    expect(session.results[1]).toMatchObject({ hit: true, wrongAttempts: 0 });
    expect(session.results[0].timingMs).toBeCloseTo(10, 6);
    expect(session.results[1].timingMs).toBeCloseTo(40, 6);
    // The chord notes share one onset window.
    const piece = twoHands();
    expect(piece.notes[0].onsetWindow).toBe(piece.notes[1].onsetWindow);
    // D4 on time; at 2 s only the right hand plays: the left hand's A2 is missed.
    press(session, 'D4', 2000);
    press(session, 'E4', 3000);
    for (let t = 3000; t <= 5000; t += 50) session.tick(t);
    expect(session.status).toBe('finished');
    const a2 = piece.notes.findIndex((n) => n.note === 'A2');
    expect(session.results[a2].missed).toBe(true);
  });

  it('judges each MIDI key of a chord by its own press time', () => {
    const session = createPracticeSession({ piece: twoHands(), instrument: piano, mode: 'play', countInBeats: 0, hands: 'both' });
    session.start(1000);
    press(session, 'C4', 1010);
    // The left hand comes in 300 ms late: outside the window, even though C4 was on time.
    press(session, 'C3', 1300);
    expect(session.results[0].hit).toBe(true);
    expect(session.results[1].hit).toBe(false);
  });

  it('never misses the unselected hand and uses the selected hand\'s own timing windows', () => {
    // Left hand in quarter notes, right hand in whole bars.
    const piece = normalizePiece({
      bpm: 60,
      notes: [
        { note: 'C4', start: 0, duration: 2, hand: 'R' },
        { note: 'E4', start: 2, duration: 2, hand: 'R' },
        ...[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25].map((start) => ({ note: 'C3', start, duration: 0.2, hand: 'L' })),
      ],
    }, piano);
    const right = createPracticeSession({ piece, instrument: piano, mode: 'play', countInBeats: 0, hands: 'R' });
    right.start(0);
    press(right, 'C4', 0);
    // 150 ms late: inside the right hand's own window (it has 2 s gaps)…
    press(right, 'E4', 2150);
    for (let t = 2200; t <= 5000; t += 50) right.tick(t);
    expect(right.status).toBe('finished');
    const e4 = piece.notes.findIndex((n) => n.note === 'E4');
    expect(right.results[e4].hit).toBe(true);
    expect(piece.notes.filter((n) => n.hand === 'L').every((n) => !right.results[n.index].missed)).toBe(true);

    // …but outside the shared window when both hands play (the left hand moves every 0.25 s).
    const both = createPracticeSession({ piece, instrument: piano, mode: 'play', countInBeats: 0, hands: 'both' });
    both.start(0);
    press(both, 'E4', 2150);
    expect(both.results[e4].hit).toBe(false);
  });
});

describe('piano hints with hands', () => {
  const target = (name, hand) => normalizePiece({ notes: [{ note: name, start: 0, duration: 1, hand }] }, piano).notes[0];

  it('names the hand and the octave when asked', () => {
    expect(piano.hintFor(target('A2', 'L'), midi('C3'), 0, { hand: 'L', octave: true }).text)
      .toBe('Left hand: you played C3, aim for A2: three keys to the left');
    expect(piano.hintFor(target('E4', 'R'), midi('D4'), 0, { hand: 'R', octave: true }).text)
      .toBe('Right hand: you played D4, aim for E4: two keys to the right');
    expect(piano.hintFor(target('A2', 'L'), midi('A3'), 0, { hand: 'L', octave: true }))
      .toMatchObject({ text: 'Left hand: you played A3, aim for A2: one octave to the left', icon: 'left', tone: 'close' });
  });

  it('keeps the one-hand wording without context', () => {
    expect(piano.hintFor(target('E4'), midi('F4')).text).toBe('You played F, aim for E: the key just to the left');
    expect(piano.hintFor(target('E4'), midi('E5')).text).toBe('Right key, one octave too high');
  });
});
