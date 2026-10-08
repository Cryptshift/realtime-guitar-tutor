import { describe, expect, it } from 'vitest';
import { parseBpmFromText } from '../src/main.js';

describe('parseBpmFromText', () => {
  it('reads plain, quoted and escaped JSON bpm fields', () => {
    expect(parseBpmFromText('{"bpm":120}')).toBe(120);
    expect(parseBpmFromText('{"bpm":"96"}')).toBe(96);
    expect(parseBpmFromText('{\\"bpm\\":132}')).toBe(132);
  });

  it('reads prose tempo markings', () => {
    expect(parseBpmFromText('Tempo: 96')).toBe(96);
    expect(parseBpmFromText('played at 140 bpm')).toBe(140);
  });

  it('ignores out-of-range values and bare numbers unless allowed', () => {
    expect(parseBpmFromText('{"bpm":12}')).toBeNull();
    expect(parseBpmFromText('page 120')).toBeNull();
    expect(parseBpmFromText('120', { allowBare: true })).toBe(120);
  });
});
