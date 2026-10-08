// Renders the previous/current/next note slots.
import { CHORD_GROUP_EPSILON_SECONDS } from '../piece.js';
import { renderFretPlan } from './timeline.js';
import { chordGroupForNote } from '../scoring.js';
import { dom, state } from '../state.js';
import { setText } from '../util.js';

export function renderTabSlot({ tabEl, hintEl, diagramEl }, note, emptyMessage) {
  const group = chordGroupForNote(note);
  const { summary, hint, diagram } = state.instrument.describeSlot(note, group, emptyMessage);
  setText(tabEl, summary);
  setText(hintEl, hint);
  setText(diagramEl, diagram);
}

export function tabIndicesAt(shiftedElapsedSeconds) {
  const notes = state.activePiece.notes;
  if (state.practiceMode === 'step') {
    if (state.stepIndex >= notes.length) {
      return {
        prevIndex: notes.length - 1,
        currentIndex: -1,
        nextIndex: -1,
      };
    }

    return {
      prevIndex: state.stepIndex - 1,
      currentIndex: state.stepIndex,
      nextIndex: state.stepIndex + 1,
    };
  }

  const currentIndex = notes.findIndex(
    (note) => shiftedElapsedSeconds >= note.start && shiftedElapsedSeconds < note.end,
  );

  if (currentIndex >= 0) {
    return {
      prevIndex: currentIndex - 1,
      currentIndex,
      nextIndex: currentIndex + 1,
    };
  }

  let prevIndex = -1;
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (notes[i].end <= shiftedElapsedSeconds) {
      prevIndex = i;
      break;
    }
  }

  let nextIndex = notes.findIndex((note) => note.start > shiftedElapsedSeconds);
  if (nextIndex === -1 && shiftedElapsedSeconds < notes[0].start) {
    nextIndex = 0;
  }

  return {
    prevIndex,
    currentIndex: -1,
    nextIndex,
  };
}

export function findPrevGroupAnchorIndex(notes, startTime) {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (notes[i].start < startTime - CHORD_GROUP_EPSILON_SECONDS) {
      return i;
    }
  }
  return -1;
}

export function findNextGroupAnchorIndex(notes, startTime) {
  return notes.findIndex((note) => note.start > startTime + CHORD_GROUP_EPSILON_SECONDS);
}

export function renderTabs(targetNote, shiftedElapsedSeconds) {
  const notes = state.activePiece.notes;
  const { prevIndex, currentIndex, nextIndex } = tabIndicesAt(shiftedElapsedSeconds);

  let previousNote = prevIndex >= 0 ? notes[prevIndex] : null;
  const currentNote = currentIndex >= 0 ? notes[currentIndex] : targetNote || null;
  let nextNote = nextIndex >= 0 && nextIndex < notes.length ? notes[nextIndex] : null;

  if (!state.simplifyTabs) {
    if (currentNote) {
      const prevAnchor = findPrevGroupAnchorIndex(notes, currentNote.start);
      const nextAnchor = findNextGroupAnchorIndex(notes, currentNote.start);
      previousNote = prevAnchor >= 0 ? notes[prevAnchor] : null;
      nextNote = nextAnchor >= 0 ? notes[nextAnchor] : null;
    } else {
      const prevByTime = notes.findLastIndex((note) => note.end <= shiftedElapsedSeconds);
      const nextByTime = notes.findIndex((note) => note.start > shiftedElapsedSeconds + CHORD_GROUP_EPSILON_SECONDS);
      previousNote = prevByTime >= 0 ? notes[prevByTime] : null;
      nextNote = nextByTime >= 0 ? notes[nextByTime] : null;
    }
  }

  renderFretPlan(notes, currentIndex, nextIndex, shiftedElapsedSeconds);

  renderTabSlot(
    { tabEl: dom.prevTab, hintEl: dom.prevHint, diagramEl: dom.prevDiagram },
    previousNote,
    'No previous note yet',
  );
  renderTabSlot(
    { tabEl: dom.currentTab, hintEl: dom.currentHint, diagramEl: dom.currentDiagram },
    currentNote,
    'No active note window',
  );
  renderTabSlot(
    { tabEl: dom.nextTab, hintEl: dom.nextHint, diagramEl: dom.nextDiagram },
    nextNote,
    'No next note (piece complete)',
  );
}
