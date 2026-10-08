// Control-panel state changes: piece selection, modes, BPM, tuner selects, restart.
import { shouldSyncBackingTrack, syncBackingTrackToPracticeStart, updateGuideToneHint } from './audioEngine.js';
import {
  TIMED_ONSET_WINDOW_MS,
  clampBpm,
  createVirtualNote,
  normalizePiece,
  presetPieces,
  toPieceSnapshot,
} from './piece.js';
import { renderCloseness, renderPieceProgress, renderScores } from './render/status.js';
import { renderTabs } from './render/tabs.js';
import { resetTimelineCaches } from './render/timeline.js';
import {
  isChordStepMode,
  pieceClockScale,
  resetOnsets,
  resetPieceClock,
  skipEmptyStepNotes,
} from './scoring.js';
import { createEmptyStats, dom, state } from './state.js';

export function syncPieceEditor(normalizedPiece) {
  dom.customPiece.value = JSON.stringify(toPieceSnapshot(normalizedPiece, state.instrument), null, 2);
}

export function setActivePieceAsImported(normalizedPiece) {
  state.activePiece = normalizedPiece;
  syncBpmSliderWithPiece(normalizedPiece);
  syncPieceEditor(normalizedPiece);
  state.importedPieces.push(toPieceSnapshot(normalizedPiece, state.instrument));
  const importedSelectValue = `imported:${state.importedPieces.length - 1}`;
  populatePieceSelect(importedSelectValue);
  restartPiece();
}

export function setChordStepAdvanceEnabled(enabled) {
  const nextValue = Boolean(enabled) && !state.simplifyTabs;
  state.chordStepAdvance = nextValue;
  if (dom.chordStepToggle) {
    dom.chordStepToggle.checked = nextValue;
    dom.chordStepToggle.disabled = state.simplifyTabs;
  }
}

export function setBeginnerSimplifyEnabled(enabled) {
  state.simplifyTabs = Boolean(enabled);
  dom.simplifyTabsToggle.checked = state.simplifyTabs;
  if (state.simplifyTabs) {
    setChordStepAdvanceEnabled(false);
  } else {
    // Default to full-shape completion whenever post-beginner mode is enabled.
    setChordStepAdvanceEnabled(true);
  }
  resetTimelineCaches();
  updateTabsPanelCopy();
}

export function updateTabsPanelCopy() {
  const isPostBeginner = !state.simplifyTabs;
  if (dom.tabsTitle) {
    dom.tabsTitle.textContent = isPostBeginner
      ? 'Post-Beginner Tabs (Multi-String)'
      : 'Beginner Tabs (No Chords)';
  }
  if (dom.tabsSubtitle) {
    dom.tabsSubtitle.textContent = isPostBeginner
      ? 'If notes line up together, press those strings at the same time.'
      : 'Play one string at a time.';
  }
  if (dom.chordStepRow) {
    dom.chordStepRow.hidden = !isPostBeginner;
  }
}

export function populatePieceSelect(selectedValue = null) {
  dom.songSelect.innerHTML = '';
  presetPieces.forEach((piece, index) => {
    const option = document.createElement('option');
    option.value = `preset:${index}`;
    option.textContent = piece.name;
    dom.songSelect.append(option);
  });

  state.importedPieces.forEach((piece, index) => {
    const option = document.createElement('option');
    option.value = `imported:${index}`;
    option.textContent = `${piece.name} (Imported)`;
    dom.songSelect.append(option);
  });

  if (selectedValue) {
    const hasOption = [...dom.songSelect.options].some((option) => option.value === selectedValue);
    if (hasOption) {
      dom.songSelect.value = selectedValue;
    }
  }
}

// Tuner presets come from the active instrument (guitar: standard, drop D, ...).
function tuningSets() {
  return state.instrument.tuner?.sets || {};
}

export function populateTuningSetSelect() {
  dom.tuningSetSelect.innerHTML = '';
  Object.entries(tuningSets()).forEach(([setKey, setData]) => {
    const option = document.createElement('option');
    option.value = setKey;
    option.textContent = setData.label;
    dom.tuningSetSelect.append(option);
  });
}

export function populateTunerNoteSelectForSet(setKey, preferredNote = null) {
  const setData = tuningSets()[setKey];
  if (!setData) return null;

  dom.tunerNoteSelect.innerHTML = '';
  setData.notes.forEach((noteName) => {
    const option = document.createElement('option');
    option.value = noteName;
    option.textContent = noteName;
    dom.tunerNoteSelect.append(option);
  });

  const selectedNote = (
    preferredNote && setData.notes.includes(preferredNote.toUpperCase())
      ? preferredNote.toUpperCase()
      : setData.notes[0]
  );
  dom.tunerNoteSelect.value = selectedNote;
  return selectedNote;
}

export function setTunerTarget(noteName) {
  const normalized = noteName.toUpperCase();
  state.tunerTargetNote = normalized;
  state.tunerTarget = createVirtualNote(normalized, state.instrument);
  dom.tunerNoteSelect.value = normalized;
  dom.tunerTargetDisplay.textContent = normalized;
  dom.tunerStatus.textContent = `Target ${normalized}. Tune until close.`;
}

export function setTuningSet(setKey, preferredNote = null) {
  const normalizedSetKey = Object.hasOwn(tuningSets(), setKey) ? setKey : state.instrument.tuner?.defaultSet;
  state.tunerSetKey = normalizedSetKey;
  dom.tuningSetSelect.value = normalizedSetKey;

  const nextNote = populateTunerNoteSelectForSet(normalizedSetKey, preferredNote || state.tunerTargetNote);
  if (nextNote) {
    setTunerTarget(nextNote);
  }
}

export function syncBpmSliderWithPiece(piece) {
  const baseBpm = clampBpm(piece?.bpm || 100);
  state.activeBpm = baseBpm;
  dom.bpmSlider.value = String(baseBpm);
  dom.bpmValue.textContent = `${baseBpm} BPM`;
}

export function setActiveBpm(nextBpm) {
  const clamped = clampBpm(nextBpm);
  state.activeBpm = clamped;
  state.pieceClock.setScale(performance.now(), pieceClockScale());
  dom.bpmSlider.value = String(clamped);
  dom.bpmValue.textContent = `${clamped} BPM`;
}

export function setTaskProgress(progressEl, percent) {
  if (!progressEl) return;
  progressEl.hidden = false;
  progressEl.value = Math.max(0, Math.min(100, Math.round(percent)));
}

export function resetTaskProgress(progressEl) {
  if (!progressEl) return;
  progressEl.value = 0;
  progressEl.hidden = true;
}

export function setSidePanelMode(mode = 'tuner') {
  const normalized = mode === 'fingering' ? 'fingering' : 'tuner';
  state.sidePanelMode = normalized;
  dom.tunerPanel.classList.toggle('is-collapsed', normalized !== 'tuner');
  dom.fingeringPanel.classList.toggle('is-collapsed', normalized !== 'fingering');
  dom.toggleTunerBtn.textContent = normalized === 'tuner'
    ? 'Show Finger Placement'
    : 'Show Standalone Tuner';
}

export function restartPiece() {
  resetTimelineCaches();
  state.stats = createEmptyStats();
  state.frequencyHistory = [];
  state.lastDetectedFrequency = null;
  state.lastDetectedAtMs = 0;
  state.stepIndex = 0;
  resetOnsets();
  skipEmptyStepNotes();
  const restartedAtMs = performance.now();
  resetPieceClock(restartedAtMs);
  state.lastTickAtMs = restartedAtMs;
  renderPieceProgress();
  renderScores(state.practiceMode);
  renderCloseness(Number.NaN, 0, false);
  renderTabs(null, 0);
  if (state.isRunning && state.listenMode === 'practice' && shouldSyncBackingTrack()) {
    syncBackingTrackToPracticeStart();
  }
}

export function loadPreset(index) {
  const selected = presetPieces[index];
  if (!selected) return;
  state.activePiece = normalizePiece(selected, state.instrument);
  syncBpmSliderWithPiece(state.activePiece);
  dom.customLoadStatus.textContent = `Loaded: ${state.activePiece.name}`;
  syncPieceEditor(state.activePiece);
  dom.songSelect.value = `preset:${index}`;
  restartPiece();
}

export function loadImported(index) {
  const selected = state.importedPieces[index];
  if (!selected) return;
  state.activePiece = normalizePiece(selected, state.instrument);
  syncBpmSliderWithPiece(state.activePiece);
  dom.customLoadStatus.textContent = `Loaded imported: ${state.activePiece.name}`;
  syncPieceEditor(state.activePiece);
  dom.songSelect.value = `imported:${index}`;
  restartPiece();
}

export function loadFromSongSelectValue(value) {
  if (typeof value !== 'string') return;
  if (value.startsWith('preset:')) {
    const index = Number(value.slice('preset:'.length));
    loadPreset(index);
    return;
  }

  if (value.startsWith('imported:')) {
    const index = Number(value.slice('imported:'.length));
    loadImported(index);
  }
}

export function updateModeUi() {
  const isStepMode = state.practiceMode === 'step';
  dom.modeSelect.value = state.practiceMode;
  dom.modeHint.textContent = isStepMode ? 'Step-by-step flow' : 'Timed flow';

  dom.songRow.hidden = false;
  dom.latencyRow.hidden = false;
  dom.tabsSection.hidden = false;
  dom.scoreSection.hidden = false;
  dom.pieceEditorSection.hidden = false;
  dom.restartBtn.hidden = false;
  dom.progressTitle.textContent = 'Piece Progress';

  dom.latencyOffset.disabled = isStepMode;
  dom.latencyOffsetValue.textContent = isStepMode ? 'n/a' : `${dom.latencyOffset.value} ms`;
  dom.bpmSlider.disabled = isStepMode;
  dom.bpmValue.textContent = isStepMode ? `${state.activeBpm} BPM (step ignores timing)` : `${state.activeBpm} BPM`;
  dom.timingHelp.textContent = isStepMode
    ? (
      isChordStepMode()
        ? 'Step mode ignores timing. Complete every note in the current shape to advance.'
        : 'Step mode ignores timing. Play the correct note to move to the next step.'
    )
    : `Timed mode: pluck each note within ±${TIMED_ONSET_WINDOW_MS} ms of its start (tighter in fast passages). Timing accuracy = how close your note starts were.`;
  updateGuideToneHint();
  updateTabsPanelCopy();
}
