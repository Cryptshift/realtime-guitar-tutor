import { describe, expect, it } from 'vitest';
import {
  centsDifference,
  detectMonophonicNotesFromAudio,
  detectPitch,
  midiToFrequency,
  noteNameToMidi,
} from '../src/main.js';
import { pluckedSequence, tone, whiteNoise } from './helpers/synth.js';

const GUITAR_NOTES = ['D2', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'E5', 'E6'];
const SAMPLE_RATES = [44100, 48000];
const PROFILES = {
  pure: [1],
  guitarLike: [1, 0.8, 0.5, 0.3, 0.2],
  weakFundamental: [0.3, 1, 0.6, 0.4, 0.2],
  veryWeakFundamental: [0.1, 1, 0.7, 0.4],
};

describe('detectPitch (MPM/NSDF)', () => {
  for (const sampleRate of SAMPLE_RATES) {
    for (const [profile, amplitudes] of Object.entries(PROFILES)) {
      it(`is within 2 cents with no octave errors: ${profile} @ ${sampleRate} Hz`, () => {
        for (const name of GUITAR_NOTES) {
          const frequency = midiToFrequency(noteNameToMidi(name));
          for (let seed = 1; seed <= 3; seed += 1) {
            const result = detectPitch(tone({ frequency, sampleRate, amplitudes, seed }), sampleRate);
            expect(result, `${name} seed ${seed}`).not.toBeNull();
            expect(Math.abs(centsDifference(result.frequency, frequency)), `${name} seed ${seed}`).toBeLessThan(2);
          }
        }
      });
    }
  }

  it('returns null for silence and for white noise', () => {
    expect(detectPitch(new Float32Array(2048), 48000)).toBeNull();
    for (let seed = 1; seed <= 100; seed += 1) {
      expect(detectPitch(whiteNoise({ gain: 0.01, seed }), 48000)).toBeNull();
      expect(detectPitch(whiteNoise({ gain: 0.2, seed }), 48000)).toBeNull();
    }
  });

  it('still locks onto a noisy, decaying low E', () => {
    const frequency = midiToFrequency(40);
    const noisy = tone({ frequency, sampleRate: 48000, amplitudes: [1, 0.6, 0.3], noise: 0.02 });
    const decaying = tone({ frequency, sampleRate: 48000, amplitudes: [1, 0.8, 0.5], gain: 0.1, decayPerSecond: 15 });
    expect(Math.abs(centsDifference(detectPitch(noisy, 48000).frequency, frequency))).toBeLessThan(5);
    expect(Math.abs(centsDifference(detectPitch(decaying, 48000).frequency, frequency))).toBeLessThan(2);
  });

  it('ignores a DC offset', () => {
    const frequency = midiToFrequency(45);
    const signal = tone({ frequency, sampleRate: 44100, amplitudes: [1, 0.5] }).map((v) => v + 0.3);
    expect(Math.abs(centsDifference(detectPitch(signal, 44100).frequency, frequency))).toBeLessThan(2);
  });
});

describe('detectMonophonicNotesFromAudio', () => {
  it('labels a plucked line correctly (no averaged in-between notes)', () => {
    const names = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'B3', 'G3', 'D3', 'F3', 'E3'];
    const sampleRate = 44100;
    const audio = pluckedSequence({
      frequencies: names.map((name) => midiToFrequency(noteNameToMidi(name))),
      sampleRate,
    });
    const notes = detectMonophonicNotesFromAudio(audio, sampleRate, 130);
    expect(notes.map((note) => note.note)).toEqual(names);
    notes.forEach((note, index) => {
      expect(Math.abs(note.start - index)).toBeLessThan(0.1);
    });
  });
});
