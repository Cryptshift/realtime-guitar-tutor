import { describe, expect, it } from 'vitest';
import { createPieceClock } from '../src/clock.js';

describe('createPieceClock', () => {
  it('advances piece time at the tempo scale', () => {
    const clock = createPieceClock(1000, 1.5);
    expect(clock.secondsAt(3000)).toBeCloseTo(3, 9);
  });

  it('does not jump when the tempo changes mid-play', () => {
    const clock = createPieceClock(0, 1);
    expect(clock.secondsAt(10_000)).toBeCloseTo(10, 9);
    clock.setScale(10_000, 0.5);
    // Old behaviour would have been elapsed * newScale = 5 s (a 5 s jump back).
    expect(clock.secondsAt(10_000)).toBeCloseTo(10, 9);
    expect(clock.secondsAt(12_000)).toBeCloseTo(11, 9);
  });

  it('resets to zero', () => {
    const clock = createPieceClock(0, 2);
    clock.reset(5000, 1);
    expect(clock.secondsAt(6000)).toBeCloseTo(1, 9);
  });
});
