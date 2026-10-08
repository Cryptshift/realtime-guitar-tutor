// Listening loop. Detection runs off the main thread (capture worklet -> detector worker);
// this module consumes the worker's per-frame results for scoring and renders the UI
// once per display frame.
import { renderGuideTone } from './audioEngine.js';
import {
  renderDetected,
  renderFeedback,
  renderMicStatus,
  renderStandaloneTuner,
  renderTarget,
} from './render/status.js';
import { renderInstrumentPanel } from './render/instrumentPanel.js';
import { renderTabs } from './render/tabs.js';
import {
  MAX_SCORING_FRAME_DELTA_MS,
  findTargetNoteAt,
  isChordStepMode,
  latencyOffsetSeconds,
  registerOnset,
  scoreFrame,
  skipEmptyStepNotes,
  smoothFrequency,
  withPitchHold,
} from './scoring.js';
import { dom, state } from './state.js';
import { setText } from './util.js';

// AudioContext time (s) -> performance.now() time (ms), using the context's clock now.
function contextTimeToPerfMs(contextTime) {
  return performance.now() - (state.audioCtx.currentTime - contextTime) * 1000;
}

function currentTargetNote(shiftedElapsedSeconds) {
  return state.practiceMode === 'step'
    ? (state.activePiece.notes[state.stepIndex] || null)
    : findTargetNoteAt(shiftedElapsedSeconds, state.activePiece);
}

// One analysis result from the detector worker (every hop, ~5 ms): onset bookkeeping,
// pitch smoothing and scoring. No DOM work here.
export function handleAnalysisFrame(result) {
  if (!state.isRunning || !state.audioCtx) return;

  const frameMs = contextTimeToPerfMs(result.endTime);
  if (!state.lastTickAtMs) {
    state.lastTickAtMs = frameMs;
  }
  const frameDeltaMs = Math.max(0, Math.min(MAX_SCORING_FRAME_DELTA_MS, frameMs - state.lastTickAtMs));
  state.lastTickAtMs = frameMs;

  const liveFrequency = result.frequency || null;
  if (result.onsetTime !== null) {
    registerOnset(contextTimeToPerfMs(result.onsetTime));
  }
  const detectedFrequency = smoothFrequency(withPitchHold(liveFrequency));
  state.analysis = { rms: result.rms, liveFrequency, detectedFrequency };

  if (state.listenMode === 'tuner') return;

  const shiftedElapsedSeconds = state.pieceClock.secondsAt(frameMs) + latencyOffsetSeconds();
  skipEmptyStepNotes();
  const targetNote = currentTargetNote(shiftedElapsedSeconds);

  // The spectrum (native FFT) is only needed to match full chord shapes.
  const needsSpectrum = Boolean(isChordStepMode() && state.analyser && state.frequencyData);
  if (needsSpectrum) {
    state.analyser.getFloatFrequencyData(state.frequencyData);
  }

  scoreFrame({
    detectedFrequency: liveFrequency,
    hasLivePitch: Boolean(liveFrequency),
    frequencyData: needsSpectrum ? state.frequencyData : null,
    sampleRate: state.audioCtx.sampleRate,
    fftSize: state.analyser?.fftSize,
    frameDeltaMs,
    targetNote,
    shiftedElapsedSeconds,
  });
}

// Display-rate render (requestAnimationFrame). Render helpers only touch the DOM when a
// value actually changed.
export function renderFrame() {
  if (!state.isRunning) return;
  if (state.audioCtx?.state === 'suspended') {
    state.audioCtx.resume();
  }

  const nowMs = performance.now();
  const shiftedElapsedSeconds = state.pieceClock.secondsAt(nowMs) + latencyOffsetSeconds();
  const targetNote = currentTargetNote(shiftedElapsedSeconds);
  renderGuideTone(targetNote);

  const analysis = state.analysis || { rms: 0, liveFrequency: null, detectedFrequency: null };
  renderMicStatus(analysis.rms, analysis.liveFrequency);
  renderDetected(analysis.detectedFrequency);
  renderStandaloneTuner(analysis.detectedFrequency);
  renderInstrumentPanel(targetNote, shiftedElapsedSeconds);

  if (state.listenMode === 'tuner') {
    setText(dom.targetNote, '--');
    setText(dom.targetWindow, 'Song tracking paused (tuner listening)');
    setText(dom.closeness, '--');
    setText(dom.centsOff, 'Use standalone tuner on the right');
  } else {
    renderTarget(targetNote, shiftedElapsedSeconds);
    renderTabs(targetNote, shiftedElapsedSeconds);
    renderFeedback();
  }

  state.rafId = requestAnimationFrame(renderFrame);
}
