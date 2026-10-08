// Shared wording helpers for instrument hints ("You played F, aim for E: one fret lower").
import { midiToNoteName } from '../music.js';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

export function countWords(count, unit) {
  const word = NUMBER_WORDS[count] || String(count);
  return `${word} ${unit}${count === 1 ? '' : 's'}`;
}

// "F#" for midi 66 (no octave): what a learner reads off the fretboard or keys.
export function pitchClassName(midi) {
  return midiToNoteName(Math.round(midi)).replace(/-?\d+$/, '');
}

// Octave errors are common with pitch detection and with beginners on piano.
export function octaveHint(diff, noun) {
  if (diff === 0 || diff % 12 !== 0) return null;
  const octaves = Math.abs(diff) / 12;
  return {
    text: `Right ${noun}, ${octaves === 1 ? 'one octave' : countWords(octaves, 'octave')} too ${diff > 0 ? 'high' : 'low'}`,
    icon: diff > 0 ? 'down' : 'up',
    tone: 'close',
  };
}

// Pitch is right but out of tune (only meaningful for instruments you tune yourself).
export function intonationHint(cents, tolerance = 20) {
  if (cents > tolerance) return { text: 'A little sharp', icon: 'down', tone: 'close' };
  if (cents < -tolerance) return { text: 'A little flat', icon: 'up', tone: 'close' };
  return null;
}
