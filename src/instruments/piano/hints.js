// Plain-language feedback for the piano ("the key just to the left").
import { midiToNoteName } from '../../music.js';
import { countWords, octaveHint, pitchClassName } from '../hintText.js';

const HAND_WORDS = { R: 'Right hand', L: 'Left hand' };

// Piano pitch can't be out of tune by the player, so cents are ignored.
// context.octave: name keys with their octave ("C3"), for pieces that use both hands.
// context.hand: 'R' | 'L' prefixes the hint with the hand ("Left hand: you played …").
export function pianoHint(target, playedMidi, { hand = null, octave = false } = {}) {
  if (!target || !Number.isFinite(playedMidi)) return null;
  const diff = Math.round(playedMidi) - target.midi;
  if (diff === 0) return null;

  // Played too high -> the target is to the left.
  const side = diff > 0 ? 'left' : 'right';
  const steps = Math.abs(diff);
  const handWords = HAND_WORDS[hand] || null;

  if (!handWords && !octave) {
    const octaveText = octaveHint(diff, 'key');
    if (octaveText) return { ...octaveText, icon: side };
  }

  const name = (midi) => (octave ? midiToNoteName(Math.round(midi)) : pitchClassName(midi));
  let where;
  if (steps % 12 === 0) where = `${steps === 12 ? 'one octave' : countWords(steps / 12, 'octave')} to the ${side}`;
  else if (steps === 1) where = `the key just to the ${side}`;
  else if (steps <= 7) where = `${countWords(steps, 'key')} to the ${side}`;
  else where = `further to the ${side}`;
  const sentence = `you played ${name(playedMidi)}, aim for ${name(target.midi)}: ${where}`;
  const text = handWords ? `${handWords}: ${sentence}` : `${sentence[0].toUpperCase()}${sentence.slice(1)}`;
  return { text, icon: side, tone: steps % 12 === 0 ? 'close' : 'off' };
}
