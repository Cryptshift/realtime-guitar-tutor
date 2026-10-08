// Entry point: wires DOM events and initializes the app.
import {
  playBackingTrack,
  releaseBackingTrackUrl,
  setBackingTrackFile,
  setBackingTrackVolume,
  setGuideToneEnabled,
  startAudio,
  stopAudio,
  stopBackingTrack,
} from './audioEngine.js';
import {
  loadFromSongSelectValue,
  loadPreset,
  populatePieceSelect,
  populateTuningSetSelect,
  resetTaskProgress,
  restartPiece,
  setActiveBpm,
  setBeginnerSimplifyEnabled,
  setChordStepAdvanceEnabled,
  setSidePanelMode,
  setTunerTarget,
  setTuningSet,
  updateModeUi,
} from './controls.js';
import {
  cancelAudioTabGeneration,
  generateTabsFromAudio,
  importTabFromUrl,
  loadCustomPiece,
  setAudioTabStatus,
  setImportStatus,
} from './importPanel.js';
import { renderStandaloneTuner, setMicLevel } from './render/status.js';
import { renderTabs } from './render/tabs.js';
import { dom, queryDom, state } from './state.js';

export const START_HOTKEY = 'Space';

export function bindEvents() {
  const handleHotkeys = (event) => {
    if (event.code !== START_HOTKEY || event.repeat) return;

    const target = event.target;
    const tagName = target?.tagName?.toUpperCase();
    const isTypingElement = (
      target?.isContentEditable
      || tagName === 'INPUT'
      || tagName === 'TEXTAREA'
      || tagName === 'SELECT'
      || tagName === 'BUTTON'
    );

    if (isTypingElement) return;

    event.preventDefault();
    restartPiece();
  };

  window.addEventListener('keydown', handleHotkeys);

  dom.modeSelect.addEventListener('change', (event) => {
    const nextMode = event.target.value === 'step' ? 'step' : 'timed';
    state.practiceMode = nextMode;
    updateModeUi();
    restartPiece();
  });

  dom.tuningSetSelect.addEventListener('change', (event) => {
    setTuningSet(event.target.value);
    renderStandaloneTuner(state.lastDetectedFrequency);
  });

  dom.tunerNoteSelect.addEventListener('change', (event) => {
    setTunerTarget(event.target.value);
    renderStandaloneTuner(state.lastDetectedFrequency);
  });

  dom.songSelect.addEventListener('change', (event) => {
    loadFromSongSelectValue(event.target.value);
  });

  dom.toggleTunerBtn.addEventListener('click', () => {
    setSidePanelMode(state.sidePanelMode === 'tuner' ? 'fingering' : 'tuner');
  });

  dom.simplifyTabsToggle.addEventListener('change', (event) => {
    setBeginnerSimplifyEnabled(event.target.checked);
    updateModeUi();
    restartPiece();
  });

  dom.chordStepToggle.addEventListener('change', (event) => {
    setChordStepAdvanceEnabled(event.target.checked);
    updateModeUi();
    restartPiece();
  });

  dom.guideToneToggle.addEventListener('change', (event) => {
    setGuideToneEnabled(event.target.checked);
  });

  dom.backingTrackInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0] || null;
    setBackingTrackFile(file);
  });

  dom.backingTrackVolume.addEventListener('input', () => {
    setBackingTrackVolume(dom.backingTrackVolume.value);
  });

  dom.playTrackBtn.addEventListener('click', () => {
    playBackingTrack({ restart: false });
  });

  dom.stopTrackBtn.addEventListener('click', () => stopBackingTrack({ reset: false }));

  dom.bpmSlider.addEventListener('input', () => {
    setActiveBpm(dom.bpmSlider.value);
  });

  dom.latencyOffset.addEventListener('input', () => {
    state.latencyOffsetMs = Number(dom.latencyOffset.value) || 0;
    dom.latencyOffsetValue.textContent = `${dom.latencyOffset.value} ms`;
  });

  dom.startBtn.addEventListener('click', () => startAudio('practice'));
  dom.stopBtn.addEventListener('click', stopAudio);
  dom.tunerStartBtn.addEventListener('click', () => startAudio('tuner'));
  dom.tunerStopBtn.addEventListener('click', stopAudio);
  dom.restartBtn.addEventListener('click', restartPiece);
  dom.loadCustomBtn.addEventListener('click', loadCustomPiece);
  dom.importTabBtn.addEventListener('click', importTabFromUrl);
  dom.generateAudioTabBtn.addEventListener('click', generateTabsFromAudio);
  dom.cancelAudioTabBtn.addEventListener('click', cancelAudioTabGeneration);

  dom.tabUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      importTabFromUrl();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopBackingTrack({ reset: false });
    releaseBackingTrackUrl();
    stopAudio();
  });
}

export function init() {
  Object.assign(dom, queryDom());
  state.latencyOffsetMs = Number(dom.latencyOffset.value) || 0;
  populatePieceSelect();
  populateTuningSetSelect();
  setTuningSet(state.tunerSetKey, state.tunerTargetNote);
  setSidePanelMode('tuner');
  setGuideToneEnabled(false);
  setBeginnerSimplifyEnabled(true);
  setBackingTrackVolume(dom.backingTrackVolume.value);
  resetTaskProgress(dom.importProgress);
  resetTaskProgress(dom.audioTabProgress);
  bindEvents();
  loadPreset(0);
  updateModeUi();
  dom.restartBtn.disabled = false;
  dom.tunerStartBtn.disabled = false;
  dom.tunerStopBtn.disabled = true;
  dom.playTrackBtn.disabled = true;
  dom.stopTrackBtn.disabled = true;
  dom.micStatus.textContent = 'Idle';
  setMicLevel(0);
  renderTabs(null, 0);
  renderStandaloneTuner(null);
  setImportStatus('Import tab links into playable single-note timelines.');
  setAudioTabStatus('Upload a clean guitar recording to auto-generate beginner single-note tabs.');
}

if (typeof document !== 'undefined' && document.querySelector('#modeSelect')) {
  init();
}
