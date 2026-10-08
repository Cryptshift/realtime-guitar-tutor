// SVG piano keyboard that fits the song's range (whole octaves, at least two). The current
// key is filled with its finger number; the next key gets a dashed outline. C keys are
// always labelled (to find middle C); all white keys when labels are on.
import { midiToNoteName } from '../../music.js';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (midi) => BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);

const VIEW_WIDTH = 1000;
const WHITE_HEIGHT = 230;
const BLACK_HEIGHT = 145;

// Whole octaves (C..B) covering [minMidi, maxMidi], at least `minOctaves`, within A0..C8.
export function keyboardRangeFor(minMidi, maxMidi, minOctaves = 2) {
  let low = Number.isFinite(minMidi) ? minMidi : 60;
  let high = Number.isFinite(maxMidi) ? maxMidi : 71;
  low -= ((low % 12) + 12) % 12;
  high += 11 - (((high % 12) + 12) % 12);
  while ((high - low + 1) / 12 < minOctaves) {
    if (low - 12 >= 21 && (low > 48 || high >= 96)) low -= 12;
    else high += 12;
  }
  return { low: Math.max(21, low), high: Math.min(108, high) };
}

const label = (midi) => midiToNoteName(midi);

function fingerText(note) {
  return Number.isInteger(note?.finger) && note.finger > 0 ? String(note.finger) : '';
}

export function renderKeyboard(container, { current, upcoming, pieceRange, showLabels = true }) {
  const currentNotes = (current?.group || (current?.note ? [current.note] : [])).filter((n) => n?.key);
  const nextNotes = (upcoming?.group || (upcoming?.note ? [upcoming.note] : [])).filter((n) => n?.key);
  const focusMidis = [...currentNotes, ...nextNotes].map((n) => n.midi);
  const { low, high } = keyboardRangeFor(
    Math.min(pieceRange?.minMidi ?? Infinity, ...focusMidis),
    Math.max(pieceRange?.maxMidi ?? -Infinity, ...focusMidis),
  );

  const whites = [];
  for (let midi = low; midi <= high; midi += 1) if (!isBlackKey(midi)) whites.push(midi);
  const whiteWidth = VIEW_WIDTH / whites.length;
  const blackWidth = whiteWidth * 0.62;
  const whiteIndex = new Map(whites.map((midi, i) => [midi, i]));
  const currentByMidi = new Map(currentNotes.map((n) => [n.midi, n]));
  const nextMidis = new Set(nextNotes.map((n) => n.midi));

  const parts = [];
  whites.forEach((midi, i) => {
    const x = i * whiteWidth;
    const isCurrent = currentByMidi.has(midi);
    parts.push(`<rect class="pk-white${isCurrent ? ' pk-current' : ''}" x="${x}" y="0" width="${whiteWidth}" height="${WHITE_HEIGHT}" rx="6"/>`);
    if (nextMidis.has(midi) && !isCurrent) {
      parts.push(`<rect class="pk-next" x="${x + 5}" y="${WHITE_HEIGHT - 70}" width="${whiteWidth - 10}" height="62" rx="6"/>`);
    }
    const name = label(midi);
    const isC = midi % 12 === 0;
    if (isCurrent || showLabels || isC) {
      parts.push(`<text class="pk-label${isCurrent ? ' pk-label-current' : ''}${isC && !isCurrent ? ' pk-label-c' : ''}" x="${x + whiteWidth / 2}" y="${WHITE_HEIGHT - 14}">${name}</text>`);
    }
    if (isCurrent && fingerText(currentByMidi.get(midi))) {
      parts.push(`<circle class="pk-finger-bg" cx="${x + whiteWidth / 2}" cy="${WHITE_HEIGHT - 70}" r="${Math.min(22, whiteWidth / 2.4)}"/>`);
      parts.push(`<text class="pk-finger" x="${x + whiteWidth / 2}" y="${WHITE_HEIGHT - 61}">${fingerText(currentByMidi.get(midi))}</text>`);
    }
  });
  for (let midi = low; midi <= high; midi += 1) {
    if (!isBlackKey(midi)) continue;
    const leftWhite = whiteIndex.get(midi - 1);
    if (leftWhite === undefined) continue;
    const x = (leftWhite + 1) * whiteWidth - blackWidth / 2;
    const isCurrent = currentByMidi.has(midi);
    parts.push(`<rect class="pk-black${isCurrent ? ' pk-current' : ''}" x="${x}" y="0" width="${blackWidth}" height="${BLACK_HEIGHT}" rx="4"/>`);
    if (nextMidis.has(midi) && !isCurrent) {
      parts.push(`<rect class="pk-next" x="${x + 3}" y="${BLACK_HEIGHT - 52}" width="${blackWidth - 6}" height="46" rx="4"/>`);
    }
    if (isCurrent) {
      parts.push(`<text class="pk-label pk-label-current pk-label-black" x="${x + blackWidth / 2}" y="${BLACK_HEIGHT - 14}">${label(midi)}</text>`);
      if (fingerText(currentByMidi.get(midi))) {
        parts.push(`<text class="pk-finger pk-finger-black" x="${x + blackWidth / 2}" y="${BLACK_HEIGHT - 44}">${fingerText(currentByMidi.get(midi))}</text>`);
      }
    }
  }

  const describe = (notes) => (notes.length
    ? notes.map((n) => `${n.note}${fingerText(n) ? ` (finger ${fingerText(n)})` : ''}`).join(' + ')
    : '--');
  const caption = currentNotes.length ? `Play ${describe(currentNotes)}` : 'Waiting for the next note';
  container.innerHTML = `<svg class="keyboard" viewBox="0 0 ${VIEW_WIDTH} ${WHITE_HEIGHT}" role="img" aria-label="${caption}. Next: ${describe(nextNotes)}">${parts.join('')}</svg>`;
  return {
    caption,
    target: describe(currentNotes),
    hint: caption,
    legend: 'Numbers are fingers: 1 thumb … 5 little finger.',
    next: describe(nextNotes),
  };
}
