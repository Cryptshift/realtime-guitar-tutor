// Guitar fretboard (finger placement) view.
import { GUITAR_STRINGS } from './strings.js';
import { tabSummary, tabbedNotesFromGroup } from './tabView.js';

export function suggestedFingerMapForGroup(groupNotes) {
  const fingerMap = new Map();
  const tabbed = tabbedNotesFromGroup(groupNotes);
  const fretted = tabbed
    .filter((note) => note.tab.fret > 0)
    .sort((a, b) => a.tab.fret - b.tab.fret || a.tab.string - b.tab.string);
  const baseFret = fretted[0]?.tab.fret || 1;

  tabbed.forEach((note) => {
    const key = `${note.tab.string}:${note.tab.fret}`;
    if (note.tab.fret <= 0) {
      fingerMap.set(key, 'O');
      return;
    }
    const finger = Math.max(1, Math.min(4, note.tab.fret - baseFret + 1));
    fingerMap.set(key, String(finger));
  });

  return fingerMap;
}

export function fingerboardRangeForGroup(groupNotes) {
  const tabbed = tabbedNotesFromGroup(groupNotes);
  const maxFret = tabbed.reduce((max, note) => Math.max(max, note.tab.fret), 0);
  if (maxFret <= 12) {
    return { startFret: 0, endFret: 12 };
  }

  const minPositiveFret = tabbed
    .filter((note) => note.tab.fret > 0)
    .reduce((min, note) => Math.min(min, note.tab.fret), Infinity);
  const startFret = Math.max(0, Math.min(maxFret - 12, Number.isFinite(minPositiveFret) ? minPositiveFret - 2 : maxFret - 12));
  return {
    startFret,
    endFret: startFret + 12,
  };
}

// Instrument hook: draws the fretboard for the current note group into `container` and
// returns the panel texts. `current`/`upcoming` are { note, group } or null.
export function renderFretboardView(container, { current, upcoming }) {
  const nextSummary = upcoming ? tabSummary(upcoming.note, upcoming.group) : '--';
  const focusNote = current.note;
  const tabbed = tabbedNotesFromGroup(current.group);

  if (!tabbed.length) {
    container.innerHTML = '';
    return {
      target: focusNote.note || '--',
      hint: 'No mapped string/fret for this note.',
      legend: 'Try loading tabs with fret positions.',
      next: nextSummary,
    };
  }

  const fingerMap = suggestedFingerMapForGroup(current.group);
  const { startFret, endFret } = fingerboardRangeForGroup(current.group);
  const markerByPosition = new Map();
  tabbed.forEach((note) => {
    markerByPosition.set(`${note.tab.string}:${note.tab.fret}`, {
      note: note.note,
      string: note.tab.string,
      fret: note.tab.fret,
      finger: fingerMap.get(`${note.tab.string}:${note.tab.fret}`) || '?',
    });
  });

  const headerCells = [];
  for (let fret = startFret; fret <= endFret; fret += 1) {
    headerCells.push(`<th>${fret}</th>`);
  }

  const rows = [];
  const stringsLowToHigh = [...GUITAR_STRINGS].sort((a, b) => b.string - a.string);
  stringsLowToHigh.forEach((guitarString) => {
    const cells = [];
    for (let fret = startFret; fret <= endFret; fret += 1) {
      const key = `${guitarString.string}:${fret}`;
      const marker = markerByPosition.get(key);
      if (marker) {
        const dot = marker.finger;
        const openClass = fret === 0 ? ' open' : '';
        cells.push(`<td class="is-hit${openClass}" title="${marker.note} · S${marker.string} F${marker.fret} · finger ${dot}">${dot}</td>`);
      } else {
        cells.push('<td></td>');
      }
    }
    rows.push(`<tr><th>${guitarString.label}</th>${cells.join('')}</tr>`);
  });

  container.innerHTML = `
    <table class="fingerboard-table">
      <thead>
        <tr><th>Str</th>${headerCells.join('')}</tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;

  return {
    target: tabbed.map((note) => `S${note.tab.string} F${note.tab.fret}`).join(' + '),
    hint: tabbed.length > 1
      ? 'Press these strings together.'
      : `Press ${tabbed[0].note} on string ${tabbed[0].tab.string}, fret ${tabbed[0].tab.fret}.`,
    legend: tabbed
      .map((note) => {
        const finger = fingerMap.get(`${note.tab.string}:${note.tab.fret}`) || '?';
        return `S${note.tab.string} F${note.tab.fret}: finger ${finger}`;
      })
      .join(' | '),
    next: nextSummary,
  };
}
