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

export const MIC_LEVEL_MAX_RMS = 0.06;

export const TUNER_VERY_CLOSE_CENTS = 5;

export function applyTunerTone(tone = 'neutral') {
  const toneClasses = ['tuner-tone-neutral', 'tuner-tone-in', 'tuner-tone-sharp', 'tuner-tone-loose'];
  [dom.tunerCloseness, dom.tunerCents, dom.tunerStatus].forEach((element) => {
    if (!element) return;
    element.classList.remove(...toneClasses);
    element.classList.add(`tuner-tone-${tone}`);
  });
}

export function setMicLevel(levelPercent) {
  dom.micLevelFill.style.width = `${levelPercent}%`;
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
    dom.micStatus.textContent = 'Idle';
    return;
  }

  if (rms < MIN_SIGNAL_RMS) {
    dom.micStatus.textContent = 'No signal';
    return;
  }

  if (performance.now() - state.lastOnsetAtMs < 150) {
    dom.micStatus.textContent = 'Note start';
    return;
  }

  if (detectedFrequency) {
    dom.micStatus.textContent = 'Pitch locked';
    return;
  }

  dom.micStatus.textContent = 'Signal detected';
}

export function renderDetected(frequency) {
  if (!frequency) {
    if (state.lastDisplayedDetectedFrequency) {
      const midi = frequencyToMidi(state.lastDisplayedDetectedFrequency);
      dom.detectedNote.textContent = midiToNoteName(midi);
      dom.detectedFreq.textContent = `${state.lastDisplayedDetectedFrequency.toFixed(1)} Hz (last)`;
    } else {
      dom.detectedNote.textContent = '--';
      dom.detectedFreq.textContent = 'No stable pitch';
    }
    return;
  }

  state.lastDisplayedDetectedFrequency = frequency;
  const midi = frequencyToMidi(frequency);
  dom.detectedNote.textContent = midiToNoteName(midi);
  dom.detectedFreq.textContent = `${frequency.toFixed(1)} Hz`;
}

export function renderTarget(target, shiftedElapsedSeconds) {
  if (state.practiceMode === 'step') {
    if (!target) {
      dom.targetNote.textContent = '--';
      dom.targetWindow.textContent = 'Piece complete';
      return;
    }

    const groupNotes = stepGroupNotesForTarget(target);
    const displayNotes = groupNotes.map((note) => note.note).join(' + ');
    dom.targetNote.textContent = displayNotes || target.note;
    if (isChordStepMode() && groupNotes.length > 1) {
      const model = timelineModelForCurrentPiece(state.activePiece.notes);
      const currentShape = timelineActiveSegmentIndex(model.segments, target.start) + 1;
      const totalShapes = model.segments.length;
      dom.targetWindow.textContent = `Shape ${currentShape}/${totalShapes} · Hit every note in this shape`;
    } else {
      dom.targetWindow.textContent = `Step ${state.stepIndex + 1}/${state.activePiece.notes.length} · Play until correct`;
    }
    return;
  }

  if (!target) {
    dom.targetNote.textContent = '--';
    if (shiftedElapsedSeconds > state.activePiece.totalDuration + 0.15) {
      dom.targetWindow.textContent = 'Piece complete';
    } else {
      dom.targetWindow.textContent = 'Waiting for next note window';
    }
    return;
  }

  dom.targetNote.textContent = target.note;
  dom.targetWindow.textContent = `Pluck at ${target.start.toFixed(2)}s (±${Math.round(target.onsetWindow * 1000)} ms)`;
}

export function renderCloseness(centsAbs, centsSigned, isTargetActive) {
  if (!isTargetActive) {
    dom.closeness.textContent = 'Wait';
    dom.centsOff.textContent = 'No active note window';
    return;
  }

  if (!Number.isFinite(centsAbs)) {
    dom.closeness.textContent = '--';
    dom.centsOff.textContent = 'Play the target tab note';
    return;
  }

  const label = closenessLabel(centsAbs);
  dom.closeness.textContent = label;
  dom.centsOff.textContent = `${centsSigned > 0 ? '+' : ''}${centsSigned.toFixed(1)} cents`;
}

export function renderProgress(noteCountHit, total, unplayableCount = 0) {
  const unplayableText = unplayableCount > 0 ? ` (${unplayableCount} unplayable skipped)` : '';
  dom.progressText.textContent = `${noteCountHit} / ${total} notes hit${unplayableText}`;
  dom.pieceProgress.value = total > 0 ? (noteCountHit / total) * 100 : 0;
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

  dom.pitchScore.textContent = `${pitchPct}%`;
  dom.timingScore.textContent = mode === 'timed' ? `${timingPct}%` : 'N/A';
  dom.overallScore.textContent = `${overall}%`;
}

export function renderStandaloneTuner(detectedFrequency) {
  if (!state.tunerTarget) {
    applyTunerTone('neutral');
    dom.tunerTargetDisplay.textContent = '--';
    dom.tunerCloseness.textContent = '--';
    dom.tunerCents.textContent = 'Select a target note';
    dom.tunerStatus.textContent = 'Choose a tuning set and target note.';
    dom.tunerProgress.value = 0;
    return;
  }

  dom.tunerTargetDisplay.textContent = state.tunerTarget.note;

  if (!state.isRunning) {
    applyTunerTone('neutral');
    dom.tunerCloseness.textContent = '--';
    dom.tunerCents.textContent = '0.0 cents';
    dom.tunerStatus.textContent = 'Press Start Listening to tune this note.';
    dom.tunerProgress.value = 0;
    return;
  }

  if (!detectedFrequency) {
    applyTunerTone('neutral');
    dom.tunerCloseness.textContent = '--';
    dom.tunerCents.textContent = 'Play the target note';
    dom.tunerStatus.textContent = `Listening for ${state.tunerTarget.note}...`;
    dom.tunerProgress.value = 0;
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
    dom.tunerCloseness.textContent = 'IN TUNE';
    dom.tunerCents.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents · in tune${octaveNote}`;
    dom.tunerStatus.textContent = `${state.tunerTarget.note}: on target (${tunePercent}% in tune)`;
  } else if (isSharp) {
    applyTunerTone('sharp');
    dom.tunerCloseness.textContent = 'TOO SHARP';
    dom.tunerCents.textContent = `${centsAbs.toFixed(1)} cents sharp · loosen string${octaveNote}`;
    dom.tunerStatus.textContent = `${state.tunerTarget.note}: too sharp - loosen string (${tunePercent}% in tune)`;
  } else {
    applyTunerTone('loose');
    dom.tunerCloseness.textContent = 'TOO FLAT';
    dom.tunerCents.textContent = `${centsAbs.toFixed(1)} cents flat · tighten string${octaveNote}`;
    dom.tunerStatus.textContent = `${state.tunerTarget.note}: too flat - tighten string (${tunePercent}% in tune)`;
  }

  dom.tunerProgress.value = tunePercent;
}

export function nextUpcomingNote(shiftedElapsedSeconds) {
  const notes = state.activePiece?.notes || [];
  if (!notes.length) return null;
  return notes.find((note) => note.start > shiftedElapsedSeconds) || null;
}
