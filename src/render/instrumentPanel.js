// Renders the side panel that shows where to play the current note on the active
// instrument (the guitar fretboard today). Picks the focus/next notes generically and
// hands drawing to instrument.renderInstrumentView.
import { nextUpcomingNote } from './status.js';
import {
  chordGroupForNote,
  isChordStepMode,
  stepGroupBoundsForNote,
  stepGroupNotesForTarget,
} from '../scoring.js';
import { dom, state } from '../state.js';

function showPanelTexts({ target, hint, legend, next }) {
  dom.fingeringTarget.textContent = target;
  dom.fingeringHint.textContent = hint;
  dom.fingeringLegend.textContent = legend;
  dom.fingeringNext.textContent = `Next: ${next}`;
}

export function renderInstrumentPanel(targetNote, shiftedElapsedSeconds) {
  if (!dom.fingerboard || !dom.fingeringTarget || !dom.fingeringHint || !dom.fingeringLegend || !dom.fingeringNext) {
    return;
  }
  if (state.sidePanelMode !== 'fingering') return;
  const { instrument } = state;

  if (state.listenMode === 'tuner') {
    showPanelTexts({
      target: '--',
      hint: 'Tuner listening mode is active. Stop tuner mode to follow song placement.',
      legend: 'Finger guide is paused while tuner mode is active.',
      next: '--',
    });
    dom.fingerboard.innerHTML = '';
    state.fingerboardSignature = 'tuner-paused';
    return;
  }

  const focusNote = targetNote || (state.practiceMode === 'timed'
    ? nextUpcomingNote(shiftedElapsedSeconds)
    : (state.activePiece?.notes?.[state.stepIndex] || null));
  if (!focusNote) {
    showPanelTexts({
      target: '--',
      hint: 'No active placement right now.',
      legend: instrument.view.legend,
      next: '--',
    });
    dom.fingerboard.innerHTML = '';
    state.fingerboardSignature = 'no-focus';
    return;
  }

  const focusGroup = state.practiceMode === 'step'
    ? stepGroupNotesForTarget(focusNote)
    : chordGroupForNote(focusNote);
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

  const signature = [
    instrument.id,
    focusNote.index,
    focusGroup.map((note) => note.index).join(','),
    nextNote ? nextNote.index : '-',
    state.practiceMode,
    state.stepIndex,
  ].join('|');
  if (signature === state.fingerboardSignature) {
    return;
  }
  state.fingerboardSignature = signature;

  const texts = instrument.renderInstrumentView(dom.fingerboard, {
    current: { note: focusNote, group: focusGroup },
    upcoming: nextNote ? { note: nextNote, group: chordGroupForNote(nextNote) } : null,
  });
  showPanelTexts(texts);
}
