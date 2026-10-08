import { describe, expect, it } from 'vitest';
import { midiToFrequency, tunerCentsFromTarget } from '../src/main.js';

const E2 = midiToFrequency(40);
const cents = (freq, c) => freq * 2 ** (c / 1200);

describe('tunerCentsFromTarget', () => {
  it('returns the raw deviation near the target', () => {
    const { cents: c, octaveShift } = tunerCentsFromTarget(cents(E2, 3), E2);
    expect(c).toBeCloseTo(3, 6);
    expect(octaveShift).toBe(0);
  });

  it('folds an octave-up (harmonic) reading back onto the target', () => {
    const { cents: c, octaveShift } = tunerCentsFromTarget(cents(E2 * 2, -4), E2);
    expect(c).toBeCloseTo(-4, 6);
    expect(octaveShift).toBe(1);
  });

  it('folds an octave-down reading too', () => {
    const { cents: c, octaveShift } = tunerCentsFromTarget(cents(E2 / 2, 7), E2);
    expect(c).toBeCloseTo(7, 6);
    expect(octaveShift).toBe(-1);
  });

  it('keeps far-off readings unfolded so the tighten/loosen direction stays right', () => {
    const { cents: c, octaveShift } = tunerCentsFromTarget(cents(E2, -700), E2);
    expect(c).toBeCloseTo(-700, 6);
    expect(octaveShift).toBe(0);
  });
});
