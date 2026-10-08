// ASCII tab parsing (6-line systems by position) into piece notes.
import { parseBpmFromText } from '../../import/metadata.js';
import { DEFAULT_OPEN_MIDI_BY_STRING } from './strings.js';
import { buildOpenMidiMapFromTokens, parseTuningFromText } from './tuning.js';
import { midiToNoteName, parseTuningToken } from '../../music.js';

export const DEFAULT_TAB_MS_PER_COLUMN = 120;

export const DEFAULT_COLUMNS_PER_BEAT = 4;

export const TAB_NOTE_SUSTAIN_RATIO = 0.98;

export const TAB_SYSTEM_GAP_COLUMNS = 0;

// Converts pasted ASCII tab (any text with a full 6-line tab system) into a piece.
export function parsePastedTab(text, { msPerColumn = DEFAULT_TAB_MS_PER_COLUMN, simplifyToSingleNotes = true } = {}) {
  const tuning = parseTuningFromText(text, { allowBare: false });
  const bpm = parseBpmFromText(text, { allowBare: false });
  const effectiveMsPerColumn = bpm && msPerColumn === DEFAULT_TAB_MS_PER_COLUMN
    ? bpmToMsPerColumn(bpm, DEFAULT_COLUMNS_PER_BEAT)
    : msPerColumn;
  const piece = parseTabTextToPiece(
    text,
    effectiveMsPerColumn,
    'Pasted Tab',
    tuning?.openMidiByString || null,
    bpm,
    { simplifyToSingleNotes },
  );
  return { ...piece, importedFrom: 'ascii-tab' };
}

export function bpmToMsPerColumn(bpm, columnsPerBeat = DEFAULT_COLUMNS_PER_BEAT) {
  if (!Number.isFinite(bpm) || bpm <= 0) return DEFAULT_TAB_MS_PER_COLUMN;
  const beatMs = 60000 / bpm;
  const derived = beatMs / Math.max(1, columnsPerBeat);
  return Math.max(40, Math.min(500, Math.round(derived)));
}

export function stripTabMarkup(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?(?:tab|ch)\]/gi, '');
}

export function countTabLines(text) {
  return String(text || '').split('\n').reduce((count, line) => count + (parseTabLine(line) ? 1 : 0), 0);
}

export const TAB_BODY_CHAR = /[-0-9|hpbrstx/\\~()<>^.*=+vPHBRSTX]/;

// Recognizes one ASCII-tab string line and returns its optional label ("e", "B", "D#",
// "Eb", lowercase too) and the body after the label/separator. Accepts labelled
// ("e|--0--", "D#|--", "e --0--") and unlabelled ("|--0--|", "--0--") lines, and drops a
// trailing annotation such as "| x2". Returns null for anything that isn't a tab line.
export function parseTabLine(rawLine) {
  const line = String(rawLine).replace(/\r/g, '').replace(/\t/g, '    ');
  const match = line.match(/^\s*([A-Ga-g][#b]?)?\s*([|:])?(.*)$/);
  if (!match) return null;
  const [, label = null, separator = null] = match;
  let body = match[3];

  if (!separator && !/^\s*-/.test(body)) return null;
  body = body.trim().split(/\s{2,}|\s+(?=[A-Za-z(])/)[0];
  if (body.length < 4) return null;

  const dashCount = (body.match(/-/g) || []).length;
  if (dashCount < 3) return null;
  let tabChars = 0;
  for (const char of body) {
    if (TAB_BODY_CHAR.test(char)) tabChars += 1;
  }
  if (tabChars / body.length < 0.85) return null;

  return { label, body: body.replace(/\s/g, '-') };
}

// Groups consecutive tab lines into 6-line systems by POSITION (top line = high e), so
// duplicate "E" labels, drop-D "D" labels, lowercase and unlabelled lines all work.
// Blocks that aren't a multiple of 6 lines (bass, 7-string, fragments) are skipped.
// Returns { systems: [{ strings: [s1..s6 bodies], labels: [s1..s6] }], labelTuning }.
export function parseTabSystems(tabText) {
  const lines = stripTabMarkup(tabText).split('\n');
  const blocks = [];
  let block = [];
  for (const rawLine of lines) {
    const parsed = parseTabLine(rawLine);
    if (parsed) {
      block.push(parsed);
    } else if (block.length) {
      blocks.push(block);
      block = [];
    }
  }
  if (block.length) blocks.push(block);

  const systems = [];
  for (const lineBlock of blocks) {
    if (lineBlock.length % 6 !== 0) continue;
    for (let i = 0; i < lineBlock.length; i += 6) {
      let group = lineBlock.slice(i, i + 6);
      // Rare low-E-on-top layout: "E" first and "e" last.
      if (group[0].label === 'E' && group[5].label === 'e') {
        group = [...group].reverse();
      }
      systems.push({
        strings: group.map((entry) => entry.body),
        labels: group.map((entry) => entry.label),
      });
    }
  }

  if (systems.length === 0) {
    throw new Error('No complete 6-string tab systems found');
  }

  return { systems, labelTuning: tuningFromStringLabels(systems[0].labels) };
}

// Open-string pitches implied by a full set of string labels (high e first), e.g. a
// drop-D tab labelled e B G D A D. Null unless all six labels are present.
export function tuningFromStringLabels(labels) {
  if (!Array.isArray(labels) || labels.length !== 6 || labels.some((label) => !label)) {
    return null;
  }
  const tokens = labels.map((label) => parseTuningToken(label));
  if (tokens.some((token) => !token)) return null;
  const parsed = buildOpenMidiMapFromTokens(tokens, 'high-to-low');
  return parsed ? parsed.openMidiByString : null;
}

export function parseTabTextToPiece(
  tabText,
  msPerColumn,
  pieceName,
  openMidiByString = null,
  bpm = null,
  options = {},
) {
  const { simplifyToSingleNotes = true, capo = 0 } = options;
  const { systems, labelTuning } = parseTabSystems(tabText);
  const tuning = openMidiByString || labelTuning || DEFAULT_OPEN_MIDI_BY_STRING;

  const rawEvents = [];
  let globalColumnOffset = 0;

  for (const system of systems) {
    const maxLen = Math.max(...system.strings.map((body) => body.length));

    system.strings.forEach((raw, stringIndex) => {
      const stringNumber = stringIndex + 1;
      for (let col = 0; col < raw.length; col += 1) {
        const char = raw[col];
        const prevChar = col > 0 ? raw[col - 1] : '';
        if (!/\d/.test(char) || /\d/.test(prevChar)) continue;

        let end = col + 1;
        while (end < raw.length && /\d/.test(raw[end])) end += 1;

        const fret = Number(raw.slice(col, end));
        if (!Number.isFinite(fret) || fret < 0 || fret > 24) {
          col = end - 1;
          continue;
        }

        rawEvents.push({
          column: globalColumnOffset + col,
          string: stringNumber,
          fret,
        });
        col = end - 1;
      }
    });

    globalColumnOffset += maxLen + TAB_SYSTEM_GAP_COLUMNS;
  }

  if (rawEvents.length === 0) {
    throw new Error('No playable fret numbers found in the imported tabs');
  }

  rawEvents.sort((a, b) => a.column - b.column || a.string - b.string);

  const uniqueColumns = [...new Set(rawEvents.map((event) => event.column))];
  const nextColumnMap = new Map();
  uniqueColumns.forEach((column, index) => {
    nextColumnMap.set(column, uniqueColumns[index + 1] ?? (column + 4));
  });

  const msPerCol = Math.max(40, Math.min(500, Math.round(msPerColumn)));
  const strumSpreadSeconds = 0.08;
  const minDurationSeconds = 0.18;

  const notes = [];
  const grouped = rawEvents.reduce((acc, event) => {
    if (!acc.has(event.column)) acc.set(event.column, []);
    acc.get(event.column).push(event);
    return acc;
  }, new Map());

  [...grouped.entries()].forEach(([column, events]) => {
    const sortedEvents = events.sort((a, b) => a.string - b.string);
    const chordSize = sortedEvents.length;
    const nextColumn = nextColumnMap.get(column);
    const baseDuration = Math.max(
      minDurationSeconds,
      ((nextColumn - column) * msPerCol) / 1000 * TAB_NOTE_SUSTAIN_RATIO,
    );

    sortedEvents.forEach((event, idx) => {
      const start = simplifyToSingleNotes
        ? (column * msPerCol) / 1000 + idx * strumSpreadSeconds
        : (column * msPerCol) / 1000;
      const duration = simplifyToSingleNotes
        ? (
          idx < sortedEvents.length - 1
            ? Math.min(baseDuration, strumSpreadSeconds * 1.7)
            : baseDuration
        )
        : baseDuration;
      const openMidi = Number.isFinite(tuning[event.string])
        ? tuning[event.string]
        : DEFAULT_OPEN_MIDI_BY_STRING[event.string];
      const midi = openMidi + capo + event.fret;

      notes.push({
        note: midiToNoteName(midi),
        start: Number(start.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        tab: {
          string: event.string,
          fret: event.fret,
          chordSize,
          chordIndex: idx,
          isChordTone: chordSize > 1,
        },
      });
    });
  });

  return {
    name: pieceName || 'Imported Tab',
    bpm: Number.isFinite(bpm) ? bpm : 100,
    notes,
  };
}
