// Guitar fretboard (finger placement) view.
import { GUITAR_STRINGS } from './strings.js';
import { tabSummary, tabbedNotesFromGroup } from './tabView.js';
import { nextUpcomingNote } from '../../render/status.js';
import {
  chordGroupForNote,
  isChordStepMode,
  stepGroupBoundsForNote,
  stepGroupNotesForTarget,
} from '../../scoring.js';
import { dom, state } from '../../state.js';

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

export function renderFingerPlacement(targetNote, shiftedElapsedSeconds) {
  if (!dom.fingerboard || !dom.fingeringTarget || !dom.fingeringHint || !dom.fingeringLegend || !dom.fingeringNext) {
    return;
  }
  if (state.sidePanelMode !== 'fingering') return;

  if (state.listenMode === 'tuner') {
    dom.fingeringTarget.textContent = '--';
    dom.fingeringHint.textContent = 'Tuner listening mode is active. Stop tuner mode to follow song placement.';
    dom.fingeringLegend.textContent = 'Finger guide is paused while tuner mode is active.';
    dom.fingeringNext.textContent = 'Next: --';
    dom.fingerboard.innerHTML = '';
    state.fingerboardSignature = 'tuner-paused';
    return;
  }

  const focusNote = targetNote || (state.practiceMode === 'timed'
    ? nextUpcomingNote(shiftedElapsedSeconds)
    : (state.activePiece?.notes?.[state.stepIndex] || null));
  if (!focusNote) {
    dom.fingeringTarget.textContent = '--';
    dom.fingeringHint.textContent = 'No active placement right now.';
    dom.fingeringLegend.textContent = 'Finger numbers are suggested (1=index ... 4=pinky).';
    dom.fingeringNext.textContent = 'Next: --';
    dom.fingerboard.innerHTML = '';
    state.fingerboardSignature = 'no-focus';
    return;
  }

  const focusGroup = state.practiceMode === 'step'
    ? stepGroupNotesForTarget(focusNote)
    : chordGroupForNote(focusNote);
  const tabbed = tabbedNotesFromGroup(focusGroup);
  let nextNote = null;
  if (state.practiceMode === 'step') {
    if (isChordStepMode()) {
      const { endIndex } = stepGroupBoundsForNote(focusNote);
      nextNote = state.activePiece?.notes?.[endIndex + 1] || null;
    } else {
      nextNote = state.activePiece?.notes?.[state.stepIndex + 1] || null;
    }
  } else {
    nextNote = nextUpcomingNote(shiftedElapsedSeconds);
  }
  const nextSummary = nextNote ? tabSummary(nextNote) : '--';
  const positionsSignature = tabbed.map((note) => `${note.tab.string}:${note.tab.fret}`).join('|');
  const signature = `${focusNote.index}|${positionsSignature}|${nextSummary}|${state.practiceMode}|${state.stepIndex}`;

  if (signature === state.fingerboardSignature) {
    return;
  }
  state.fingerboardSignature = signature;

  if (!tabbed.length) {
    dom.fingeringTarget.textContent = focusNote.note || '--';
    dom.fingeringHint.textContent = 'No mapped string/fret for this note.';
    dom.fingeringLegend.textContent = 'Try loading tabs with fret positions.';
    dom.fingeringNext.textContent = `Next: ${nextSummary}`;
    dom.fingerboard.innerHTML = '';
    return;
  }

  const fingerMap = suggestedFingerMapForGroup(focusGroup);
  const { startFret, endFret } = fingerboardRangeForGroup(focusGroup);
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

  dom.fingerboard.innerHTML = `
    <table class="fingerboard-table">
      <thead>
        <tr><th>Str</th>${headerCells.join('')}</tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `;

  const placementSummary = tabbed.map((note) => `S${note.tab.string} F${note.tab.fret}`).join(' + ');
  dom.fingeringTarget.textContent = placementSummary;
  dom.fingeringHint.textContent = tabbed.length > 1
    ? 'Press these strings together.'
    : `Press ${tabbed[0].note} on string ${tabbed[0].tab.string}, fret ${tabbed[0].tab.fret}.`;
  dom.fingeringLegend.textContent = tabbed
    .map((note) => {
      const finger = fingerMap.get(`${note.tab.string}:${note.tab.fret}`) || '?';
      return `S${note.tab.string} F${note.tab.fret}: finger ${finger}`;
    })
    .join(' | ');
  dom.fingeringNext.textContent = `Next: ${nextSummary}`;
}
