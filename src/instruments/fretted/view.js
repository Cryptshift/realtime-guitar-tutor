// SVG fretboard for fretted instruments: strings in tab order (string 1 on top), the nut on
// the left (right when left-handed), filled dots with finger numbers for the current
// note/shape and dashed rings for what comes next.

const VIEW_WIDTH = 1400;
const LABEL_AREA = 70;
const SINGLE_INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);

const escapeText = (value) => String(value).replace(/[&<>"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[c]));

function fretWindow(frets, maxFret) {
  const highest = frets.length ? Math.max(...frets) : 0;
  if (highest <= 6) return { start: 0, end: 7 };
  const lowestFretted = Math.min(...frets.filter((f) => f > 0));
  const start = Math.max(1, Math.min(lowestFretted - 1, highest - 6));
  return { start, end: Math.min(maxFret, Math.max(start + 6, highest + 1)) };
}

export function describePosition(note, layout) {
  if (!note?.tab) return note ? `${note.note} (no position)` : '';
  const info = layout.stringInfo(note.tab.string);
  const label = info?.label ?? note.tab.string;
  if (note.tab.fret === 0) return `Open ${label} string`;
  const finger = Number.isInteger(note.finger) && note.finger > 0 ? ` · finger ${note.finger}` : '';
  return `String ${note.tab.string} (${label}), fret ${note.tab.fret}${finger}`;
}

function describeGroupPositions(group, layout) {
  const placed = group.filter((note) => note?.tab);
  if (!placed.length) return group[0] ? `${group[0].note} (no position)` : '';
  if (placed.length === 1) return describePosition(placed[0], layout);
  return `${placed.length} strings together: ${placed.map((n) => `S${n.tab.string} F${n.tab.fret}`).join(', ')}`;
}

export function renderFretboard(container, { layout, current, upcoming, leftHanded = false, legend = '' }) {
  const currentNotes = (current?.group || []).filter((note) => note?.tab);
  const nextNotes = (upcoming?.group || []).filter((note) => note?.tab);
  const { start, end } = fretWindow([...currentNotes, ...nextNotes].map((n) => n.tab.fret), layout.maxFret);

  const stringCount = layout.stringCount;
  const gap = stringCount > 4 ? 46 : 58;
  const top = 34;
  const height = top + gap * (stringCount - 1) + 56;
  const boardLeft = LABEL_AREA + 30;
  const boardRight = VIEW_WIDTH - 24;
  const fretWidth = (boardRight - boardLeft) / (end - start);
  const mx = (x) => (leftHanded ? VIEW_WIDTH - x : x);
  const wireX = (fret) => boardLeft + (fret - start) * fretWidth;
  const dotX = (fret) => (fret === 0 ? boardLeft - 22 : boardLeft + (fret - start - 0.5) * fretWidth);
  const stringY = (number) => top + (number - 1) * gap;
  const midY = top + (gap * (stringCount - 1)) / 2;

  const parts = [];
  // Inlays.
  for (let fret = Math.max(1, start + 1); fret <= end; fret += 1) {
    const x = mx(dotX(fret));
    if (SINGLE_INLAYS.has(fret)) parts.push(`<circle class="fb-inlay" cx="${x}" cy="${midY}" r="9"/>`);
    if (DOUBLE_INLAYS.has(fret)) {
      parts.push(`<circle class="fb-inlay" cx="${x}" cy="${stringY(2) + gap / 2}" r="9"/>`);
      parts.push(`<circle class="fb-inlay" cx="${x}" cy="${stringY(stringCount - 1) - gap / 2}" r="9"/>`);
    }
  }
  // Fret wires (the nut is thicker) and fret numbers.
  for (let fret = start; fret <= end; fret += 1) {
    const x = mx(wireX(fret));
    parts.push(`<line class="${fret === 0 ? 'fb-nut' : 'fb-fret'}" x1="${x}" y1="${top - 10}" x2="${x}" y2="${stringY(stringCount) + 10}"/>`);
    // Each fret's number sits in its space, between wire (fret - 1) and wire (fret).
    if (fret > start) {
      parts.push(`<text class="fb-fretnum" x="${mx(dotX(fret))}" y="${height - 14}">${fret}</text>`);
    }
  }
  // Strings and their names.
  layout.strings.forEach((info) => {
    const y = stringY(info.string);
    const weight = 1.5 + (info.openMidi < 50 ? 2 : info.openMidi < 60 ? 1 : 0);
    parts.push(`<line class="fb-string" x1="${mx(boardLeft - 40)}" y1="${y}" x2="${mx(boardRight)}" y2="${y}" stroke-width="${weight}"/>`);
    parts.push(`<text class="fb-stringname" x="${mx(28)}" y="${y + 7}">${escapeText(info.label)}</text>`);
  });
  // Upcoming (dashed) then current (filled) markers.
  const currentKeys = new Set(currentNotes.map((n) => `${n.tab.string}:${n.tab.fret}`));
  nextNotes.forEach((note) => {
    if (currentKeys.has(`${note.tab.string}:${note.tab.fret}`)) return;
    const x = mx(dotX(note.tab.fret));
    const y = stringY(note.tab.string);
    parts.push(`<circle class="fb-next" cx="${x}" cy="${y}" r="20"/>`);
  });
  currentNotes.forEach((note) => {
    const x = mx(dotX(note.tab.fret));
    const y = stringY(note.tab.string);
    const open = note.tab.fret === 0;
    const label = open ? '0' : (Number.isInteger(note.finger) && note.finger > 0 ? note.finger : '');
    parts.push(`<circle class="${open ? 'fb-open' : 'fb-dot'}" cx="${x}" cy="${y}" r="22"/>`);
    if (label !== '') parts.push(`<text class="${open ? 'fb-opennum' : 'fb-finger'}" x="${x}" y="${y + 8}">${label}</text>`);
  });
  if (start > 0) {
    parts.push(`<text class="fb-position" x="${mx(boardLeft + 6)}" y="${top - 16}">fret ${start + 1}</text>`);
  }

  const caption = current ? describeGroupPositions(current.group || [current.note], layout) : 'Waiting for the next note';
  const nextCaption = upcoming ? describeGroupPositions(upcoming.group || [upcoming.note], layout) : '--';
  container.innerHTML = `<svg class="fretboard" viewBox="0 0 ${VIEW_WIDTH} ${height}" role="img" aria-label="${escapeText(`Fretboard: ${caption}. Next: ${nextCaption}`)}">${parts.join('')}</svg>`;

  return {
    caption,
    target: caption,
    hint: currentNotes.length > 1 ? 'Press these strings together.' : caption,
    legend,
    next: nextCaption,
  };
}
