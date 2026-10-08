// Audio I/O: microphone start/stop, guide tone, backing track.
import { FFT_SIZE } from './dsp/pitch.js';
import { tick } from './loop.js';
import { renderStandaloneTuner, setMicLevel } from './render/status.js';
import { resetOnsets, resetPieceClock } from './scoring.js';
import { createEmptyStats, dom, state } from './state.js';
import { formatClock } from './util.js';

export function updateGuideToneHint() {
  if (!state.guideToneEnabled) {
    dom.guideToneHint.textContent = 'Off';
    return;
  }
  if (state.practiceMode !== 'timed') {
    dom.guideToneHint.textContent = 'On (Timed mode only)';
    return;
  }
  dom.guideToneHint.textContent = 'On (use headphones so the mic does not hear it)';
}

export function setGuideToneEnabled(enabled) {
  state.guideToneEnabled = Boolean(enabled);
  dom.guideToneToggle.checked = state.guideToneEnabled;
  updateGuideToneHint();
  if (!state.guideToneEnabled && state.guideToneGain && state.audioCtx) {
    const now = state.audioCtx.currentTime;
    state.guideToneGain.gain.cancelScheduledValues(now);
    state.guideToneGain.gain.setTargetAtTime(0, now, 0.02);
  }
}

export function ensureGuideToneNodes() {
  if (!state.audioCtx) return;
  if (state.guideToneOscillator && state.guideToneGain) return;

  const gain = state.audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(state.audioCtx.destination);

  const oscillator = state.audioCtx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = 440;
  oscillator.connect(gain);
  oscillator.start();

  state.guideToneOscillator = oscillator;
  state.guideToneGain = gain;
}

export function stopGuideToneNodes() {
  if (state.guideToneOscillator) {
    try {
      state.guideToneOscillator.stop();
    } catch {
      // ignore stop-on-stopped errors
    }
    state.guideToneOscillator.disconnect();
  }
  if (state.guideToneGain) {
    state.guideToneGain.disconnect();
  }
  state.guideToneOscillator = null;
  state.guideToneGain = null;
}

export function renderGuideTone(targetNote) {
  if (!state.audioCtx || !state.guideToneEnabled || state.practiceMode !== 'timed' || state.listenMode !== 'practice') {
    if (state.guideToneGain) {
      const now = state.audioCtx?.currentTime || 0;
      state.guideToneGain.gain.cancelScheduledValues(now);
      state.guideToneGain.gain.setTargetAtTime(0, now, 0.02);
    }
    return;
  }

  ensureGuideToneNodes();
  if (!state.guideToneOscillator || !state.guideToneGain) return;

  const now = state.audioCtx.currentTime;
  if (!targetNote) {
    state.guideToneGain.gain.cancelScheduledValues(now);
    state.guideToneGain.gain.setTargetAtTime(0, now, 0.02);
    return;
  }

  state.guideToneOscillator.frequency.setTargetAtTime(targetNote.freq, now, 0.012);
  state.guideToneGain.gain.cancelScheduledValues(now);
  state.guideToneGain.gain.setTargetAtTime(0.045, now, 0.02);
}

export function getBackingTrackAudio() {
  if (state.backingTrackAudio) {
    return state.backingTrackAudio;
  }

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = Number(dom.backingTrackVolume?.value || 80) / 100;
  audio.addEventListener('timeupdate', () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    dom.backingTrackTime.textContent = `${formatClock(audio.currentTime)} / ${formatClock(duration)}`;
  });
  audio.addEventListener('loadedmetadata', () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    dom.backingTrackTime.textContent = `${formatClock(audio.currentTime)} / ${formatClock(duration)}`;
  });
  audio.addEventListener('play', () => {
    dom.playTrackBtn.disabled = true;
    dom.stopTrackBtn.disabled = false;
  });
  audio.addEventListener('pause', () => {
    dom.playTrackBtn.disabled = !audio.src;
    dom.stopTrackBtn.disabled = true;
  });
  audio.addEventListener('ended', () => {
    dom.playTrackBtn.disabled = !audio.src;
    dom.stopTrackBtn.disabled = true;
    dom.backingTrackStatus.textContent = state.backingTrackName
      ? `Track finished: ${state.backingTrackName}`
      : 'Track finished';
  });
  audio.addEventListener('error', () => {
    dom.backingTrackStatus.textContent = 'Track load/play error';
  });

  state.backingTrackAudio = audio;
  return audio;
}

export function releaseBackingTrackUrl() {
  if (state.backingTrackUrl) {
    URL.revokeObjectURL(state.backingTrackUrl);
    state.backingTrackUrl = null;
  }
}

export function setBackingTrackVolume(volumePercent) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(volumePercent) || 0)));
  dom.backingTrackVolume.value = String(clamped);
  dom.backingTrackVolumeValue.textContent = `${clamped}%`;
  if (state.backingTrackAudio) {
    state.backingTrackAudio.volume = clamped / 100;
  }
}

export function setBackingTrackFile(file) {
  if (!file) {
    dom.backingTrackStatus.textContent = 'No track loaded';
    dom.backingTrackTime.textContent = '00:00 / 00:00';
    dom.playTrackBtn.disabled = true;
    dom.stopTrackBtn.disabled = true;
    state.backingTrackName = '';
    if (state.backingTrackAudio) {
      state.backingTrackAudio.pause();
      state.backingTrackAudio.removeAttribute('src');
      state.backingTrackAudio.load();
    }
    releaseBackingTrackUrl();
    return;
  }

  const audio = getBackingTrackAudio();
  audio.pause();
  releaseBackingTrackUrl();
  state.backingTrackUrl = URL.createObjectURL(file);
  state.backingTrackName = file.name;
  audio.src = state.backingTrackUrl;
  audio.currentTime = 0;
  audio.load();
  dom.backingTrackStatus.textContent = `Loaded: ${file.name}`;
  dom.playTrackBtn.disabled = false;
  dom.stopTrackBtn.disabled = true;
  dom.backingTrackTime.textContent = '00:00 / 00:00';
}

export async function playBackingTrack({ restart = false } = {}) {
  const audio = getBackingTrackAudio();
  if (!audio.src) {
    dom.backingTrackStatus.textContent = 'Load a backing track first';
    return;
  }
  if (restart) {
    audio.currentTime = 0;
  }
  try {
    await audio.play();
    dom.backingTrackStatus.textContent = state.backingTrackName
      ? `Playing: ${state.backingTrackName}`
      : 'Playing backing track';
  } catch (error) {
    dom.backingTrackStatus.textContent = `Track play blocked: ${error.message}`;
  }
}

export function stopBackingTrack({ reset = false } = {}) {
  const audio = state.backingTrackAudio;
  if (!audio || !audio.src) return;
  audio.pause();
  if (reset) {
    audio.currentTime = 0;
  }
  dom.playTrackBtn.disabled = false;
  dom.stopTrackBtn.disabled = true;
  dom.backingTrackStatus.textContent = state.backingTrackName
    ? `${reset ? 'Stopped' : 'Paused'}: ${state.backingTrackName}`
    : (reset ? 'Track stopped' : 'Track paused');
}

export function shouldSyncBackingTrack() {
  return Boolean(dom.syncTrackOnStart?.checked);
}

export async function syncBackingTrackToPracticeStart() {
  if (state.listenMode !== 'practice' || !shouldSyncBackingTrack()) return;
  if (!state.backingTrackAudio || !state.backingTrackAudio.src) return;
  await playBackingTrack({ restart: true });
}

export function setListenButtonsDisabled(disabled) {
  dom.startBtn.disabled = disabled;
  dom.tunerStartBtn.disabled = disabled;
}

export async function startAudio(listenMode = 'practice') {
  // Guard before any await so a double click can't open two mic streams/contexts.
  if (state.isRunning || state.isStarting) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    dom.customLoadStatus.textContent = 'Your browser does not support microphone input.';
    return;
  }

  state.isStarting = true;
  setListenButtonsDisabled(true);
  dom.micStatus.textContent = 'Requesting microphone...';

  let stream = null;
  let audioCtx = null;
  try {
    // Speech processing (echo cancellation, noise suppression, auto gain) treats sustained
    // instrument tones as noise and pumps the level, so ask for the raw signal.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
        channelCount: 1,
      },
      video: false,
    });

    audioCtx = new AudioContext();
    await audioCtx.resume();
    state.mediaStream = stream;
    state.audioCtx = audioCtx;
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = FFT_SIZE;
    state.analyser.smoothingTimeConstant = 0.8;
    state.data = new Float32Array(state.analyser.fftSize);
    state.frequencyData = new Float32Array(state.analyser.frequencyBinCount);

    state.source = state.audioCtx.createMediaStreamSource(state.mediaStream);
    state.source.connect(state.analyser);
    if (state.guideToneEnabled) {
      ensureGuideToneNodes();
    }

    state.stats = createEmptyStats();
    state.frequencyHistory = [];
    state.lastDetectedFrequency = null;
    state.lastDetectedAtMs = 0;
    state.onsetDetector.reset();
    resetOnsets();
    const startedAtMs = performance.now();
    resetPieceClock(startedAtMs);
    state.lastTickAtMs = startedAtMs;
    state.listenMode = listenMode === 'tuner' ? 'tuner' : 'practice';
    state.isRunning = true;

    dom.startBtn.disabled = true;
    dom.stopBtn.disabled = false;
    dom.tunerStartBtn.disabled = true;
    dom.tunerStopBtn.disabled = false;
    dom.restartBtn.disabled = false;
    dom.micStatus.textContent = 'Listening...';

    if (state.listenMode === 'practice' && shouldSyncBackingTrack()) {
      syncBackingTrackToPracticeStart();
    }

    tick();
  } catch (error) {
    // Release anything acquired before the failure so the mic indicator turns off.
    stream?.getTracks().forEach((track) => track.stop());
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
    stopGuideToneNodes();
    state.mediaStream = null;
    state.audioCtx = null;
    state.analyser = null;
    state.source = null;
    state.data = null;
    state.frequencyData = null;
    state.isRunning = false;
    setListenButtonsDisabled(false);
    dom.micStatus.textContent = 'Mic error';
    dom.customLoadStatus.textContent = `Mic error: ${error.message}`;
    dom.tunerStatus.textContent = `Mic error: ${error.message}`;
  } finally {
    state.isStarting = false;
  }
}

export function stopAudio() {
  if (!state.isRunning) return;

  state.isRunning = false;
  cancelAnimationFrame(state.rafId);

  if (state.source) state.source.disconnect();
  if (state.analyser) state.analyser.disconnect();
  stopGuideToneNodes();

  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
  }

  if (state.audioCtx && state.audioCtx.state !== 'closed') {
    state.audioCtx.close();
  }

  state.audioCtx = null;
  state.analyser = null;
  state.mediaStream = null;
  state.source = null;
  state.data = null;
  state.frequencyData = null;
  state.frequencyHistory = [];
  state.lastDetectedFrequency = null;
  state.lastDetectedAtMs = 0;
  state.lastTickAtMs = 0;
  state.listenMode = 'practice';

  dom.startBtn.disabled = false;
  dom.stopBtn.disabled = true;
  dom.tunerStartBtn.disabled = false;
  dom.tunerStopBtn.disabled = true;
  dom.micStatus.textContent = 'Stopped';
  setMicLevel(0);
  stopBackingTrack({ reset: false });
  renderStandaloneTuner(null);
}
