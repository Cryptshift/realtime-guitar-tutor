// Per-frame listening loop: read audio, detect, score, render.
import { renderGuideTone } from './audioEngine.js';
import { computeRms, detectPitch } from './dsp/pitch.js';
import { renderFingerPlacement } from './instruments/guitar/fretboard.js';
import { frequencyToFractionalMidi } from './music.js';
import {
  renderDetected,
  renderMicStatus,
  renderStandaloneTuner,
  renderTarget,
} from './render/status.js';
import { renderTabs } from './render/tabs.js';
import {
  MAX_SCORING_FRAME_DELTA_MS,
  findTargetNoteAt,
  registerOnset,
  scoreFrame,
  skipEmptyStepNotes,
  smoothFrequency,
  withPitchHold,
} from './scoring.js';
import { dom, state } from './state.js';

export function tick() {
  if (!state.isRunning || !state.analyser || !state.data) return;
  if (state.audioCtx?.state === 'suspended') {
    state.audioCtx.resume();
  }

  const nowMs = performance.now();
  if (!state.lastTickAtMs) {
    state.lastTickAtMs = nowMs;
  }
  const frameDeltaMs = Math.max(0, Math.min(MAX_SCORING_FRAME_DELTA_MS, nowMs - state.lastTickAtMs));
  state.lastTickAtMs = nowMs;

  const elapsedSeconds = state.pieceClock.secondsAt(nowMs);
  const offsetMs = state.practiceMode === 'timed' ? Number(dom.latencyOffset.value) : 0;
  const shiftedElapsedSeconds = elapsedSeconds + offsetMs / 1000;

  state.analyser.getFloatTimeDomainData(state.data);
  if (state.frequencyData) {
    state.analyser.getFloatFrequencyData(state.frequencyData);
  }

  const rms = computeRms(state.data);
  const pitch = detectPitch(state.data, state.audioCtx.sampleRate);
  const liveFrequency = pitch?.frequency || null;
  const onsetMs = state.onsetDetector.update({
    rms,
    pitchMidi: liveFrequency ? frequencyToFractionalMidi(liveFrequency) : null,
    nowMs,
  });
  if (onsetMs !== null) {
    registerOnset(onsetMs);
  }
  const heldFrequency = withPitchHold(liveFrequency);
  const detectedFrequency = smoothFrequency(heldFrequency);
  skipEmptyStepNotes();
  const targetNote = state.practiceMode === 'step'
    ? (state.activePiece.notes[state.stepIndex] || null)
    : findTargetNoteAt(shiftedElapsedSeconds, state.activePiece);
  renderGuideTone(targetNote);

  renderMicStatus(rms, liveFrequency);
  renderDetected(detectedFrequency);
  renderStandaloneTuner(detectedFrequency);
  renderFingerPlacement(targetNote, shiftedElapsedSeconds);

  if (state.listenMode === 'tuner') {
    dom.targetNote.textContent = '--';
    dom.targetWindow.textContent = 'Song tracking paused (tuner listening)';
    dom.closeness.textContent = '--';
    dom.centsOff.textContent = 'Use standalone tuner on the right';
    state.rafId = requestAnimationFrame(tick);
    return;
  }

  renderTarget(targetNote, shiftedElapsedSeconds);
  renderTabs(targetNote, shiftedElapsedSeconds);
  scoreFrame({
    detectedFrequency: liveFrequency,
    hasLivePitch: Boolean(liveFrequency),
    frequencyData: state.frequencyData,
    sampleRate: state.audioCtx.sampleRate,
    fftSize: state.analyser.fftSize,
    frameDeltaMs,
    targetNote,
    shiftedElapsedSeconds,
  });

  state.rafId = requestAnimationFrame(tick);
}
