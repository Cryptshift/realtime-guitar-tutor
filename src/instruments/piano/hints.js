// Plain-language feedback for the piano ("the key just to the left").
import { countWords, octaveHint, pitchClassName } from '../hintText.js';

// Piano pitch can't be out of tune by the player, so cents are ignored.
export function pianoHint(target, playedMidi) {
  if (!target || !Number.isFinite(playedMidi)) return null;
  const diff = Math.round(playedMidi) - target.midi;
  if (diff === 0) return null;

  const octave = octaveHint(diff, 'key');
  if (octave) return { ...octave, icon: diff > 0 ? 'left' : 'right' };

  const played = pitchClassName(playedMidi);
  const aim = pitchClassName(target.midi);
  // Played too high -> the target is to the left.
  const side = diff > 0 ? 'left' : 'right';
  const steps = Math.abs(diff);
  let where;
  if (steps === 1) where = `the key just to the ${side}`;
  else if (steps <= 7) where = `${countWords(steps, 'key')} to the ${side}`;
  else where = `further to the ${side}`;
  return { text: `You played ${played}, aim for ${aim}: ${where}`, icon: side, tone: 'off' };
}
