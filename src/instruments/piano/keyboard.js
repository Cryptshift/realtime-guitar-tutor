// SVG piano keyboard. It shows the range the song needs: the whole piece (whole octaves, at
// least two) when that fits the width, otherwise a window around the notes in play, split
// into a left-hand and a right-hand section when both hands are far apart. Keys are never
// narrower than MIN_KEY_PX on screen, so it stays readable on a phone.
//
// The current key is filled with the accent (right hand, or a one-handed piece) or hatched
// in pencil with an ink outline (left hand), and badged with its hand and finger ("R2",
// "L5"). The next key gets a dashed outline (dotted for the left hand). C keys are always
// labelled (to find middle C); all white keys when labels are on.
import { midiToNoteName } from '../../music.js';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (midi) => BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);

const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const VIEW_WIDTH = 1000;
const WHITE_HEIGHT = 230;
const BLACK_HEIGHT = 145;
// Narrowest white key on screen (CSS px) and the gap between two sections (in white keys).
export const MIN_KEY_PX = 22;
const SECTION_GAP = 0.8;

// Whole octaves (C..B) covering [minMidi, maxMidi], at least `minOctaves`, within A0..C8.
export function keyboardRangeFor(minMidi, maxMidi, minOctaves = 2) {
  let low = Number.isFinite(minMidi) ? minMidi : 60;
  let high = Number.isFinite(maxMidi) ? maxMidi : 71;
  low -= ((low % 12) + 12) % 12;
  high += 11 - (((high % 12) + 12) % 12);
  while ((high - low + 1) / 12 < minOctaves) {
    if (low - 12 >= LOWEST && (low > 48 || high >= 96)) low -= 12;
    else high += 12;
  }
  return { low: Math.max(LOWEST, low), high: Math.min(HIGHEST, high) };
}

export function whiteKeysIn({ low, high }) {
  let count = 0;
  for (let midi = low; midi <= high; midi += 1) if (!isBlackKey(midi)) count += 1;
  return count;
}

// How many white keys fit a view `widthPx` wide.
export function maxWhiteKeys(widthPx) {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 52;
  return Math.max(14, Math.min(52, Math.floor(widthPx / MIN_KEY_PX)));
}

const whiteBelow = (midi) => (midi > LOWEST && isBlackKey(midi) ? midi - 1 : midi);
const whiteAbove = (midi) => (midi < HIGHEST && isBlackKey(midi) ? midi + 1 : midi);

function stepWhite(midi, direction) {
  let next = midi + direction;
  while (next > LOWEST && next < HIGHEST && isBlackKey(next)) next += direction;
  return Math.max(LOWEST, Math.min(HIGHEST, next));
}

// [low, high] widened to white keys with `pad` extra white keys on each side.
function padRange(low, high, pad = 1) {
  let a = whiteBelow(low);
  let b = whiteAbove(high);
  for (let i = 0; i < pad; i += 1) {
    a = stepWhite(a, -1);
    b = stepWhite(b, 1);
  }
  return { low: a, high: b };
}

// Grows (or trims) a range to exactly `whites` white keys around its middle, within A0..C8.
function fitTo(range, whites) {
  let { low, high } = range;
  let count = whiteKeysIn(range);
  let grow = true;
  while (count < whites && (low > LOWEST || high < HIGHEST)) {
    if ((grow && low > LOWEST) || high >= HIGHEST) low = stepWhite(low, -1);
    else high = stepWhite(high, 1);
    grow = !grow;
    count = whiteKeysIn({ low, high });
  }
  while (count > whites) {
    if (grow) low = stepWhite(low, 1);
    else high = stepWhite(high, -1);
    grow = !grow;
    count = whiteKeysIn({ low, high });
  }
  return { low, high };
}

const covers = (sections, midis) => midis.every((midi) => sections.some((s) => midi >= s.low && midi <= s.high));
const midisOf = (notes) => notes.map((n) => n.midi);
const span = (midis) => ({ low: Math.min(...midis), high: Math.max(...midis) });

// The sections to draw: { mode, sections: [{ low, high }] } (one section, or two with a gap
// between the hands).
//   pieceRange: the selected hand(s)' range over the whole piece
//   current: the notes to play now; focus: the notes coming up (a bar or two ahead)
//   previous: the last layout, kept while it still shows everything in play
export function fitKeyboard({ pieceRange, current = [], focus = [], maxWhites = 52, previous = null }) {
  const inPlay = [...current, ...focus].filter((n) => Number.isFinite(n?.midi));
  const playMidis = midisOf(inPlay);
  const whole = keyboardRangeFor(
    Math.min(pieceRange?.minMidi ?? Infinity, ...playMidis),
    Math.max(pieceRange?.maxMidi ?? -Infinity, ...playMidis),
  );
  if (whiteKeysIn(whole) <= maxWhites) return { mode: 'piece', sections: [whole] };

  const window = (sections) => ({ mode: 'window', maxWhites, sections });
  if (!playMidis.length) return window([fitTo(padRange(60, 71, 0), maxWhites)]);

  // Keep the last window while it still shows every note in play (no jumping on each note).
  if (previous?.mode === 'window' && previous.maxWhites === maxWhites && covers(previous.sections, playMidis)) return previous;

  const all = span(playMidis);
  const together = padRange(all.low, all.high);
  if (whiteKeysIn(together) <= maxWhites) return window([fitTo(together, maxWhites)]);

  const left = inPlay.filter((n) => n.hand === 'L');
  const right = inPlay.filter((n) => n.hand !== 'L');
  if (left.length && right.length) {
    const l = span(midisOf(left));
    const r = span(midisOf(right));
    if (l.high < r.low) {
      const budget = Math.floor(maxWhites - SECTION_GAP);
      const half = Math.floor(budget / 2);
      const leftSection = fitTo(padRange(l.low, l.high), half);
      const rightSection = fitTo(padRange(r.low, r.high), budget - half);
      if (leftSection.high < rightSection.low) return window([leftSection, rightSection]);
    }
  }
  // One hand spread wider than the view: centre on what to play now.
  const now = current.length ? span(midisOf(current)) : all;
  return window([fitTo(padRange(now.low, now.high), maxWhites)]);
}

const label = (midi) => midiToNoteName(midi);
const fingerOf = (note) => (Number.isInteger(note?.finger) && note.finger > 0 ? String(note.finger) : '');

// "R2" / "L5" / "L" on two-handed pieces; just the finger otherwise.
export function keyBadge(note, twoHanded) {
  if (!note) return '';
  return twoHanded ? `${note.hand === 'L' ? 'L' : 'R'}${fingerOf(note)}` : fingerOf(note);
}

function describeNotes(notes, twoHanded) {
  if (!notes.length) return '--';
  return notes.map((n) => {
    const finger = fingerOf(n) ? `finger ${fingerOf(n)}` : '';
    if (!twoHanded) return `${n.note}${finger ? ` (${finger})` : ''}`;
    const hand = n.hand === 'L' ? 'left hand' : 'right hand';
    return `${n.note} (${hand}${finger ? `, ${finger}` : ''})`;
  }).join(' + ');
}

export function renderKeyboard(container, {
  current, upcoming, pieceRange, showLabels = true, twoHanded = false, focus = [], widthPx = null,
}) {
  const currentNotes = (current?.group || (current?.note ? [current.note] : [])).filter((n) => n?.key);
  const nextNotes = (upcoming?.group || (upcoming?.note ? [upcoming.note] : [])).filter((n) => n?.key);
  const width = widthPx ?? container.clientWidth ?? 0;
  const layout = fitKeyboard({
    pieceRange,
    current: currentNotes,
    focus: [...nextNotes, ...focus.filter((n) => n?.key)],
    maxWhites: maxWhiteKeys(width),
    previous: container.pkLayout || null,
  });
  container.pkLayout = layout;

  // Lay the sections out left to right, with a gap between them.
  const whites = [];
  const blacks = [];
  const breaks = [];
  let slot = 0;
  layout.sections.forEach((section, s) => {
    if (s > 0) {
      breaks.push(slot + SECTION_GAP / 2);
      slot += SECTION_GAP;
    }
    const first = whites.length;
    for (let midi = section.low; midi <= section.high; midi += 1) {
      if (!isBlackKey(midi)) {
        whites.push({ midi, slot });
        slot += 1;
      }
    }
    const inSection = new Map(whites.slice(first).map((w) => [w.midi, w]));
    for (let midi = section.low; midi <= section.high; midi += 1) {
      const left = inSection.get(midi - 1);
      if (isBlackKey(midi) && left && inSection.has(midi + 1)) blacks.push({ midi, slot: left.slot + 1 });
    }
  });
  const whiteWidth = VIEW_WIDTH / Math.max(1, slot);
  const blackWidth = whiteWidth * 0.62;

  // Text sized for the screen: at least ~11 px on a phone, never wider than its key.
  const unitsPerPx = width > 0 ? VIEW_WIDTH / width : 1;
  const labelSize = Math.min(Math.max(17, 11 * unitsPerPx), whiteWidth * 0.5);
  const badgeSize = Math.min(Math.max(26, 13 * unitsPerPx), whiteWidth * 0.55);
  const badgeRadius = Math.min(whiteWidth * 0.46, badgeSize * 1.05);
  const labelY = WHITE_HEIGHT - Math.max(12, labelSize * 0.6);
  const badgeY = Math.min(WHITE_HEIGHT - 70, labelY - labelSize - badgeRadius * 0.9);
  const blackLabelSize = Math.min(Math.max(13, 9 * unitsPerPx), blackWidth * 0.55);
  const blackBadgeSize = Math.min(Math.max(18, 11 * unitsPerPx), blackWidth * 0.62);
  const px = (value) => value.toFixed(1);

  const currentByMidi = new Map(currentNotes.map((n) => [n.midi, n]));
  const nextByMidi = new Map(nextNotes.map((n) => [n.midi, n]));
  const isLeft = (note) => twoHanded && note?.hand === 'L';

  const parts = [
    '<defs>',
    '<pattern id="pk-hatch-ink" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)"><line class="pk-hatch-ink" x1="0" y1="0" x2="0" y2="14"/></pattern>',
    '<pattern id="pk-hatch-bone" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)"><line class="pk-hatch-bone" x1="0" y1="0" x2="0" y2="12"/></pattern>',
    '</defs>',
  ];
  // Badges go on top of everything (black keys overlap the top of the white keys).
  const overlays = [];
  whites.forEach(({ midi, slot: at }) => {
    const x = at * whiteWidth;
    const note = currentByMidi.get(midi);
    const left = isLeft(note);
    parts.push(`<rect class="pk-white${note && !left ? ' pk-current' : ''}" x="${px(x)}" y="0" width="${px(whiteWidth)}" height="${WHITE_HEIGHT}" rx="4"/>`);
    if (left) {
      // Pencil hatching above the key name, and a heavy ink outline.
      parts.push(`<rect class="pk-left" x="${px(x + 3)}" y="3" width="${px(whiteWidth - 6)}" height="${px(labelY - labelSize - 3)}" rx="3"/>`);
      parts.push(`<rect class="pk-left-outline" x="${px(x + 3)}" y="3" width="${px(whiteWidth - 6)}" height="${WHITE_HEIGHT - 6}" rx="4"/>`);
    }
    const next = nextByMidi.get(midi);
    if (next && !note) {
      parts.push(`<rect class="pk-next${isLeft(next) ? ' pk-next-left' : ''}" x="${px(x + 5)}" y="${WHITE_HEIGHT - 70}" width="${px(whiteWidth - 10)}" height="62" rx="4"/>`);
    }
    const isC = midi % 12 === 0;
    if (note || showLabels || isC) {
      const kind = note ? (left ? ' pk-label-left' : ' pk-label-current') : isC ? ' pk-label-c' : '';
      parts.push(`<text class="pk-label${kind}" x="${px(x + whiteWidth / 2)}" y="${px(labelY)}" style="font-size:${px(labelSize)}px">${label(midi)}</text>`);
    }
    const badge = keyBadge(note, twoHanded);
    if (note && badge) {
      overlays.push(`<circle class="${left ? 'pk-badge-left' : 'pk-finger-bg'}" cx="${px(x + whiteWidth / 2)}" cy="${px(badgeY)}" r="${px(badgeRadius)}"/>`);
      overlays.push(`<text class="pk-finger${left ? ' pk-finger-left' : ''}" x="${px(x + whiteWidth / 2)}" y="${px(badgeY + badgeSize * 0.35)}" style="font-size:${px(badgeSize)}px">${badge}</text>`);
    }
  });
  blacks.forEach(({ midi, slot: at }) => {
    const x = at * whiteWidth - blackWidth / 2;
    const note = currentByMidi.get(midi);
    const left = isLeft(note);
    parts.push(`<rect class="pk-black${note && !left ? ' pk-current' : ''}" x="${px(x)}" y="0" width="${px(blackWidth)}" height="${BLACK_HEIGHT}" rx="4"/>`);
    if (left) {
      parts.push(`<rect class="pk-left-black" x="${px(x + 3)}" y="3" width="${px(blackWidth - 6)}" height="${BLACK_HEIGHT - 6}" rx="3"/>`);
    }
    const next = nextByMidi.get(midi);
    if (next && !note) {
      parts.push(`<rect class="pk-next pk-next-black${isLeft(next) ? ' pk-next-left' : ''}" x="${px(x + 3)}" y="${BLACK_HEIGHT - 52}" width="${px(blackWidth - 6)}" height="46" rx="4"/>`);
    }
    if (note) {
      const name = label(midi);
      // The key name only when it fits the key; the badge always.
      if (blackWidth >= name.length * blackLabelSize * 0.62) {
        parts.push(`<text class="pk-label pk-label-black ${left ? 'pk-label-black-left' : 'pk-label-current'}" x="${px(x + blackWidth / 2)}" y="${BLACK_HEIGHT - 12}" style="font-size:${px(blackLabelSize)}px">${name}</text>`);
      }
      const badge = keyBadge(note, twoHanded);
      if (badge) {
        overlays.push(`<text class="pk-finger pk-finger-black${left ? ' pk-finger-black-left' : ''}" x="${px(x + blackWidth / 2)}" y="${px(BLACK_HEIGHT - 12 - blackLabelSize * 1.5)}" style="font-size:${px(blackBadgeSize)}px">${badge}</text>`);
      }
    }
  });
  breaks.forEach((at) => {
    const x = at * whiteWidth;
    parts.push(`<path class="pk-break" d="M ${px(x - 7)} ${WHITE_HEIGHT * 0.6} l 14 -28 M ${px(x - 7)} ${WHITE_HEIGHT * 0.6 + 20} l 14 -28"/>`);
  });

  const caption = currentNotes.length ? `Play ${describeNotes(currentNotes, twoHanded)}` : 'Waiting for the next note';
  const nextText = describeNotes(nextNotes, twoHanded);
  const sectionsText = layout.sections.length > 1
    ? ` Showing ${layout.sections.map((s) => `${label(s.low)} to ${label(s.high)}`).join(' and ')}.`
    : '';
  container.innerHTML = `<svg class="keyboard" viewBox="0 0 ${VIEW_WIDTH} ${WHITE_HEIGHT}" role="img" aria-label="${caption}. Next: ${nextText}.${sectionsText}">${parts.join('')}${overlays.join('')}</svg>`;
  return {
    caption,
    target: describeNotes(currentNotes, twoHanded),
    hint: caption,
    legend: twoHanded
      ? 'R: right hand (filled). L: left hand (hatched). Numbers are fingers: 1 thumb … 5 little finger.'
      : 'Numbers are fingers: 1 thumb … 5 little finger.',
    next: nextText,
    sections: layout.sections,
  };
}
