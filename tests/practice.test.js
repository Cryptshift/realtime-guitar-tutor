import { describe, expect, it } from 'vitest';
import { getInstrument } from '../src/instruments/index.js';
import { isTwoHanded, normalizePiece } from '../src/piece.js';
import { computeSummary, sectionsFor, starsFor } from '../src/practice/summary.js';
import { BUILT_IN_SONGS } from '../src/songs/catalog.js';
import { DEFAULT_SETTINGS, createStore } from '../src/storage.js';

const fourBars = () => normalizePiece({
  bpm: 60,
  notes: Array.from({ length: 16 }, (_, i) => ({ note: ['C4', 'D4', 'E4', 'F4'][i % 4], start: i, duration: 1 })),
}, getInstrument('piano'));

describe('run summary', () => {
  it('scores accuracy, stars, timing tendency and the trickiest bar', () => {
    const piece = fourBars();
    const results = piece.notes.map((note) => ({ hit: true, timingMs: 40, wrongAttempts: 0 }));
    results[9] = { hit: false, wrongAttempts: 2 };
    results[10] = { hit: false, wrongAttempts: 0, missed: true };
    const summary = computeSummary({ piece, results, mode: 'play', tempoPercent: 70 });
    expect(summary.accuracy).toBeCloseTo(14 / 16, 6);
    expect(summary.stars).toBe(2);
    expect(summary.tendency).toBe('You tend to play 40 ms late');
    expect(summary.trickyBar).toMatchObject({ bar: 3, loop: { start: 8, end: 12 }, tempoPercent: 50 });
    expect(summary.trickyNotes[0]).toMatchObject({ label: 'D4', count: 3 });
    expect(summary.suggestion.loop).toEqual({ start: 8, end: 12 });
  });

  it('suggests a faster tempo after a great run, and wait mode after a poor play-along', () => {
    const piece = fourBars();
    const allHit = piece.notes.map(() => ({ hit: true, timingMs: 0 }));
    expect(computeSummary({ piece, results: allHit, mode: 'wait', tempoPercent: 70 }).suggestion).toMatchObject({ tempoPercent: 80 });
    const poor = piece.notes.map((_, i) => ({ hit: i < 4 }));
    expect(computeSummary({ piece, results: poor, mode: 'play', tempoPercent: 70 }).suggestion).toMatchObject({ mode: 'wait' });
    expect(starsFor(0.49)).toBe(0);
    expect(starsFor(0.9)).toBe(3);
  });

  it('splits a piece into sections of bars', () => {
    expect(sectionsFor(fourBars(), 2).map((s) => s.label)).toEqual(['Bars 1–2', 'Bars 3–4']);
  });
});

describe('local storage', () => {
  const memoryStorage = () => {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  };

  it('falls back to defaults when storage is missing or broken', () => {
    expect(createStore(undefined).loadSettings()).toEqual({ ...DEFAULT_SETTINGS });
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    const store = createStore(broken);
    expect(store.loadSettings().theme).toBe('system');
    expect(store.saveSettings({ theme: 'light' })).toBe(false);
  });

  it('keeps settings, user songs, best scores and history', () => {
    const store = createStore(memoryStorage());
    store.saveSettings({ ...store.loadSettings(), instrument: 'piano', onboarded: true });
    expect(store.loadSettings()).toMatchObject({ instrument: 'piano', onboarded: true, theme: 'system' });

    store.saveUserSong({ id: 'a', title: 'A' });
    store.saveUserSong({ id: 'b', title: 'B' });
    store.saveUserSong({ id: 'a', title: 'A2' });
    expect(store.loadUserSongs().map((s) => s.title)).toEqual(['A2', 'B']);

    expect(store.recordRun('a', { accuracy: 0.6, tempoPercent: 70 }).isNewBest).toBe(true);
    expect(store.recordRun('a', { accuracy: 0.5, tempoPercent: 70 }).isNewBest).toBe(false);
    expect(store.recordRun('a', { accuracy: 0.6, tempoPercent: 80 }).isNewBest).toBe(true);
    const progress = store.loadProgress();
    expect(progress.songs.a.plays).toBe(3);
    expect(progress.songs.a.history).toHaveLength(3);
    store.setLastPlayed({ songId: 'a', mode: 'wait' });
    expect(store.loadProgress().lastPlayed).toMatchObject({ songId: 'a', mode: 'wait' });
  });
});

describe('built-in songs', () => {
  it('are all fully playable on their instrument', () => {
    for (const song of BUILT_IN_SONGS) {
      const piece = normalizePiece(song.piece, getInstrument(song.instrument));
      expect(piece.playableCount, song.id).toBe(piece.notes.length);
    }
  });

  it('include the five piano starter pieces with fingering where given', () => {
    const piano = BUILT_IN_SONGS.filter((s) => s.instrument === 'piano').map((s) => s.title);
    expect(piano).toEqual([
      'Twinkle Twinkle Little Star', 'Mary Had a Little Lamb', 'Ode to Joy', 'Für Elise (opening)', 'Minuet in G (opening)',
    ]);
    const ode = BUILT_IN_SONGS.find((s) => s.id === 'piano-ode').piece.notes;
    expect(ode.slice(0, 4).map((n) => n.finger)).toEqual([3, 3, 4, 5]);
  });
});

describe('per-song hands choice', () => {
  const memoryStorage = () => {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  };

  it('remembers the hands choice per song and forgets it with the song', () => {
    const store = createStore(memoryStorage());
    expect(store.loadSongPrefs('piano-ode')).toEqual({});
    store.saveSongPrefs('piano-ode', { hands: 'L' });
    store.saveSongPrefs('user-1', { hands: 'R' });
    expect(store.loadSongPrefs('piano-ode')).toEqual({ hands: 'L' });
    expect(store.loadSongPrefs('user-1')).toEqual({ hands: 'R' });
    store.saveSongPrefs('piano-ode', { hands: 'both' });
    expect(store.loadSongPrefs('piano-ode').hands).toBe('both');

    store.saveUserSong({ id: 'user-1', title: 'Mine' });
    store.deleteUserSong('user-1');
    expect(store.loadSongPrefs('user-1')).toEqual({});
    expect(createStore(undefined).loadSongPrefs('x')).toEqual({});
  });

  it('keeps one-hand runs in the history without making them the best', () => {
    const store = createStore(memoryStorage());
    expect(store.recordRun('song', { accuracy: 0.7, hands: 'both' }).isNewBest).toBe(true);
    expect(store.recordRun('song', { accuracy: 1, hands: 'L' }).isNewBest).toBe(false);
    const entry = store.loadProgress().songs.song;
    expect(entry.best.accuracy).toBe(0.7);
    expect(entry.history[0]).toMatchObject({ accuracy: 1, hands: 'L' });
  });
});

describe('run summary with two hands', () => {
  // Bar of right-hand quarter notes over left-hand half notes, four bars.
  const twoHands = () => normalizePiece({
    bpm: 60,
    notes: [
      ...Array.from({ length: 16 }, (_, i) => ({ note: ['E4', 'D4', 'C4', 'D4'][i % 4], start: i, duration: 1, hand: 'R' })),
      ...Array.from({ length: 8 }, (_, i) => ({ note: i % 2 ? 'G3' : 'C3', start: i * 2, duration: 2, hand: 'L' })),
    ],
  }, getInstrument('piano'));

  it('gives the accuracy per hand and suggests the weaker hand alone', () => {
    const piece = twoHands();
    const results = piece.notes.map((note) => ({ hit: note.hand === 'R' || note.start < 8, wrongAttempts: 0 }));
    const summary = computeSummary({ piece, results, mode: 'wait', tempoPercent: 70, hands: 'both' });
    expect(summary.byHand.R).toMatchObject({ notes: 16, hits: 16, accuracy: 1 });
    expect(summary.byHand.L).toMatchObject({ notes: 8, hits: 4, accuracy: 0.5 });
    expect(summary.accuracy).toBeCloseTo(20 / 24, 6);
    expect(summary.weakerHand).toBe('L');
    expect(summary.suggestion).toMatchObject({ hands: 'L', mode: 'wait' });
    expect(summary.suggestion.text).toBe('Your left hand is behind (50%, against 100%). Practice the left hand alone in "Wait for me", then play both hands again.');
  });

  it('scores only the practised hand, and then suggests both hands together', () => {
    const piece = twoHands();
    // Left-hand notes have no results at all when only the right hand was practised.
    const results = piece.notes.map((note) => (note.hand === 'R' ? { hit: true } : { hit: false }));
    const summary = computeSummary({ piece, results, mode: 'wait', tempoPercent: 70, hands: 'R' });
    expect(summary).toMatchObject({ notes: 16, hits: 16, accuracy: 1, byHand: null, hands: 'R', weakerHand: null });
    expect(summary.suggestion).toMatchObject({ hands: 'both' });
    expect(summary.suggestion.text).toBe('Your right hand has it. Now try both hands together.');
  });

  it('leaves one-handed pieces as before', () => {
    const piece = fourBars();
    const summary = computeSummary({ piece, results: piece.notes.map(() => ({ hit: true })), mode: 'wait', tempoPercent: 70, hands: 'L' });
    expect(summary).toMatchObject({ notes: 16, byHand: null, hands: 'both' });
  });
});

describe('built-in two-handed songs', () => {
  it('give Twinkle and Ode to Joy (piano) a left hand, one level up', () => {
    for (const id of ['piano-twinkle', 'piano-ode']) {
      const song = BUILT_IN_SONGS.find((s) => s.id === id);
      const piece = normalizePiece(song.piece, getInstrument('piano'));
      expect(isTwoHanded(piece), id).toBe(true);
      expect(song.difficulty, id).toBe('easy');
      const left = piece.notes.filter((n) => n.hand === 'L');
      // Root notes in five-finger C position, on beats 1 and 3, as long as the right hand.
      expect(left.every((n) => ['C3', 'F3', 'G3'].includes(n.note) && [5, 2, 1].includes(n.finger)), id).toBe(true);
      const beat = (n) => (n.start * song.piece.bpm) / 60;
      expect(left.every((n) => Math.abs(beat(n) - 2 * Math.round(beat(n) / 2)) < 1e-3), id).toBe(true);
      const right = piece.notes.filter((n) => n.hand === 'R');
      expect(right.length, id).toBeGreaterThan(left.length);
      expect(Math.max(...left.map((n) => n.end))).toBeCloseTo(Math.max(...right.map((n) => n.end)), 1);
    }
    expect(isTwoHanded(normalizePiece(BUILT_IN_SONGS.find((s) => s.id === 'piano-mary').piece, getInstrument('piano')))).toBe(false);
  });
});

describe('weaker hand', () => {
  it('is only named when it clearly trails', () => {
    const piece = normalizePiece({
      bpm: 60,
      notes: [
        ...Array.from({ length: 14 }, (_, i) => ({ note: 'E4', start: i, duration: 1, hand: 'R' })),
        ...Array.from({ length: 8 }, (_, i) => ({ note: 'C3', start: i * 2, duration: 2, hand: 'L' })),
      ],
    }, getInstrument('piano'));
    // Right hand 13 of 14 (93%), left hand 8 of 8: close enough, no hand to single out.
    let missed = false;
    const results = piece.notes.map((note) => {
      if (note.hand === 'R' && !missed) {
        missed = true;
        return { hit: false, missed: true };
      }
      return { hit: true, timingMs: 0 };
    });
    const summary = computeSummary({ piece, results, mode: 'play', tempoPercent: 100, hands: 'both' });
    expect(summary.byHand.R.accuracy).toBeCloseTo(13 / 14, 6);
    expect(summary.weakerHand).toBeNull();
    expect(summary.suggestion.hands).toBeUndefined();
  });
});
