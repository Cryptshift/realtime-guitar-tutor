// Plain-language feedback for fretted instruments.
import { countWords, intonationHint, octaveHint, pitchClassName } from '../hintText.js';

// target: normalized note (with tab); playedMidi: detected pitch as (fractional) MIDI.
// Returns { text, icon: 'up'|'down'|'check'|null, tone: 'close'|'off' } or null when the
// played note is the target and in tune.
export function frettedHint(target, playedMidi, cents = 0) {
  if (!target || !Number.isFinite(playedMidi)) return null;
  const diff = Math.round(playedMidi) - target.midi;
  if (diff === 0) return intonationHint(cents);

  const octave = octaveHint(diff, 'note');
  if (octave) return octave;

  const played = pitchClassName(playedMidi);
  const aim = pitchClassName(target.midi);
  const icon = diff > 0 ? 'down' : 'up';
  if (target.tab && Math.abs(diff) <= 4) {
    return {
      text: `You played ${played}, aim for ${aim}: ${countWords(Math.abs(diff), 'fret')} ${diff > 0 ? 'lower' : 'higher'}`,
      icon,
      tone: 'off',
    };
  }
  const where = target.tab
    ? (target.tab.fret === 0 ? ` (open string ${target.tab.string})` : ` (string ${target.tab.string}, fret ${target.tab.fret})`)
    : '';
  return { text: `You played ${played}, aim for ${aim}${where}`, icon, tone: 'off' };
}
