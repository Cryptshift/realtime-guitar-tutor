import { describe, expect, it } from 'vitest';
import { fitKeyboard, keyBadge, maxWhiteKeys, renderKeyboard, whiteKeysIn } from '../src/instruments/piano/keyboard.js';
import { getInstrument } from '../src/instruments/index.js';
import { noteNameToMidi } from '../src/music.js';
import { normalizePiece } from '../src/piece.js';

const piano = getInstrument('piano');
const m = (name) => noteNameToMidi(name);
const note = (name, hand, finger) => normalizePiece({ notes: [{ note: name, start: 0, duration: 1, hand, finger }] }, piano).notes[0];
const range = (low, high) => ({ minMidi: m(low), maxMidi: m(high) });
const inSections = (layout, midi) => layout.sections.some((s) => midi >= s.low && midi <= s.high);

describe('keyboard fit', () => {
  it('shows the whole piece in whole octaves when it fits, wider with both hands', () => {
    const right = fitKeyboard({ pieceRange: range('E4', 'G5'), maxWhites: 52 });
    expect(right).toMatchObject({ mode: 'piece', sections: [{ low: m('C4'), high: m('B5') }] });
    const both = fitKeyboard({ pieceRange: range('C3', 'G5'), maxWhites: 52 });
    expect(both.sections).toEqual([{ low: m('C3'), high: m('B5') }]);
    expect(whiteKeysIn(right.sections[0])).toBe(14);
    expect(whiteKeysIn(both.sections[0])).toBe(21);
  });

  it('keeps keys readable on a phone: at most one white key per 22 px', () => {
    expect(maxWhiteKeys(348)).toBe(15);
    expect(maxWhiteKeys(1380)).toBe(52);
    expect(maxWhiteKeys(0)).toBe(52);
  });

  it('splits a wide two-hand passage into a left and a right section on a phone', () => {
    const current = [note('C2', 'L', 5), note('E5', 'R', 3)];
    const focus = [note('G2', 'L', 1), note('G5', 'R', 5), note('C6', 'R', 5)];
    const layout = fitKeyboard({ pieceRange: range('C2', 'C6'), current, focus, maxWhites: 15 });
    expect(layout.mode).toBe('window');
    expect(layout.sections).toHaveLength(2);
    const [left, right] = layout.sections;
    expect(left.high).toBeLessThan(right.low);
    expect(whiteKeysIn(left) + whiteKeysIn(right)).toBeLessThanOrEqual(15);
    for (const n of [...current, ...focus]) expect(inSections(layout, n.midi), n.note).toBe(true);
  });

  it('shows one window when the notes in play fit, and keeps it while they stay inside', () => {
    const first = fitKeyboard({ pieceRange: range('C2', 'C6'), current: [note('C4', 'R'), note('A3', 'L')], focus: [note('E4', 'R')], maxWhites: 15 });
    expect(first.sections).toHaveLength(1);
    expect(whiteKeysIn(first.sections[0])).toBe(15);
    const next = fitKeyboard({ pieceRange: range('C2', 'C6'), current: [note('D4', 'R')], focus: [], maxWhites: 15, previous: first });
    expect(next).toBe(first);
    const moved = fitKeyboard({ pieceRange: range('C2', 'C6'), current: [note('C6', 'R')], focus: [], maxWhites: 15, previous: first });
    expect(moved).not.toBe(first);
    expect(inSections(moved, m('C6'))).toBe(true);
  });
});

describe('keyboard view with hands', () => {
  it('badges keys with hand and finger, and hatches the left hand', () => {
    expect(keyBadge(note('C3', 'L', 5), true)).toBe('L5');
    expect(keyBadge(note('E4', 'R', 2), true)).toBe('R2');
    expect(keyBadge(note('E4', 'R'), true)).toBe('R');
    expect(keyBadge(note('E4', 'R', 2), false)).toBe('2');

    const container = { clientWidth: 1200, innerHTML: '' };
    const group = [note('E4', 'R', 2), note('C3', 'L', 5)];
    const texts = renderKeyboard(container, {
      current: { note: group[0], group }, upcoming: { note: note('F4', 'R', 3), group: [note('F4', 'R', 3)] },
      pieceRange: range('C3', 'G4'), twoHanded: true,
    });
    expect(container.innerHTML).toContain('>R2</text>');
    expect(container.innerHTML).toContain('>L5</text>');
    expect(container.innerHTML).toContain('class="pk-left"');
    expect(container.innerHTML).toContain('pk-white pk-current');
    expect(texts.caption).toBe('Play E4 (right hand, finger 2) + C3 (left hand, finger 5)');
  });
});
