// Renders detection status, target, closeness, progress, scores and the tuner.
import { MIN_SIGNAL_RMS } from '../dsp/pitch.js';
import { frequencyToMidi, midiToNoteName, tunerCentsFromTarget } from '../music.js';
import { timelineActiveSegmentIndex, timelineModelForCurrentPiece } from './timeline.js';
import {
  closenessLabel,
  isChordStepMode,
  pitchScoreForCents,
  stepGroupNotesForTarget,
} from '../scoring.js';
import { dom, state } from '../state.js';
import { setText } from '../util.js';

export const MIC_LEVEL_MAX_RMS = 0.06;

export const TUNER_VERY_CLOSE_CENTS = 5;

export function applyTunerTone(tone = 'neutral') {
  const toneClasses = ['tuner-tone-neutral', 'tuner-tone-in', 'tuner-tone-sharp', 'tuner-tone-loose'];
  if (state.tunerTone === tone) return;
  state.tunerTone = tone;
  [dom.tunerCloseness, dom.tunerCents, dom.tunerStatus].forEach((element) => {
    if (!element) return;
    element.classList.remove(...toneClasses);
    element.classList.add(`tuner-tone-${tone}`);
  });
}

function setValue(element, value) {
  if (element && element.value !== value) {
    element.value = value;
  }
}

export function setMicLevel(levelPercent) {
  const width = `${levelPercent}%`;
  if (dom.micLevelFill.style.width !== width) {
    dom.micLevelFill.style.width = width;
  }
  // Keep the meter's ARIA value in sync, in 5% steps to avoid per-frame attribute churn.
  const announced = Math.round(levelPercent / 5) * 5;
  if (dom.micLevel && dom.micLevel.getAttribute('aria-valuenow') !== String(announced)) {
    dom.micLevel.setAttribute('aria-valuenow', String(announced));
    dom.micLevel.setAttribute('aria-valuetext', `${announced}%`);
  }
}

export function renderMicStatus(rms, detectedFrequency) {
  const levelPercent = Math.min(100, Math.round((rms / MIC_LEVEL_MAX_RMS) * 100));
  setMicLevel(levelPercent);

  if (!state.isRunning) {
    setText(dom.micStatus, 'Idle');
    return;
  }

  if (rms < MIN_SIGNAL_RMS) {
    setText(dom.micStatus, 'No signal');
    return;
  }

  if (performance.now() - state.lastOnsetAtMs < 150) {
    setText(dom.micStatus, 'Note start');
    return;
  }

  if (detectedFrequency) {
    setText(dom.micStatus, 'Pitch locked');
    return;
  }

  setText(dom.micStatus, 'Signal detected');
}

export function renderDetected(frequency) {
  if (!frequency) {
    if (state.lastDisplayedDetectedFrequency) {
      const midi = frequencyToMidi(state.lastDisplayedDetectedFrequency);
      setText(dom.detectedNote, midiToNoteName(midi));
      setText(dom.detectedFreq, `${state.lastDisplayedDetectedFrequency.toFixed(1)} Hz (last)`);
    } else {
      setText(dom.detectedNote, '--');
      setText(dom.detectedFreq, 'No stable pitch');
    }
    return;
  }

  state.lastDisplayedDetectedFrequency = frequency;
  const midi = frequencyToMidi(frequency);
  setText(dom.detectedNote, midiToNoteName(midi));
  setText(dom.detectedFreq, `${frequency.toFixed(1)} Hz`);
}

export function renderTarget(target, shiftedElapsedSeconds) {
  if (state.practiceMode === 'step') {
    if (!target) {
      setText(dom.targetNote, '--');
      setText(dom.targetWindow, 'Piece complete');
      return;
    }

    const groupNotes = stepGroupNotesForTarget(target);
    const displayNotes = groupNotes.map((note) => note.note).join(' + ');
    setText(dom.targetNote, displayNotes || target.note);
    if (isChordStepMode() && groupNotes.length > 1) {
      const model = timelineModelForCurrentPiece(state.activePiece.notes);
      const currentShape = timelineActiveSegmentIndex(model.segments, target.start) + 1;
      const totalShapes = model.segments.length;
      setText(dom.targetWindow, `Shape ${currentShape}/${totalShapes} · Hit every note in this shape`);
    } else {
      setText(dom.targetWindow, `Step ${state.stepIndex + 1}/${state.activePiece.notes.length} · Play until correct`);
    }
    return;
  }

  if (!target) {
    setText(dom.targetNote, '--');
    if (shiftedElapsedSeconds > state.activePiece.totalDuration + 0.15) {
      setText(dom.targetWindow, 'Piece complete');
    } else {
      setText(dom.targetWindow, 'Waiting for next note window');
    }
    return;
  }

  setText(dom.targetNote, target.note);
  setText(dom.targetWindow, `Pluck at ${target.start.toFixed(2)}s (±${Math.round(target.onsetWindow * 1000)} ms)`);
}

export function renderCloseness(centsAbs, centsSigned, isTargetActive) {
  if (!isTargetActive) {
    setText(dom.closeness, 'Wait');
    setText(dom.centsOff, 'No active note window');
    return;
  }

  if (!Number.isFinite(centsAbs)) {
    setText(dom.closeness, '--');
    setText(dom.centsOff, 'Play the target tab note');
    return;
  }

  const label = closenessLabel(centsAbs);
  setText(dom.closeness, label);
  setText(dom.centsOff, `${centsSigned > 0 ? '+' : ''}${centsSigned.toFixed(1)} cents`);
}

export function renderProgress(noteCountHit, total, unplayableCount = 0) {
  const unplayableText = unplayableCount > 0 ? ` (${unplayableCount} unplayable skipped)` : '';
  setText(dom.progressText, `${noteCountHit} / ${total} notes hit${unplayableText}`);
  setValue(dom.pieceProgress, total > 0 ? (noteCountHit / total) * 100 : 0);
}

export function renderPieceProgress() {
  const piece = state.activePiece;
  const playable = Number.isFinite(piece.playableCount) ? piece.playableCount : piece.notes.length;
  renderProgress(state.stats.notesHit.size, playable, piece.notes.length - playable);
}

export function renderScores(mode = state.practiceMode) {
  const pitchPct = state.stats.pitchSamples
    ? Math.round((state.stats.pitchTotal / state.stats.pitchSamples) * 100)
    : 0;
  const timingPct = mode === 'timed'
    ? (
      state.stats.timingSamples
        ? Math.round((state.stats.timingTotal / state.stats.timingSamples) * 100)
        : 0
    )
    : null;
  const overall = mode === 'timed'
    ? Math.round((pitchPct + timingPct) / 2)
    : pitchPct;

  setText(dom.pitchScore, `${pitchPct}%`);
  setText(dom.timingScore, mode === 'timed' ? `${timingPct}%` : 'N/A');
  setText(dom.overallScore, `${overall}%`);
}

export function renderStandaloneTuner(detectedFrequency) {
  if (!state.tunerTarget) {
    applyTunerTone('neutral');
    setText(dom.tunerTargetDisplay, '--');
    setText(dom.tunerCloseness, '--');
    setText(dom.tunerCents, 'Select a target note');
    setText(dom.tunerStatus, 'Choose a tuning set and target note.');
    setValue(dom.tunerProgress, 0);
    return;
  }

  setText(dom.tunerTargetDisplay, state.tunerTarget.note);

  if (!state.isRunning) {
    applyTunerTone('neutral');
    setText(dom.tunerCloseness, '--');
    setText(dom.tunerCents, '0.0 cents');
    setText(dom.tunerStatus, 'Press Start Listening to tune this note.');
    setValue(dom.tunerProgress, 0);
    return;
  }

  if (!detectedFrequency) {
    applyTunerTone('neutral');
    setText(dom.tunerCloseness, '--');
    setText(dom.tunerCents, 'Play the target note');
    setText(dom.tunerStatus, `Listening for ${state.tunerTarget.note}...`);
    setValue(dom.tunerProgress, 0);
    return;
  }

  const { cents, octaveShift } = tunerCentsFromTarget(detectedFrequency, state.tunerTarget.freq);
  const centsAbs = Math.abs(cents);
  const tunePercent = Math.round(pitchScoreForCents(centsAbs) * 100);
  const isInTune = centsAbs <= TUNER_VERY_CLOSE_CENTS;
  const isSharp = !isInTune && cents > 0;
  const octaveNote = octaveShift ? ` (heard ${octaveShift > 0 ? 'an octave up' : 'an octave down'})` : '';

  if (isInTune) {
    applyTunerTone('in');
    setText(dom.tunerCloseness, 'IN TUNE');
    setText(dom.tunerCents, `${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents · in tune${octaveNote}`);
    setText(dom.tunerStatus, `${state.tunerTarget.note}: on target (${tunePercent}% in tune)`);
  } else if (isSharp) {
    applyTunerTone('sharp');
    setText(dom.tunerCloseness, 'TOO SHARP');
    setText(dom.tunerCents, `${centsAbs.toFixed(1)} cents sharp · loosen string${octaveNote}`);
    setText(dom.tunerStatus, `${state.tunerTarget.note}: too sharp - loosen string (${tunePercent}% in tune)`);
  } else {
    applyTunerTone('loose');
    setText(dom.tunerCloseness, 'TOO FLAT');
    setText(dom.tunerCents, `${centsAbs.toFixed(1)} cents flat · tighten string${octaveNote}`);
    setText(dom.tunerStatus, `${state.tunerTarget.note}: too flat - tighten string (${tunePercent}% in tune)`);
  }

  setValue(dom.tunerProgress, tunePercent);
}

export function nextUpcomingNote(shiftedElapsedSeconds) {
  const notes = state.activePiece?.notes || [];
  if (!notes.length) return null;
  return notes.find((note) => note.start > shiftedElapsedSeconds) || null;
}

// Shows the latest scoring feedback (closeness, hint) plus progress and scores.
export function renderFeedback() {
  const feedback = state.feedback;
  if (feedback) {
    renderCloseness(feedback.centsAbs, feedback.cents, feedback.active);
    if (feedback.hint) {
      setText(dom.centsOff, feedback.hint);
    }
  }
  renderPieceProgress();
  renderScores(state.practiceMode);
}
