const A4 = 440;
const A4_MIDI = 69;
const FFT_SIZE = 2048;
const MIN_CONFIDENCE = 0.45;
const MIN_SIGNAL_RMS = 0.0025;
const MIC_LEVEL_MAX_RMS = 0.06;
const MAX_CENTS_FOR_PERFECT = 12;
const MAX_CENTS_FOR_GOOD = 28;
const HIT_CENTS_THRESHOLD = 35;
const HIT_TIMING_THRESHOLD_MS = 180;
const MIN_HIT_STREAK = 2;
const STEP_MIN_HIT_HOLD_MS = 220;
const TIMED_MIN_HIT_HOLD_MS = 140;
const MAX_SCORING_FRAME_DELTA_MS = 80;
const SMOOTHING_WINDOW = 5;
const HOLD_PITCH_MS = 200;
const MAX_FRET_FOR_BEGINNER_TAB = 15;
const START_HOTKEY = 'Space';
const TUNER_VERY_CLOSE_CENTS = 5;
const DEFAULT_TAB_MS_PER_COLUMN = 120;
const TIMED_HIT_WINDOW_MS = 140;
const DEFAULT_COLUMNS_PER_BEAT = 4;
const TAB_NOTE_SUSTAIN_RATIO = 0.98;
const TAB_SYSTEM_GAP_COLUMNS = 0;
const CHORD_GROUP_EPSILON_SECONDS = 0.035;
const CHORD_SPECTRAL_MIN_DB = -72;
const CHORD_SPECTRAL_MATCH_RATIO = 0.42;

const GUITAR_STRINGS = [
  { string: 1, label: 'e', display: 'High e (1st)', openMidi: 64 },
  { string: 2, label: 'B', display: 'B (2nd)', openMidi: 59 },
  { string: 3, label: 'G', display: 'G (3rd)', openMidi: 55 },
  { string: 4, label: 'D', display: 'D (4th)', openMidi: 50 },
  { string: 5, label: 'A', display: 'A (5th)', openMidi: 45 },
  { string: 6, label: 'E', display: 'Low E (6th)', openMidi: 40 },
];

const DEFAULT_OPEN_MIDI_BY_STRING = GUITAR_STRINGS.reduce((acc, guitarString) => {
  acc[guitarString.string] = guitarString.openMidi;
  return acc;
}, {});

const NOTE_SEMITONES = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const presetPieces = [
  {
    name: 'Open String Warmup',
    bpm: 90,
    notes: [
      { note: 'E2', start: 0.0, duration: 1.5 },
      { note: 'A2', start: 1.5, duration: 1.5 },
      { note: 'D3', start: 3.0, duration: 1.5 },
      { note: 'G3', start: 4.5, duration: 1.5 },
      { note: 'B3', start: 6.0, duration: 1.5 },
      { note: 'E4', start: 7.5, duration: 1.5 },
    ],
  },
  {
    name: 'Simple Melody (Twinkle Fragment)',
    bpm: 100,
    notes: [
      { note: 'C4', start: 0.0, duration: 0.7 },
      { note: 'C4', start: 0.7, duration: 0.7 },
      { note: 'G4', start: 1.4, duration: 0.7 },
      { note: 'G4', start: 2.1, duration: 0.7 },
      { note: 'A4', start: 2.8, duration: 0.7 },
      { note: 'A4', start: 3.5, duration: 0.7 },
      { note: 'G4', start: 4.2, duration: 1.4 },
      { note: 'F4', start: 5.6, duration: 0.7 },
      { note: 'F4', start: 6.3, duration: 0.7 },
      { note: 'E4', start: 7.0, duration: 0.7 },
      { note: 'E4', start: 7.7, duration: 0.7 },
      { note: 'D4', start: 8.4, duration: 0.7 },
      { note: 'D4', start: 9.1, duration: 0.7 },
      { note: 'C4', start: 9.8, duration: 1.4 },
    ],
  },
];

const TUNING_SETS = {
  standard: {
    label: 'Standard (E A D G B E)',
    notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
  drop_d: {
    label: 'Drop D (D A D G B E)',
    notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
  d_standard: {
    label: 'D Standard (D G C F A D)',
    notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
  },
  open_g: {
    label: 'Open G (D G D G B D)',
    notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
  },
};

const dom = {
  modeSelect: document.querySelector('#modeSelect'),
  modeHint: document.querySelector('#modeHint'),
  toggleTunerBtn: document.querySelector('#toggleTunerBtn'),
  tunerPanel: document.querySelector('#tunerPanel'),
  fingeringPanel: document.querySelector('#fingeringPanel'),
  tuningSetSelect: document.querySelector('#tuningSetSelect'),
  tunerNoteSelect: document.querySelector('#tunerNoteSelect'),
  tunerTargetDisplay: document.querySelector('#tunerTargetDisplay'),
  tunerCloseness: document.querySelector('#tunerCloseness'),
  tunerCents: document.querySelector('#tunerCents'),
  tunerProgress: document.querySelector('#tunerProgress'),
  tunerStatus: document.querySelector('#tunerStatus'),
  fingeringTarget: document.querySelector('#fingeringTarget'),
  fingeringHint: document.querySelector('#fingeringHint'),
  fingerboard: document.querySelector('#fingerboard'),
  fingeringLegend: document.querySelector('#fingeringLegend'),
  fingeringNext: document.querySelector('#fingeringNext'),
  tunerStartBtn: document.querySelector('#tunerStartBtn'),
  tunerStopBtn: document.querySelector('#tunerStopBtn'),
  songRow: document.querySelector('#songRow'),
  songSelect: document.querySelector('#songSelect'),
  latencyRow: document.querySelector('#latencyRow'),
  latencyOffset: document.querySelector('#latencyOffset'),
  latencyOffsetValue: document.querySelector('#latencyOffsetValue'),
  bpmRow: document.querySelector('#bpmRow'),
  bpmSlider: document.querySelector('#bpmSlider'),
  bpmValue: document.querySelector('#bpmValue'),
  timingHelp: document.querySelector('#timingHelp'),
  guideToneToggle: document.querySelector('#guideToneToggle'),
  guideToneHint: document.querySelector('#guideToneHint'),
  backingTrackInput: document.querySelector('#backingTrackInput'),
  backingTrackStatus: document.querySelector('#backingTrackStatus'),
  backingTrackVolume: document.querySelector('#backingTrackVolume'),
  backingTrackVolumeValue: document.querySelector('#backingTrackVolumeValue'),
  playTrackBtn: document.querySelector('#playTrackBtn'),
  stopTrackBtn: document.querySelector('#stopTrackBtn'),
  syncTrackOnStart: document.querySelector('#syncTrackOnStart'),
  backingTrackTime: document.querySelector('#backingTrackTime'),
  startBtn: document.querySelector('#startBtn'),
  stopBtn: document.querySelector('#stopBtn'),
  restartBtn: document.querySelector('#restartBtn'),
  detectedNote: document.querySelector('#detectedNote'),
  detectedFreq: document.querySelector('#detectedFreq'),
  targetNote: document.querySelector('#targetNote'),
  targetWindow: document.querySelector('#targetWindow'),
  closeness: document.querySelector('#closeness'),
  centsOff: document.querySelector('#centsOff'),
  progressTitle: document.querySelector('#progressTitle'),
  progressText: document.querySelector('#progressText'),
  pieceProgress: document.querySelector('#pieceProgress'),
  tabsSection: document.querySelector('#tabsSection'),
  tabsTitle: document.querySelector('#tabsTitle'),
  tabsSubtitle: document.querySelector('#tabsSubtitle'),
  progressSection: document.querySelector('#progressSection'),
  scoreSection: document.querySelector('#scoreSection'),
  pieceEditorSection: document.querySelector('#pieceEditorSection'),
  pitchScore: document.querySelector('#pitchScore'),
  timingScore: document.querySelector('#timingScore'),
  overallScore: document.querySelector('#overallScore'),
  customPiece: document.querySelector('#customPiece'),
  loadCustomBtn: document.querySelector('#loadCustomBtn'),
  customLoadStatus: document.querySelector('#customLoadStatus'),
  tabUrlInput: document.querySelector('#tabUrlInput'),
  msPerColumnInput: document.querySelector('#msPerColumnInput'),
  importTabBtn: document.querySelector('#importTabBtn'),
  simplifyTabsToggle: document.querySelector('#simplifyTabsToggle'),
  chordStepRow: document.querySelector('#chordStepRow'),
  chordStepToggle: document.querySelector('#chordStepToggle'),
  importStatus: document.querySelector('#importStatus'),
  importProgress: document.querySelector('#importProgress'),
  audioTabInput: document.querySelector('#audioTabInput'),
  audioTabMinMs: document.querySelector('#audioTabMinMs'),
  generateAudioTabBtn: document.querySelector('#generateAudioTabBtn'),
  audioTabStatus: document.querySelector('#audioTabStatus'),
  audioTabProgress: document.querySelector('#audioTabProgress'),
  micLevelFill: document.querySelector('#micLevelFill'),
  micStatus: document.querySelector('#micStatus'),
  fretPlanNow: document.querySelector('#fretPlanNow'),
  fretPlanHint: document.querySelector('#fretPlanHint'),
  fretTimeline: document.querySelector('#fretTimeline'),
  fretTimelineMeta: document.querySelector('#fretTimelineMeta'),
  prevTab: document.querySelector('#prevTab'),
  prevHint: document.querySelector('#prevHint'),
  prevDiagram: document.querySelector('#prevDiagram'),
  currentTab: document.querySelector('#currentTab'),
  currentHint: document.querySelector('#currentHint'),
  currentDiagram: document.querySelector('#currentDiagram'),
  nextTab: document.querySelector('#nextTab'),
  nextHint: document.querySelector('#nextHint'),
  nextDiagram: document.querySelector('#nextDiagram'),
};

let state = {
  audioCtx: null,
  analyser: null,
  mediaStream: null,
  source: null,
  data: null,
  frequencyData: null,
  isRunning: false,
  rafId: null,
  startTimestamp: 0,
  listenMode: 'practice',
  practiceMode: 'timed',
  stepIndex: 0,
  tunerSetKey: 'standard',
  tunerTargetNote: 'E2',
  tunerTarget: null,
  activePiece: presetPieces[0],
  importedPieces: [],
  backingTrackAudio: null,
  backingTrackUrl: null,
  backingTrackName: '',
  simplifyTabs: true,
  chordStepAdvance: false,
  guideToneEnabled: false,
  guideToneOscillator: null,
  guideToneGain: null,
  activeBpm: 100,
  lastTickAtMs: 0,
  stats: createEmptyStats(),
  frequencyHistory: [],
  lastDetectedFrequency: null,
  lastDetectedAtMs: 0,
  lastDisplayedDetectedFrequency: null,
  sidePanelMode: 'tuner',
  timelineCache: null,
  timelineDomCache: null,
  timelineVisualTime: null,
  timelineVisualLastMs: 0,
  fingerboardSignature: '',
};

function createEmptyStats() {
  return {
    pitchSamples: 0,
    pitchTotal: 0,
    timingSamples: 0,
    timingTotal: 0,
    notesHit: new Set(),
    noteHitStreak: new Map(),
    noteHitHoldMs: new Map(),
  };
}

function noteNameToMidi(noteName) {
  const normalized = noteName.trim().toUpperCase();
  const match = normalized.match(/^([A-G])([#B]?)(-?\d)$/);
  if (!match) {
    throw new Error(`Invalid note: ${noteName}`);
  }

  const [, letter, accidental, octaveRaw] = match;
  const octave = Number(octaveRaw);
  const letterOffsets = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let semitone = letterOffsets[letter];
  if (accidental === '#') semitone += 1;
  if (accidental === 'B') semitone -= 1;

  return (octave + 1) * 12 + semitone;
}

function midiToFrequency(midi) {
  return A4 * 2 ** ((midi - A4_MIDI) / 12);
}

function frequencyToMidi(freq) {
  return Math.round(12 * Math.log2(freq / A4) + A4_MIDI);
}

function midiToNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function centsDifference(actualFreq, targetFreq) {
  return 1200 * Math.log2(actualFreq / targetFreq);
}

function closenessLabel(centsAbs) {
  if (centsAbs <= MAX_CENTS_FOR_PERFECT) return 'Perfect';
  if (centsAbs <= MAX_CENTS_FOR_GOOD) return 'Good';
  if (centsAbs <= 50) return 'Close';
  return 'Off';
}

function pitchScoreForCents(centsAbs) {
  if (centsAbs >= 120) return 0;
  return Math.max(0, 1 - centsAbs / 120);
}

function timingScoreForMs(msAbs) {
  if (msAbs >= 260) return 0;
  return Math.max(0, 1 - msAbs / 260);
}

function isValidTab(tab) {
  return (
    tab
    && Number.isInteger(tab.string)
    && Number.isInteger(tab.fret)
    && tab.string >= 1
    && tab.string <= 6
    && tab.fret >= 0
    && tab.fret <= 24
  );
}

function tabPositionsForMidi(midi, maxFret = MAX_FRET_FOR_BEGINNER_TAB) {
  const absoluteMaxFret = 24;
  const allPositions = GUITAR_STRINGS.map((guitarString) => {
    const fret = midi - guitarString.openMidi;
    if (fret < 0 || fret > absoluteMaxFret) {
      return null;
    }
    return {
      string: guitarString.string,
      fret,
      label: guitarString.label,
      display: guitarString.display,
      isExtended: fret > maxFret,
    };
  })
    .filter(Boolean)
    .sort((a, b) => a.fret - b.fret || b.string - a.string);

  const beginnerPositions = allPositions.filter((position) => !position.isExtended);
  return beginnerPositions.length > 0 ? beginnerPositions : allPositions;
}

function normalizePiece(piece) {
  if (!piece || !Array.isArray(piece.notes) || piece.notes.length === 0) {
    throw new Error('Piece must include a non-empty notes array');
  }

  const notes = piece.notes.map((n, idx) => {
    if (typeof n.note !== 'string') {
      throw new Error(`Invalid note at index ${idx}`);
    }

    let midi;
    try {
      midi = noteNameToMidi(n.note);
    } catch {
      throw new Error(`Invalid note at index ${idx}`);
    }

    const start = Number(n.start);
    const duration = Number(n.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid start/duration at index ${idx}`);
    }

    const inferredTabs = tabPositionsForMidi(midi);
    const preferredTab = isValidTab(n.tab)
      ? {
        string: n.tab.string,
        fret: n.tab.fret,
        isExtended: n.tab.fret > MAX_FRET_FOR_BEGINNER_TAB,
        chordSize: Number.isFinite(n.tab.chordSize) ? n.tab.chordSize : 1,
        chordIndex: Number.isFinite(n.tab.chordIndex) ? n.tab.chordIndex : 0,
        isChordTone: Boolean(n.tab.isChordTone) || (Number.isFinite(n.tab.chordSize) && n.tab.chordSize > 1),
      }
      : inferredTabs[0] || null;

    return {
      note: n.note.toUpperCase(),
      start,
      duration,
      end: start + duration,
      midi,
      freq: midiToFrequency(midi),
      tab: preferredTab,
      tabAlternatives: inferredTabs,
      index: idx,
    };
  });

  notes.sort((a, b) => a.start - b.start);
  notes.forEach((note, index) => {
    note.index = index;
  });

  return {
    name: piece.name || 'Custom Piece',
    bpm: piece.bpm || 100,
    notes,
    totalDuration: notes.at(-1).end,
  };
}

function createVirtualNote(noteName) {
  const upperName = noteName.toUpperCase();
  const midi = noteNameToMidi(upperName);
  const inferredTabs = tabPositionsForMidi(midi);

  return {
    note: upperName,
    start: 0,
    duration: 1,
    end: 1,
    midi,
    freq: midiToFrequency(midi),
    tab: inferredTabs[0] || null,
    tabAlternatives: inferredTabs,
    index: -1,
  };
}

function toPieceSnapshot(normalizedPiece) {
  return {
    name: normalizedPiece.name,
    bpm: normalizedPiece.bpm,
    notes: normalizedPiece.notes.map(({ note, start, duration, tab }) => ({ note, start, duration, tab })),
  };
}

function syncPieceEditor(normalizedPiece) {
  dom.customPiece.value = JSON.stringify(toPieceSnapshot(normalizedPiece), null, 2);
}

function setActivePieceAsImported(normalizedPiece) {
  state.activePiece = normalizedPiece;
  syncBpmSliderWithPiece(normalizedPiece);
  syncPieceEditor(normalizedPiece);
  state.importedPieces.push(toPieceSnapshot(normalizedPiece));
  const importedSelectValue = `imported:${state.importedPieces.length - 1}`;
  populatePieceSelect(importedSelectValue);
  restartPiece();
}

function resetTimelineCaches() {
  state.timelineCache = null;
  state.timelineDomCache = null;
  state.timelineVisualTime = null;
  state.timelineVisualLastMs = 0;
  state.fingerboardSignature = '';
}

function setChordStepAdvanceEnabled(enabled) {
  const nextValue = Boolean(enabled) && !state.simplifyTabs;
  state.chordStepAdvance = nextValue;
  if (dom.chordStepToggle) {
    dom.chordStepToggle.checked = nextValue;
    dom.chordStepToggle.disabled = state.simplifyTabs;
  }
}

function setBeginnerSimplifyEnabled(enabled) {
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

function updateTabsPanelCopy() {
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

function isStepNoteEmptyOrUnmapped(note) {
  if (!note) return true;
  return !Number.isFinite(note.freq) || !note.tab;
}

function skipEmptyStepNotes() {
  if (state.practiceMode !== 'step') return 0;
  let skipped = 0;

  while (state.stepIndex < state.activePiece.notes.length) {
    const note = state.activePiece.notes[state.stepIndex];
    if (!isStepNoteEmptyOrUnmapped(note)) {
      break;
    }
    state.stats.notesHit.add(state.stepIndex);
    state.stats.noteHitStreak.set(state.stepIndex, 0);
    state.stats.noteHitHoldMs.set(state.stepIndex, 0);
    state.stepIndex += 1;
    skipped += 1;
  }

  if (skipped > 0) {
    dom.customLoadStatus.textContent = `Skipped ${skipped} empty/unmapped note${skipped > 1 ? 's' : ''}.`;
  }
  return skipped;
}

function populatePieceSelect(selectedValue = null) {
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

function populateTuningSetSelect() {
  dom.tuningSetSelect.innerHTML = '';
  Object.entries(TUNING_SETS).forEach(([setKey, setData]) => {
    const option = document.createElement('option');
    option.value = setKey;
    option.textContent = setData.label;
    dom.tuningSetSelect.append(option);
  });
}

function populateTunerNoteSelectForSet(setKey, preferredNote = null) {
  const setData = TUNING_SETS[setKey];
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

function setTunerTarget(noteName) {
  const normalized = noteName.toUpperCase();
  state.tunerTargetNote = normalized;
  state.tunerTarget = createVirtualNote(normalized);
  dom.tunerNoteSelect.value = normalized;
  dom.tunerTargetDisplay.textContent = normalized;
  dom.tunerStatus.textContent = `Target ${normalized}. Tune until close.`;
}

function setTuningSet(setKey, preferredNote = null) {
  const normalizedSetKey = Object.hasOwn(TUNING_SETS, setKey) ? setKey : 'standard';
  state.tunerSetKey = normalizedSetKey;
  dom.tuningSetSelect.value = normalizedSetKey;

  const nextNote = populateTunerNoteSelectForSet(normalizedSetKey, preferredNote || state.tunerTargetNote);
  if (nextNote) {
    setTunerTarget(nextNote);
  }
}

function guessPieceNameFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const slug = url.pathname.split('/').filter(Boolean).at(-1) || 'Imported Tab';
    const cleaned = decodeURIComponent(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
    return cleaned || 'Imported Tab';
  } catch {
    return 'Imported Tab';
  }
}

function setImportStatus(message, isError = false) {
  dom.importStatus.textContent = message;
  dom.importStatus.style.color = isError ? 'var(--accent-2)' : 'var(--muted)';
}

function clampBpm(bpm) {
  const numeric = Number(bpm);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(40, Math.min(240, Math.round(numeric)));
}

function syncBpmSliderWithPiece(piece) {
  const baseBpm = clampBpm(piece?.bpm || 100);
  state.activeBpm = baseBpm;
  dom.bpmSlider.value = String(baseBpm);
  dom.bpmValue.textContent = `${baseBpm} BPM`;
}

function setActiveBpm(nextBpm) {
  const clamped = clampBpm(nextBpm);
  state.activeBpm = clamped;
  dom.bpmSlider.value = String(clamped);
  dom.bpmValue.textContent = `${clamped} BPM`;
}

function getBpmScale() {
  const pieceBpm = clampBpm(state.activePiece?.bpm || 100);
  const activeBpm = clampBpm(state.activeBpm || pieceBpm);
  return activeBpm / pieceBpm;
}

function setTaskProgress(progressEl, percent) {
  if (!progressEl) return;
  progressEl.hidden = false;
  progressEl.value = Math.max(0, Math.min(100, Math.round(percent)));
}

function resetTaskProgress(progressEl) {
  if (!progressEl) return;
  progressEl.value = 0;
  progressEl.hidden = true;
}

function parseCustomPieceInput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Custom piece is empty');
  }

  // Accept pasted markdown code fences like ```json ... ```
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const parseAttempts = [candidate];
  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');
  const first = [firstObj, firstArr].filter((idx) => idx >= 0).sort((a, b) => a - b)[0];
  const lastObj = candidate.lastIndexOf('}');
  const lastArr = candidate.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (Number.isInteger(first) && Number.isInteger(last) && first < last) {
    parseAttempts.push(candidate.slice(first, last + 1).trim());
  }

  let parsed = null;
  let lastError = null;
  for (const attempt of parseAttempts) {
    if (!attempt) continue;
    try {
      parsed = JSON.parse(attempt);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (parsed === null) {
    throw new Error(lastError?.message || 'Could not parse JSON');
  }

  if (Array.isArray(parsed)) {
    return { name: 'Custom Piece', notes: parsed };
  }
  if (parsed && Array.isArray(parsed.notes)) {
    return parsed;
  }
  if (parsed && parsed.piece && Array.isArray(parsed.piece.notes)) {
    return parsed.piece;
  }

  throw new Error('JSON must be an array of notes or an object with a notes array');
}

function setAudioTabStatus(message, isError = false) {
  dom.audioTabStatus.textContent = message;
  dom.audioTabStatus.style.color = isError ? 'var(--accent-2)' : 'var(--muted)';
}

function setSidePanelMode(mode = 'tuner') {
  const normalized = mode === 'fingering' ? 'fingering' : 'tuner';
  state.sidePanelMode = normalized;
  dom.tunerPanel.classList.toggle('is-collapsed', normalized !== 'tuner');
  dom.fingeringPanel.classList.toggle('is-collapsed', normalized !== 'fingering');
  dom.toggleTunerBtn.textContent = normalized === 'tuner'
    ? 'Show Finger Placement'
    : 'Show Standalone Tuner';
}

function updateGuideToneHint() {
  if (!state.guideToneEnabled) {
    dom.guideToneHint.textContent = 'Off';
    return;
  }
  if (state.practiceMode !== 'timed') {
    dom.guideToneHint.textContent = 'On (Timed mode only)';
    return;
  }
  dom.guideToneHint.textContent = 'On';
}

function setGuideToneEnabled(enabled) {
  state.guideToneEnabled = Boolean(enabled);
  dom.guideToneToggle.checked = state.guideToneEnabled;
  updateGuideToneHint();
  if (!state.guideToneEnabled && state.guideToneGain && state.audioCtx) {
    const now = state.audioCtx.currentTime;
    state.guideToneGain.gain.cancelScheduledValues(now);
    state.guideToneGain.gain.setTargetAtTime(0, now, 0.02);
  }
}

function ensureGuideToneNodes() {
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

function stopGuideToneNodes() {
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

function renderGuideTone(targetNote) {
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

function parseBpmFromText(rawText, options = {}) {
  const { allowBare = false } = options;
  if (!rawText || typeof rawText !== 'string') return null;

  const text = rawText.replace(/&nbsp;/gi, ' ');
  const candidates = [];
  const patterns = [
    /(?:^|[\s>"'=])(bpm|tempo)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)/gi,
    /"bpm"\s*:\s*"?(\\?\d{2,3}(?:\.\d+)?)"?/gi,
    /(\d{2,3}(?:\.\d+)?)\s*bpm/gi,
  ];

  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[2] || match[1]);
      if (Number.isFinite(value)) {
        candidates.push(value);
      }
    }
  });

  if (!candidates.length && allowBare) {
    for (const match of text.matchAll(/\b(\d{2,3}(?:\.\d+)?)\b/g)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 40 && value <= 280) {
        candidates.push(value);
      }
    }
  }

  const valid = candidates.filter((value) => value >= 40 && value <= 280);
  if (!valid.length) return null;

  return Math.round(valid[0]);
}

function bpmToMsPerColumn(bpm, columnsPerBeat = DEFAULT_COLUMNS_PER_BEAT) {
  if (!Number.isFinite(bpm) || bpm <= 0) return DEFAULT_TAB_MS_PER_COLUMN;
  const beatMs = 60000 / bpm;
  const derived = beatMs / Math.max(1, columnsPerBeat);
  return Math.max(40, Math.min(500, Math.round(derived)));
}

function formatClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const wholeSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getBackingTrackAudio() {
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

function releaseBackingTrackUrl() {
  if (state.backingTrackUrl) {
    URL.revokeObjectURL(state.backingTrackUrl);
    state.backingTrackUrl = null;
  }
}

function setBackingTrackVolume(volumePercent) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(volumePercent) || 0)));
  dom.backingTrackVolume.value = String(clamped);
  dom.backingTrackVolumeValue.textContent = `${clamped}%`;
  if (state.backingTrackAudio) {
    state.backingTrackAudio.volume = clamped / 100;
  }
}

function setBackingTrackFile(file) {
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

async function playBackingTrack({ restart = false } = {}) {
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

function stopBackingTrack({ reset = false } = {}) {
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

function shouldSyncBackingTrack() {
  return Boolean(dom.syncTrackOnStart?.checked);
}

async function syncBackingTrackToPracticeStart() {
  if (state.listenMode !== 'practice' || !shouldSyncBackingTrack()) return;
  if (!state.backingTrackAudio || !state.backingTrackAudio.src) return;
  await playBackingTrack({ restart: true });
}

function applyTunerTone(tone = 'neutral') {
  const toneClasses = ['tuner-tone-neutral', 'tuner-tone-in', 'tuner-tone-sharp', 'tuner-tone-loose'];
  [dom.tunerCloseness, dom.tunerCents, dom.tunerStatus].forEach((element) => {
    if (!element) return;
    element.classList.remove(...toneClasses);
    element.classList.add(`tuner-tone-${tone}`);
  });
}

function parseTuningToken(rawToken) {
  if (!rawToken) return null;
  const cleaned = rawToken
    .trim()
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/[^A-Ga-g0-9#b-]/g, '');
  const match = cleaned.match(/^([A-Ga-g])([#b]?)(-?\d+)?$/);
  if (!match) return null;

  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const octave = typeof match[3] === 'string' ? Number(match[3]) : null;
  if (match[3] && !Number.isFinite(octave)) return null;

  const pitchClass = `${letter}${accidental}`;
  if (!Object.hasOwn(NOTE_SEMITONES, pitchClass)) return null;

  return {
    pitchClass,
    octave,
  };
}

function midiForPitchClassOctave(pitchClass, octave) {
  if (!Object.hasOwn(NOTE_SEMITONES, pitchClass) || !Number.isFinite(octave)) {
    return null;
  }
  return (octave + 1) * 12 + NOTE_SEMITONES[pitchClass];
}

function nearestMidiForPitchClass(pitchClass, targetMidi) {
  const semitone = NOTE_SEMITONES[pitchClass];
  if (!Number.isFinite(semitone) || !Number.isFinite(targetMidi)) {
    return null;
  }

  return semitone + (12 * Math.round((targetMidi - semitone) / 12));
}

function scoreOpenMidiMap(openMidiByString) {
  let score = 0;
  [1, 2, 3, 4, 5, 6].forEach((stringNumber) => {
    const midi = openMidiByString[stringNumber];
    const fallback = DEFAULT_OPEN_MIDI_BY_STRING[stringNumber];
    if (!Number.isFinite(midi)) {
      score += 99;
      return;
    }
    score += Math.abs(midi - fallback);
  });

  const lowToHigh = [6, 5, 4, 3, 2, 1].map((stringNumber) => openMidiByString[stringNumber]);
  for (let i = 1; i < lowToHigh.length; i += 1) {
    if (lowToHigh[i] <= lowToHigh[i - 1]) {
      score += 30;
      continue;
    }

    const interval = lowToHigh[i] - lowToHigh[i - 1];
    if (interval > 10) {
      score += interval - 10;
    }
  }

  return score;
}

function buildOpenMidiMapFromTokens(tokens, orientation) {
  if (!Array.isArray(tokens) || tokens.length !== 6) {
    return null;
  }

  const stringOrder = orientation === 'high-to-low'
    ? [1, 2, 3, 4, 5, 6]
    : [6, 5, 4, 3, 2, 1];

  const openMidiByString = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const stringNumber = stringOrder[i];
    const targetMidi = DEFAULT_OPEN_MIDI_BY_STRING[stringNumber];
    const midi = token.octave === null
      ? nearestMidiForPitchClass(token.pitchClass, targetMidi)
      : midiForPitchClassOctave(token.pitchClass, token.octave);
    if (!Number.isFinite(midi)) {
      return null;
    }
    openMidiByString[stringNumber] = midi;
  }

  return {
    openMidiByString,
    score: scoreOpenMidiMap(openMidiByString),
    orientation,
  };
}

function pickBestTuningWindow(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 6) {
    return null;
  }

  let best = null;
  for (let start = 0; start <= tokens.length - 6; start += 1) {
    const windowTokens = tokens.slice(start, start + 6);
    const lowToHigh = buildOpenMidiMapFromTokens(windowTokens, 'low-to-high');
    const highToLow = buildOpenMidiMapFromTokens(windowTokens, 'high-to-low');
    const winner = [lowToHigh, highToLow]
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)[0];
    if (!winner) continue;

    if (!best || winner.score < best.score) {
      best = {
        ...winner,
        tokens: windowTokens,
      };
    }
  }

  return best;
}

function parseTuningFromText(rawText, options = {}) {
  const { allowBare = false } = options;
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const text = rawText
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/&nbsp;/gi, ' ');

  const candidatePatterns = [
    /(?:^|[\s>"'=])tuning(?:\s*[:=]\s*|\s+)([A-G][#b]?\d?(?:[\s,;|/\\-]+[A-G][#b]?\d?){5,10})/gi,
    /"tuning"\s*:\s*"([^"]{6,120})"/gi,
    /"tuning"\s*:\s*\[([^\]]{6,200})\]/gi,
    /(?:open\s+tuning|tuned\s+to)\s*[:=]?\s*([A-G][#b]?\d?(?:[\s,;|/\\-]+[A-G][#b]?\d?){5,10})/gi,
  ];

  const chunks = [];
  candidatePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) chunks.push(match[1]);
    }
  });

  if (!chunks.length) {
    if (!allowBare) return null;
    chunks.push(text);
  }

  let best = null;
  chunks.forEach((chunk) => {
    const tokenMatches = chunk.match(/\b[A-Ga-g][#b]?(?:-?\d+)?\b/g) || [];
    const tokens = tokenMatches.map(parseTuningToken).filter(Boolean);
    const parsed = pickBestTuningWindow(tokens);
    if (!parsed) return;

    if (!best || parsed.score < best.score) {
      best = parsed;
    }
  });

  if (!best) return null;

  const ordered = [6, 5, 4, 3, 2, 1].map((stringNumber) => midiToNoteName(best.openMidiByString[stringNumber]));
  return {
    openMidiByString: best.openMidiByString,
    label: ordered.join(' '),
    orientation: best.orientation,
  };
}

function extractTuningMetadata(rawText, doc) {
  const sources = [];
  if (doc) {
    const tuningSelectors = [
      { selector: '.c4glK', allowBare: true },
      { selector: '[class~="c4glK"]', allowBare: true },
      { selector: '[class*="c4glK"]', allowBare: true },
      { selector: '[data-testid*="tuning"]', allowBare: true },
      { selector: '[data-testid*="Tuning"]', allowBare: true },
      { selector: '[class*="tuning"]', allowBare: true },
      { selector: '[class*="Tuning"]', allowBare: true },
      { selector: 'meta[name="description"]', allowBare: false },
    ];

    tuningSelectors.forEach(({ selector, allowBare }) => {
      doc.querySelectorAll(selector).forEach((node) => {
        const content = node.getAttribute('content');
        const text = typeof content === 'string' ? content : (node.textContent || '');
        if (text.trim()) {
          sources.push({ label: selector, text, allowBare });
        }
      });
    });
  }

  sources.push({ label: 'raw', text: rawText, allowBare: false });

  for (const source of sources) {
    const parsed = parseTuningFromText(source.text, { allowBare: source.allowBare });
    if (parsed) {
      return {
        ...parsed,
        source: source.label,
      };
    }
  }

  return null;
}

function extractBpmMetadata(rawText, doc) {
  const sources = [];
  if (doc) {
    const bpmSelectors = [
      { selector: '[data-testid*="bpm"]', allowBare: true },
      { selector: '[data-testid*="BPM"]', allowBare: true },
      { selector: '[class*="bpm"]', allowBare: true },
      { selector: '[class*="BPM"]', allowBare: true },
      { selector: '[data-testid*="tempo"]', allowBare: true },
      { selector: '[class*="tempo"]', allowBare: true },
      { selector: 'meta[name="description"]', allowBare: false },
    ];

    bpmSelectors.forEach(({ selector, allowBare }) => {
      doc.querySelectorAll(selector).forEach((node) => {
        const content = node.getAttribute('content');
        const text = typeof content === 'string' ? content : (node.textContent || '');
        if (text.trim()) {
          sources.push({ label: selector, text, allowBare });
        }
      });
    });
  }

  sources.push({ label: 'raw', text: rawText, allowBare: false });

  for (const source of sources) {
    const bpm = parseBpmFromText(source.text, { allowBare: source.allowBare });
    if (bpm) {
      return {
        bpm,
        source: source.label,
      };
    }
  }

  return null;
}

function extractTabImportData(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Fetched page was empty');
  }

  const tabLinePattern = /^[ \t]*[eEADGBeB][ \t]*\|/m;
  const looksLikeHtml = /<[a-z!/][^>]*>/i.test(rawText);
  if (tabLinePattern.test(rawText) && !looksLikeHtml) {
    return {
      tabText: rawText,
      tuning: parseTuningFromText(rawText, { allowBare: false }),
      bpm: parseBpmFromText(rawText, { allowBare: false }),
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawText, 'text/html');
  const candidates = [];
  const selectors = [
    '.k_vI3.WptWb.fGc1h',
    '[class~="k_vI3"][class~="WptWb"][class~="fGc1h"]',
    'pre',
    'code',
    '.js-tab-content',
    '[class*="tab"]',
    'article',
    'main',
  ];

  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => {
      const text = node.textContent || '';
      if (!text.trim()) return;
      const tabLineCount = (text.match(/^[ \t]*[eEADGBeB][ \t]*\|/gm) || []).length;
      const score = tabLineCount * 100 + Math.min(text.length, 5000) / 100;
      candidates.push({ text, score });
    });
  });

  const bodyText = doc.body?.innerText || doc.body?.textContent || '';
  if (bodyText.trim()) {
    const tabLineCount = (bodyText.match(/^[ \t]*[eEADGBeB][ \t]*\|/gm) || []).length;
    candidates.push({ text: bodyText, score: tabLineCount * 100 });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]?.text;
  if (!best || !tabLinePattern.test(best)) {
    throw new Error('Could not find tab lines in that page');
  }

  return {
    tabText: best,
    tuning: extractTuningMetadata(rawText, doc),
    bpm: extractBpmMetadata(rawText, doc),
  };
}

function classifyTabStringLabel(label) {
  const trimmed = label.trim();
  if (trimmed === 'e') return 'e';
  const upper = trimmed.toUpperCase();
  if (upper === 'E') return 'E';
  if (upper === 'B') return 'B';
  if (upper === 'G') return 'G';
  if (upper === 'D') return 'D';
  if (upper === 'A') return 'A';
  return null;
}

function parseTabSystems(tabText) {
  const lines = tabText.split('\n').map((line) => line.replace(/\r/g, ''));
  const requiredKeys = ['e', 'B', 'G', 'D', 'A', 'E'];
  const systems = [];
  let current = {};

  for (const rawLine of lines) {
    const match = rawLine.match(/^\s*([eEADGBeB])\s*\|(.+)$/);
    if (!match) {
      if (Object.keys(current).length > 0) {
        current = {};
      }
      continue;
    }

    const key = classifyTabStringLabel(match[1]);
    if (!key) continue;

    const content = match[2]
      .replace(/\|/g, '-')
      .replace(/\s/g, '-')
      .trim();
    current[key] = content;

    if (requiredKeys.every((requiredKey) => typeof current[requiredKey] === 'string')) {
      systems.push(current);
      current = {};
    }
  }

  if (systems.length === 0) {
    throw new Error('No complete 6-string tab systems found');
  }
  return systems;
}

function parseTabTextToPiece(
  tabText,
  msPerColumn,
  pieceName,
  openMidiByString = DEFAULT_OPEN_MIDI_BY_STRING,
  bpm = null,
  options = {},
) {
  const { simplifyToSingleNotes = true } = options;
  const systems = parseTabSystems(tabText);
  const stringOrder = [
    { key: 'e', string: 1 },
    { key: 'B', string: 2 },
    { key: 'G', string: 3 },
    { key: 'D', string: 4 },
    { key: 'A', string: 5 },
    { key: 'E', string: 6 },
  ];

  const rawEvents = [];
  let globalColumnOffset = 0;

  for (const system of systems) {
    const maxLen = Math.max(...stringOrder.map((entry) => system[entry.key]?.length || 0));

    stringOrder.forEach((entry) => {
      const raw = system[entry.key] || '';
      for (let col = 0; col < raw.length; col += 1) {
        const char = raw[col];
        const prevChar = col > 0 ? raw[col - 1] : '';
        if (!/\d/.test(char) || /\d/.test(prevChar)) continue;

        let end = col + 1;
        while (end < raw.length && /\d/.test(raw[end])) end += 1;

        const fret = Number(raw.slice(col, end));
        if (!Number.isFinite(fret) || fret < 0 || fret > 24) {
          col = end - 1;
          continue;
        }

        rawEvents.push({
          column: globalColumnOffset + col,
          string: entry.string,
          fret,
        });
        col = end - 1;
      }
    });

    globalColumnOffset += maxLen + TAB_SYSTEM_GAP_COLUMNS;
  }

  if (rawEvents.length === 0) {
    throw new Error('No playable fret numbers found in the imported tabs');
  }

  rawEvents.sort((a, b) => a.column - b.column || a.string - b.string);

  const uniqueColumns = [...new Set(rawEvents.map((event) => event.column))];
  const nextColumnMap = new Map();
  uniqueColumns.forEach((column, index) => {
    nextColumnMap.set(column, uniqueColumns[index + 1] ?? (column + 4));
  });

  const msPerCol = Math.max(40, Math.min(500, Math.round(msPerColumn)));
  const strumSpreadSeconds = 0.08;
  const minDurationSeconds = 0.18;

  const notes = [];
  const grouped = rawEvents.reduce((acc, event) => {
    if (!acc.has(event.column)) acc.set(event.column, []);
    acc.get(event.column).push(event);
    return acc;
  }, new Map());

  [...grouped.entries()].forEach(([column, events]) => {
    const sortedEvents = events.sort((a, b) => a.string - b.string);
    const chordSize = sortedEvents.length;
    const nextColumn = nextColumnMap.get(column);
    const baseDuration = Math.max(
      minDurationSeconds,
      ((nextColumn - column) * msPerCol) / 1000 * TAB_NOTE_SUSTAIN_RATIO,
    );

    sortedEvents.forEach((event, idx) => {
      const start = simplifyToSingleNotes
        ? (column * msPerCol) / 1000 + idx * strumSpreadSeconds
        : (column * msPerCol) / 1000;
      const duration = simplifyToSingleNotes
        ? (
          idx < sortedEvents.length - 1
            ? Math.min(baseDuration, strumSpreadSeconds * 1.7)
            : baseDuration
        )
        : baseDuration;
      const openMidi = Number.isFinite(openMidiByString[event.string])
        ? openMidiByString[event.string]
        : DEFAULT_OPEN_MIDI_BY_STRING[event.string];
      const midi = openMidi + event.fret;

      notes.push({
        note: midiToNoteName(midi),
        start: Number(start.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        tab: {
          string: event.string,
          fret: event.fret,
          chordSize,
          chordIndex: idx,
          isChordTone: chordSize > 1,
        },
      });
    });
  });

  return {
    name: pieceName || 'Imported Tab',
    bpm: Number.isFinite(bpm) ? bpm : 100,
    notes,
  };
}

async function fetchTabPage(url) {
  const cleanUrl = url.trim();
  let isUltimateGuitar = false;
  try {
    const parsed = new URL(cleanUrl);
    isUltimateGuitar = /(^|\.)ultimate-guitar\.com$/i.test(parsed.hostname);
  } catch {
    isUltimateGuitar = false;
  }

  const directAttempt = { label: 'direct', target: cleanUrl };
  const allOriginsAttempt = {
    label: 'allorigins',
    target: `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
  };
  const jinaAttempt = {
    label: 'jina-mirror',
    target: `https://r.jina.ai/http://${cleanUrl.replace(/^https?:\/\//i, '')}`,
  };

  const proxyAttempts = isUltimateGuitar
    ? [jinaAttempt, directAttempt, allOriginsAttempt]
    : [directAttempt, allOriginsAttempt, jinaAttempt];

  let lastError = null;
  for (const attempt of proxyAttempts) {
    try {
      const response = await fetch(attempt.target);
      if (!response.ok) {
        lastError = new Error(`${attempt.label} returned ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (!text || text.trim().length < 40) {
        lastError = new Error(`${attempt.label} returned empty content`);
        continue;
      }
      return { htmlOrText: text, via: attempt.label };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || 'Could not fetch tab page');
}

async function importTabFromUrl() {
  resetTaskProgress(dom.importProgress);
  const url = dom.tabUrlInput.value.trim();
  if (!url) {
    setImportStatus('Paste a tab URL first', true);
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    setImportStatus('That URL is invalid', true);
    return;
  }

  const msPerColumn = Number(dom.msPerColumnInput.value || DEFAULT_TAB_MS_PER_COLUMN);
  if (!Number.isFinite(msPerColumn) || msPerColumn < 40 || msPerColumn > 500) {
    setImportStatus('ms/column must be between 40 and 500', true);
    return;
  }

  dom.importTabBtn.disabled = true;
  setImportStatus('Fetching and converting tabs...');
  setTaskProgress(dom.importProgress, 8);

  try {
    const { htmlOrText, via } = await fetchTabPage(parsedUrl.toString());
    setTaskProgress(dom.importProgress, 35);
    const { tabText, tuning, bpm } = extractTabImportData(htmlOrText);
    setTaskProgress(dom.importProgress, 55);
    const pieceName = guessPieceNameFromUrl(parsedUrl.toString());
    const typedMsPerColumn = Number(dom.msPerColumnInput.value || DEFAULT_TAB_MS_PER_COLUMN);
    const usingDefaultMsPerColumn = typedMsPerColumn === DEFAULT_TAB_MS_PER_COLUMN;
    const effectiveMsPerColumn = bpm && usingDefaultMsPerColumn
      ? bpmToMsPerColumn(bpm.bpm, DEFAULT_COLUMNS_PER_BEAT)
      : msPerColumn;
    if (bpm && usingDefaultMsPerColumn) {
      dom.msPerColumnInput.value = String(effectiveMsPerColumn);
    }
    const parsedPiece = parseTabTextToPiece(
      tabText,
      effectiveMsPerColumn,
      pieceName,
      tuning?.openMidiByString || DEFAULT_OPEN_MIDI_BY_STRING,
      bpm?.bpm || null,
      { simplifyToSingleNotes: state.simplifyTabs },
    );
    setTaskProgress(dom.importProgress, 75);
    const normalized = normalizePiece(parsedPiece);
    setTaskProgress(dom.importProgress, 90);

    setActivePieceAsImported(normalized);
    dom.customLoadStatus.textContent = `Imported piece loaded (${normalized.notes.length} notes)`;
    setTaskProgress(dom.importProgress, 100);

    const detailBits = [];
    if (tuning) detailBits.push(`Tuning: ${tuning.label} (${tuning.source})`);
    if (bpm) detailBits.push(`BPM: ${bpm.bpm} (${bpm.source})`);
    if (bpm && usingDefaultMsPerColumn) {
      detailBits.push(`ms/col auto: ${effectiveMsPerColumn}`);
    }
    detailBits.push(state.simplifyTabs ? 'Mode: beginner simplify' : 'Mode: chord-preserving');

    setImportStatus(
      `Imported ${normalized.notes.length} notes via ${via}${detailBits.length ? `. ${detailBits.join(' · ')}.` : '.'}`,
    );
  } catch (error) {
    setTaskProgress(dom.importProgress, 100);
    setImportStatus(
      `Import failed: ${error.message}. If blocked by CORS, paste raw tabs into the JSON editor.`,
      true,
    );
  } finally {
    dom.importTabBtn.disabled = false;
  }
}

function downmixAudioBufferToMono(audioBuffer) {
  const { length, numberOfChannels } = audioBuffer;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += channelData[i] / numberOfChannels;
    }
  }
  return mono;
}

function detectMonophonicNotesFromAudio(monoData, sampleRate, minNoteMs = 130) {
  if (!monoData?.length) return [];

  const frameSize = Math.min(FFT_SIZE, monoData.length);
  const hopSize = Math.max(256, Math.floor(sampleRate * 0.03));
  const frameSeconds = hopSize / sampleRate;
  const minFrames = Math.max(2, Math.round((Math.max(80, minNoteMs) / 1000) / frameSeconds));
  const midiFrames = [];

  for (let offset = 0; offset + frameSize <= monoData.length; offset += hopSize) {
    const frame = monoData.subarray(offset, offset + frameSize);
    const pitch = autoCorrelate(frame, sampleRate);
    const midi = pitch ? frequencyToMidi(pitch.frequency) : null;
    midiFrames.push({
      time: offset / sampleRate,
      midi,
    });
  }

  const smoothed = midiFrames.map((frame, index) => {
    if (!Number.isFinite(frame.midi)) return null;
    const neighbors = [midiFrames[index - 1], frame, midiFrames[index + 1]]
      .map((item) => (item && Number.isFinite(item.midi) ? item.midi : null))
      .filter((value) => value !== null);
    if (!neighbors.length) return null;
    const mean = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
    return Math.round(mean);
  });

  const rawEvents = [];
  let current = null;
  for (let index = 0; index < smoothed.length; index += 1) {
    const midi = smoothed[index];
    const frameTime = midiFrames[index]?.time ?? (index * frameSeconds);

    if (!Number.isFinite(midi)) {
      if (current) {
        current.silenceFrames += 1;
        if (current.silenceFrames >= 2) {
          rawEvents.push({
            midi: current.midi,
            start: current.start,
            end: frameTime,
            frames: current.frames,
          });
          current = null;
        }
      }
      continue;
    }

    if (!current) {
      current = {
        midi,
        start: frameTime,
        frames: 1,
        silenceFrames: 0,
      };
      continue;
    }

    if (Math.abs(midi - current.midi) <= 1) {
      current.midi = Math.round((current.midi * current.frames + midi) / (current.frames + 1));
      current.frames += 1;
      current.silenceFrames = 0;
      continue;
    }

    rawEvents.push({
      midi: current.midi,
      start: current.start,
      end: frameTime,
      frames: current.frames,
    });
    current = {
      midi,
      start: frameTime,
      frames: 1,
      silenceFrames: 0,
    };
  }

  if (current) {
    rawEvents.push({
      midi: current.midi,
      start: current.start,
      end: monoData.length / sampleRate,
      frames: current.frames,
    });
  }

  const filtered = rawEvents
    .filter((event) => event.frames >= minFrames)
    .map((event) => ({
      midi: event.midi,
      start: Number(event.start.toFixed(3)),
      duration: Number(Math.max(0.1, event.end - event.start).toFixed(3)),
    }))
    .filter((event) => event.duration * 1000 >= Math.max(80, minNoteMs));

  const merged = [];
  for (const event of filtered) {
    const last = merged[merged.length - 1];
    if (last && event.midi === last.midi && event.start <= last.start + last.duration + 0.07) {
      last.duration = Number((event.start + event.duration - last.start).toFixed(3));
      continue;
    }
    merged.push({ ...event });
  }

  return merged.map((event) => ({
    note: midiToNoteName(event.midi),
    start: event.start,
    duration: event.duration,
  }));
}

function estimateBpmFromDetectedNotes(notes) {
  if (!Array.isArray(notes) || notes.length < 3) return null;

  const intervals = [];
  for (let i = 1; i < notes.length; i += 1) {
    const delta = notes[i].start - notes[i - 1].start;
    if (delta >= 0.12 && delta <= 2.0) {
      intervals.push(delta);
    }
  }
  if (!intervals.length) return null;

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!Number.isFinite(median) || median <= 0) return null;

  let bpm = 60 / median;
  while (bpm < 60) bpm *= 2;
  while (bpm > 190) bpm /= 2;

  return Number.isFinite(bpm) ? Math.round(bpm) : null;
}

async function generatePieceFromAudio(file, minNoteMs, onProgress = () => {}) {
  const DecodeContext = window.AudioContext || window.webkitAudioContext;
  if (!DecodeContext) {
    throw new Error('Browser audio decoding is not supported');
  }
  const decodeContext = new DecodeContext();
  try {
    onProgress(22);
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0));
    onProgress(48);
    const mono = downmixAudioBufferToMono(audioBuffer);
    const detectedNotes = detectMonophonicNotesFromAudio(mono, audioBuffer.sampleRate, minNoteMs);
    onProgress(72);
    if (!detectedNotes.length) {
      throw new Error('No stable guitar notes detected');
    }

    const baseName = file.name.replace(/\.[a-z0-9]+$/i, '').trim() || 'Audio Import';
    const bpmGuess = estimateBpmFromDetectedNotes(detectedNotes);
    onProgress(90);
    return {
      name: `${baseName} (Audio Tabs)`,
      bpm: bpmGuess || 100,
      notes: detectedNotes,
    };
  } finally {
    if (decodeContext.state !== 'closed') {
      await decodeContext.close();
    }
  }
}

async function generateTabsFromAudio() {
  resetTaskProgress(dom.audioTabProgress);
  const file = dom.audioTabInput.files?.[0];
  if (!file) {
    setAudioTabStatus('Select an audio file first', true);
    return;
  }

  const minNoteMs = Number(dom.audioTabMinMs.value || 130);
  if (!Number.isFinite(minNoteMs) || minNoteMs < 80 || minNoteMs > 800) {
    setAudioTabStatus('Minimum note length must be between 80ms and 800ms', true);
    return;
  }

  dom.generateAudioTabBtn.disabled = true;
  setAudioTabStatus('Analyzing audio and generating tabs...');
  setTaskProgress(dom.audioTabProgress, 8);

  try {
    const piece = await generatePieceFromAudio(file, minNoteMs, (progress) => {
      setTaskProgress(dom.audioTabProgress, progress);
    });
    const normalized = normalizePiece(piece);
    setTaskProgress(dom.audioTabProgress, 96);
    setActivePieceAsImported(normalized);
    setTaskProgress(dom.audioTabProgress, 100);
    dom.customLoadStatus.textContent = `Audio tabs generated (${normalized.notes.length} notes)`;
    setAudioTabStatus(
      `Generated ${normalized.notes.length} notes. BPM guess: ${piece.bpm || 'n/a'}. Best with clean single-note guitar.`,
    );
  } catch (error) {
    setTaskProgress(dom.audioTabProgress, 100);
    setAudioTabStatus(`Audio tab generation failed: ${error.message}`, true);
  } finally {
    dom.generateAudioTabBtn.disabled = false;
  }
}

function findTargetNoteAt(shiftedElapsedSeconds, piece) {
  const activeNotes = piece.notes.filter(
    (note) => shiftedElapsedSeconds >= note.start && shiftedElapsedSeconds < note.end,
  );
  if (!activeNotes.length) return null;

  const unhitActive = activeNotes.find((note) => !state.stats.notesHit.has(note.index));
  return unhitActive || activeNotes[0];
}

function smoothFrequency(frequency) {
  if (!frequency) {
    state.frequencyHistory = [];
    return null;
  }

  state.frequencyHistory.push(frequency);
  if (state.frequencyHistory.length > SMOOTHING_WINDOW) {
    state.frequencyHistory.shift();
  }

  const len = state.frequencyHistory.length;
  const sorted = state.frequencyHistory.slice().sort((a, b) => a - b);
  const middle = Math.floor(len / 2);
  return len % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function computeRms(buf) {
  let rms = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const val = buf[i];
    rms += val * val;
  }
  return Math.sqrt(rms / buf.length);
}

function withPitchHold(rawFrequency) {
  const now = performance.now();
  if (rawFrequency) {
    state.lastDetectedFrequency = rawFrequency;
    state.lastDetectedAtMs = now;
    return rawFrequency;
  }

  if (
    state.lastDetectedFrequency
    && now - state.lastDetectedAtMs <= HOLD_PITCH_MS
  ) {
    return state.lastDetectedFrequency;
  }

  state.lastDetectedFrequency = null;
  return null;
}

function autoCorrelate(buf, sampleRate) {
  const rms = computeRms(buf);
  if (rms < MIN_SIGNAL_RMS) return null;

  let r1 = 0;
  let r2 = buf.length - 1;
  const threshold = 0.2;

  for (let i = 0; i < buf.length / 2; i += 1) {
    if (Math.abs(buf[i]) < threshold) {
      r1 = i;
      break;
    }
  }

  for (let i = 1; i < buf.length / 2; i += 1) {
    if (Math.abs(buf[buf.length - i]) < threshold) {
      r2 = buf.length - i;
      break;
    }
  }

  const trimmed = buf.slice(r1, r2);
  const c = new Float32Array(trimmed.length);

  for (let i = 0; i < trimmed.length; i += 1) {
    for (let j = 0; j < trimmed.length - i; j += 1) {
      c[i] += trimmed[j] * trimmed[j + i];
    }
  }

  let d = 0;
  while (d + 1 < c.length && c[d] > c[d + 1]) d += 1;

  let maxValue = -1;
  let maxPos = -1;

  for (let i = d; i < c.length; i += 1) {
    if (c[i] > maxValue) {
      maxValue = c[i];
      maxPos = i;
    }
  }

  if (maxPos <= 0 || maxPos >= c.length - 1) return null;

  const x1 = c[maxPos - 1];
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a !== 0 ? -b / (2 * a) : 0;
  const period = maxPos + shift;

  if (!Number.isFinite(period) || period <= 0) return null;

  const confidence = maxValue / (c[0] || 1);
  if (confidence < MIN_CONFIDENCE) return null;

  const frequency = sampleRate / period;
  if (!Number.isFinite(frequency) || frequency < 60 || frequency > 1400) return null;

  return { frequency, confidence };
}

function peakDbNearFrequency(frequencyData, sampleRate, fftSize, frequency, radius = 1) {
  if (!frequencyData || !Number.isFinite(frequency) || frequency <= 0) {
    return -120;
  }
  const center = Math.round((frequency * fftSize) / sampleRate);
  if (!Number.isFinite(center)) return -120;

  let peak = -120;
  const start = Math.max(0, center - radius);
  const end = Math.min(frequencyData.length - 1, center + radius);
  for (let bin = start; bin <= end; bin += 1) {
    peak = Math.max(peak, frequencyData[bin]);
  }
  return peak;
}

function spectralScoreForNoteFrequency(frequencyData, sampleRate, fftSize, frequency) {
  const harmonicWeights = [1.0, 0.62, 0.34];
  const harmonicMultipliers = [1, 2, 3];

  let score = 0;
  for (let i = 0; i < harmonicWeights.length; i += 1) {
    const harmonic = frequency * harmonicMultipliers[i];
    if (harmonic > sampleRate / 2) continue;
    const peakDb = peakDbNearFrequency(frequencyData, sampleRate, fftSize, harmonic, 1);
    const linear = 10 ** (peakDb / 20);
    score += harmonicWeights[i] * linear;
  }
  return score;
}

function detectChordMatchesFromSpectrum(candidates, frequencyData, sampleRate, fftSize) {
  if (!Array.isArray(candidates) || !candidates.length || !frequencyData) {
    return { matched: [], scored: [] };
  }

  const scored = candidates.map((candidate) => {
    const fundamentalDb = peakDbNearFrequency(frequencyData, sampleRate, fftSize, candidate.freq, 1);
    const score = spectralScoreForNoteFrequency(frequencyData, sampleRate, fftSize, candidate.freq);
    return {
      candidate,
      fundamentalDb,
      score,
    };
  });

  const maxScore = scored.reduce((max, item) => Math.max(max, item.score), 0);
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { matched: [], scored };
  }

  const minimumScore = maxScore * CHORD_SPECTRAL_MATCH_RATIO;
  const matched = scored
    .filter((item) => item.score >= minimumScore && item.fundamentalDb >= CHORD_SPECTRAL_MIN_DB)
    .map((item) => item.candidate);

  return { matched, scored };
}

async function startAudio(listenMode = 'practice') {
  if (state.isRunning) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    dom.customLoadStatus.textContent = 'Your browser does not support microphone input.';
    return;
  }

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: false,
    });

    state.audioCtx = new AudioContext();
    await state.audioCtx.resume();
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
    state.startTimestamp = performance.now();
    state.lastTickAtMs = state.startTimestamp;
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
    dom.customLoadStatus.textContent = `Mic error: ${error.message}`;
    dom.tunerStatus.textContent = `Mic error: ${error.message}`;
  }
}

function stopAudio() {
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
  dom.micLevelFill.style.width = '0%';
  stopBackingTrack({ reset: false });
  renderStandaloneTuner(null);
}

function restartPiece() {
  resetTimelineCaches();
  state.stats = createEmptyStats();
  state.frequencyHistory = [];
  state.lastDetectedFrequency = null;
  state.lastDetectedAtMs = 0;
  state.stepIndex = 0;
  skipEmptyStepNotes();
  state.startTimestamp = performance.now();
  state.lastTickAtMs = state.startTimestamp;
  renderProgress(state.stats.notesHit.size, state.activePiece.notes.length);
  renderScores(state.practiceMode);
  renderCloseness(Number.NaN, 0, false);
  renderTabs(null, 0);
  if (state.isRunning && state.listenMode === 'practice' && shouldSyncBackingTrack()) {
    syncBackingTrackToPracticeStart();
  }
}

function renderMicStatus(rms, detectedFrequency) {
  const levelPercent = Math.min(100, Math.round((rms / MIC_LEVEL_MAX_RMS) * 100));
  dom.micLevelFill.style.width = `${levelPercent}%`;

  if (!state.isRunning) {
    dom.micStatus.textContent = 'Idle';
    return;
  }

  if (rms < MIN_SIGNAL_RMS) {
    dom.micStatus.textContent = 'No signal';
    return;
  }

  if (detectedFrequency) {
    dom.micStatus.textContent = 'Pitch locked';
    return;
  }

  dom.micStatus.textContent = 'Signal detected';
}

function renderDetected(frequency) {
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

function getTimedHitWindow(targetNote) {
  const center = targetNote.start + targetNote.duration / 2;
  const halfWindowSeconds = Math.min(
    TIMED_HIT_WINDOW_MS / 1000,
    Math.max(0.06, targetNote.duration * 0.45),
  );
  return {
    start: center - halfWindowSeconds,
    end: center + halfWindowSeconds,
  };
}

function isWithinTimedHitWindow(targetNote, shiftedElapsedSeconds) {
  if (!targetNote || state.practiceMode !== 'timed') return false;
  const hitWindow = getTimedHitWindow(targetNote);
  return shiftedElapsedSeconds >= hitWindow.start && shiftedElapsedSeconds <= hitWindow.end;
}

function renderTarget(target, shiftedElapsedSeconds) {
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
  const hitWindow = getTimedHitWindow(target);
  dom.targetWindow.textContent = `Hit window ${hitWindow.start.toFixed(2)}s - ${hitWindow.end.toFixed(2)}s`;
}

function renderCloseness(centsAbs, centsSigned, isTargetActive) {
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

function renderProgress(noteCountHit, total) {
  dom.progressText.textContent = `${noteCountHit} / ${total} notes hit`;
  dom.pieceProgress.value = total > 0 ? (noteCountHit / total) * 100 : 0;
}

function renderScores(mode = state.practiceMode) {
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

function renderStandaloneTuner(detectedFrequency) {
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

  const cents = centsDifference(detectedFrequency, state.tunerTarget.freq);
  const centsAbs = Math.abs(cents);
  const tunePercent = Math.round(pitchScoreForCents(centsAbs) * 100);
  const isInTune = centsAbs < 0.5;
  const isSharp = !isInTune && cents > 0;

  if (isInTune) {
    applyTunerTone('in');
    dom.tunerCloseness.textContent = 'IN TUNE';
    dom.tunerCents.textContent = `${centsAbs.toFixed(1)} cents · in tune`;
    dom.tunerStatus.textContent = `${state.tunerTarget.note}: on target (${tunePercent}% in tune)`;
  } else if (isSharp) {
    applyTunerTone('sharp');
    dom.tunerCloseness.textContent = 'TOO SHARP';
    dom.tunerCents.textContent = `${centsAbs.toFixed(1)} cents sharp · loosen string`;
    dom.tunerStatus.textContent = `${state.tunerTarget.note}: too sharp - loosen string (${tunePercent}% in tune)`;
  } else {
    applyTunerTone('loose');
    dom.tunerCloseness.textContent = 'TOO FLAT';
    dom.tunerCents.textContent = `${centsAbs.toFixed(1)} cents flat · tighten string`;
    dom.tunerStatus.textContent = `${state.tunerTarget.note}: too flat - tighten string (${tunePercent}% in tune)`;
  }

  dom.tunerProgress.value = tunePercent;
}

function nextUpcomingNote(shiftedElapsedSeconds) {
  const notes = state.activePiece?.notes || [];
  if (!notes.length) return null;
  return notes.find((note) => note.start > shiftedElapsedSeconds) || null;
}

function suggestedFingerMapForGroup(groupNotes) {
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

function fingerboardRangeForGroup(groupNotes) {
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

function renderFingerPlacement(targetNote, shiftedElapsedSeconds) {
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

function chordGroupBoundsAtIndex(notes, index) {
  if (!Array.isArray(notes) || !notes.length || index < 0 || index >= notes.length) {
    return { startIndex: -1, endIndex: -1 };
  }

  let startIndex = index;
  while (
    startIndex > 0
    && Math.abs(notes[startIndex].start - notes[startIndex - 1].start) <= CHORD_GROUP_EPSILON_SECONDS
  ) {
    startIndex -= 1;
  }

  let endIndex = index;
  while (
    endIndex < notes.length - 1
    && Math.abs(notes[endIndex + 1].start - notes[endIndex].start) <= CHORD_GROUP_EPSILON_SECONDS
  ) {
    endIndex += 1;
  }

  return { startIndex, endIndex };
}

function isChordStepMode() {
  return state.practiceMode === 'step' && !state.simplifyTabs && state.chordStepAdvance;
}

function stepGroupBoundsForNote(note) {
  if (!note) return { startIndex: -1, endIndex: -1 };
  const notes = state.activePiece?.notes || [];
  const index = Number.isInteger(note.index) ? note.index : notes.findIndex((candidate) => candidate === note);
  if (index < 0 || index >= notes.length) {
    return { startIndex: -1, endIndex: -1 };
  }
  return chordGroupBoundsAtIndex(notes, index);
}

function stepGroupNotesForTarget(targetNote) {
  const notes = state.activePiece?.notes || [];
  if (!isChordStepMode()) {
    return targetNote ? [targetNote] : [];
  }

  const { startIndex, endIndex } = stepGroupBoundsForNote(targetNote);
  if (startIndex < 0 || endIndex < startIndex) return targetNote ? [targetNote] : [];
  return notes.slice(startIndex, endIndex + 1);
}

function chordGroupForNote(note) {
  if (!note) return [];
  if (state.simplifyTabs) return [note];

  const notes = state.activePiece?.notes || [];
  const directIndex = Number.isInteger(note.index) ? note.index : -1;
  const index = (
    directIndex >= 0 && directIndex < notes.length && notes[directIndex] === note
      ? directIndex
      : notes.findIndex((candidate) => candidate === note)
  );

  if (index < 0) return [note];
  const { startIndex, endIndex } = chordGroupBoundsAtIndex(notes, index);
  if (startIndex < 0 || endIndex < startIndex) return [note];
  return notes.slice(startIndex, endIndex + 1);
}

function tabbedNotesFromGroup(groupNotes) {
  return groupNotes
    .filter((note) => note?.tab)
    .sort((a, b) => b.tab.string - a.tab.string || a.tab.fret - b.tab.fret);
}

function formatGroupTargets(groupNotes) {
  const tabbed = tabbedNotesFromGroup(groupNotes);
  if (!tabbed.length) return '--';
  return tabbed.map((note) => `S${note.tab.string} F${note.tab.fret}`).join(' + ');
}

function buildTabDiagram(groupNotes) {
  const markerByString = new Map();
  tabbedNotesFromGroup(groupNotes).forEach((note) => {
    const key = note.tab.string;
    const marker = String(note.tab.fret);
    if (markerByString.has(key)) {
      markerByString.set(key, `${markerByString.get(key)}/${marker}`);
    } else {
      markerByString.set(key, marker);
    }
  });

  const diagramRows = GUITAR_STRINGS.map((guitarString) => {
    const marker = markerByString.get(guitarString.string) || '-';
    const padded = marker.length >= 2 ? marker : marker.padStart(2, '-').padEnd(2, '-');
    return `${guitarString.label}|--${padded}--|`;
  });

  return diagramRows.join('\n');
}

function tabSummary(note) {
  if (!note) return '--';
  const group = chordGroupForNote(note);
  const tabbed = tabbedNotesFromGroup(group);
  if (!tabbed.length) {
    return note.note || '--';
  }
  if (tabbed.length === 1) {
    const one = tabbed[0];
    return `${one.note} · S${one.tab.string} F${one.tab.fret}`;
  }
  return `${tabbed.length}-string shape · ${formatGroupTargets(tabbed)}`;
}

function planStepLabel(note) {
  if (!note) return '--';
  const group = chordGroupForNote(note);
  const tabbed = tabbedNotesFromGroup(group);
  if (!tabbed.length) return note.note || '--';
  if (tabbed.length === 1) {
    const one = tabbed[0];
    return `S${one.tab.string} F${one.tab.fret} (${one.note})`;
  }
  return `Press together: ${formatGroupTargets(tabbed)}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function buildTimelineSegments(notes) {
  const anchors = [];
  let cursor = 0;
  while (cursor < notes.length) {
    if (state.simplifyTabs) {
      anchors.push(cursor);
      cursor += 1;
      continue;
    }

    const { startIndex, endIndex } = chordGroupBoundsAtIndex(notes, cursor);
    if (startIndex < 0 || endIndex < startIndex) {
      cursor += 1;
      continue;
    }
    anchors.push(startIndex);
    cursor = endIndex + 1;
  }

  const totalDuration = Math.max(0.1, state.activePiece?.totalDuration || notes.at(-1)?.end || 0.1);
  const segments = [];

  anchors.forEach((anchorIndex, idx) => {
    const anchorNote = notes[anchorIndex];
    if (!anchorNote) return;
    const nextAnchor = anchors[idx + 1];
    const nextStart = Number.isInteger(nextAnchor)
      ? notes[nextAnchor]?.start
      : totalDuration;
    const start = Math.max(0, anchorNote.start);
    const end = Math.max(start + 0.06, Number.isFinite(nextStart) ? nextStart : totalDuration);
    const label = planStepLabel(anchorNote);

    if (segments.length > 0 && segments.at(-1).label === label) {
      segments.at(-1).end = end;
      segments.at(-1).anchorIndex = anchorIndex;
      return;
    }

    segments.push({
      start,
      end,
      label,
      anchorIndex,
    });
  });

  if (!segments.length && notes.length) {
    segments.push({
      start: 0,
      end: totalDuration,
      label: planStepLabel(notes[0]),
      anchorIndex: 0,
    });
  }

  return {
    segments,
    totalDuration,
  };
}

function timelineModelForCurrentPiece(notes) {
  const headStart = notes[0]?.start || 0;
  const tailStart = notes.at(-1)?.start || 0;
  const cacheKey = `${state.activePiece?.name || 'piece'}|${notes.length}|${headStart}|${tailStart}|${state.simplifyTabs ? 'simp' : 'multi'}`;
  if (state.timelineCache && state.timelineCache.key === cacheKey) {
    return state.timelineCache;
  }

  const built = buildTimelineSegments(notes);
  const model = {
    key: cacheKey,
    ...built,
  };
  state.timelineCache = model;
  return model;
}

function resolveTimelineTime(notes, shiftedElapsedSeconds) {
  if (state.practiceMode === 'step') {
    if (!notes.length) return 0;
    if (state.stepIndex >= notes.length) {
      return state.activePiece?.totalDuration || notes.at(-1)?.end || 0;
    }
    return notes[state.stepIndex]?.start || 0;
  }
  return Math.max(0, shiftedElapsedSeconds);
}

function renderedTimelineTime(targetTimelineTime, totalDuration) {
  const clampedTarget = Math.max(0, Math.min(totalDuration, targetTimelineTime));
  if (state.practiceMode !== 'step') {
    state.timelineVisualTime = clampedTarget;
    state.timelineVisualLastMs = performance.now();
    return clampedTarget;
  }

  const now = performance.now();
  if (!Number.isFinite(state.timelineVisualTime)) {
    state.timelineVisualTime = clampedTarget;
    state.timelineVisualLastMs = now;
    return clampedTarget;
  }

  const dtSeconds = Math.max(0, Math.min(0.08, (now - state.timelineVisualLastMs) / 1000));
  state.timelineVisualLastMs = now;

  // Smooth jump for step mode: fast enough to feel responsive, slow enough to visualize the change.
  const alpha = 1 - Math.exp(-16 * dtSeconds);
  state.timelineVisualTime += (clampedTarget - state.timelineVisualTime) * alpha;

  if (Math.abs(clampedTarget - state.timelineVisualTime) < 0.003) {
    state.timelineVisualTime = clampedTarget;
  }

  return Math.max(0, Math.min(totalDuration, state.timelineVisualTime));
}

function timelineActiveSegmentIndex(segments, timelineTime) {
  if (!segments.length) return -1;
  if (timelineTime < segments[0].start) return -1;

  for (let i = 0; i < segments.length; i += 1) {
    if (timelineTime >= segments[i].start && timelineTime < segments[i].end) {
      return i;
    }
  }

  return segments.length - 1;
}

function renderTimelineTrack(segments, totalDuration, activeSegmentIndex, timelineTime) {
  if (!dom.fretTimeline) return;

  const signature = `${state.timelineCache?.key || 'none'}|${segments.length}`;
  if (!state.timelineDomCache || state.timelineDomCache.signature !== signature) {
    dom.fretTimeline.textContent = '';
    const track = document.createElement('div');
    track.className = 'fret-timeline-track';

    const markerEls = [];
    segments.forEach((segment) => {
      const marker = document.createElement('span');
      marker.className = 'fret-marker';
      marker.style.left = `${(clamp01(segment.start / totalDuration) * 100).toFixed(3)}%`;
      marker.title = `${formatClock(segment.start)} · ${segment.label}`;
      track.append(marker);
      markerEls.push(marker);
    });

    const playhead = document.createElement('span');
    playhead.className = 'fret-playhead';
    track.append(playhead);

    dom.fretTimeline.append(track);
    state.timelineDomCache = {
      signature,
      markerEls,
      playhead,
      activeSegmentIndex: -2,
    };
  }

  const domCache = state.timelineDomCache;
  if (!domCache?.playhead) return;
  domCache.playhead.style.left = `${(clamp01(timelineTime / totalDuration) * 100).toFixed(3)}%`;

  if (domCache.activeSegmentIndex !== activeSegmentIndex) {
    domCache.markerEls.forEach((marker, index) => {
      marker.classList.toggle('is-active', index === activeSegmentIndex);
    });
    domCache.activeSegmentIndex = activeSegmentIndex;
  }
}

function renderFretPlan(notes, currentIndex, nextIndex, shiftedElapsedSeconds) {
  if (!notes.length) {
    dom.fretPlanNow.textContent = '--';
    dom.fretPlanHint.textContent = 'No playable note map';
    if (dom.fretTimelineMeta) dom.fretTimelineMeta.textContent = 'No timeline available';
    if (dom.fretTimeline) dom.fretTimeline.textContent = '';
    return;
  }

  const model = timelineModelForCurrentPiece(notes);
  const targetTimelineTime = resolveTimelineTime(notes, shiftedElapsedSeconds);
  const timelineTime = renderedTimelineTime(targetTimelineTime, model.totalDuration);
  const activeSegmentIndex = timelineActiveSegmentIndex(model.segments, timelineTime);
  const activeSegment = activeSegmentIndex >= 0 ? model.segments[activeSegmentIndex] : null;
  const nextSegment = activeSegmentIndex >= 0
    ? model.segments[activeSegmentIndex + 1] || null
    : model.segments[0] || null;

  if (activeSegment) {
    dom.fretPlanNow.textContent = activeSegment.label;
    dom.fretPlanHint.textContent = nextSegment
      ? `Next change at ${formatClock(nextSegment.start)}`
      : 'Last fret position of the piece';
  } else {
    dom.fretPlanNow.textContent = '--';
    dom.fretPlanHint.textContent = `First change at ${formatClock(model.segments[0].start)}`;
  }

  const stepInfo = Number.isInteger(currentIndex) && currentIndex >= 0
    ? `Current note ${currentIndex + 1}/${notes.length}`
    : (
      Number.isInteger(nextIndex) && nextIndex >= 0
        ? `Upcoming note ${nextIndex + 1}/${notes.length}`
        : 'Piece complete'
    );
  if (dom.fretTimelineMeta) {
    dom.fretTimelineMeta.textContent = `${stepInfo} · ${formatClock(timelineTime)} / ${formatClock(model.totalDuration)}`;
  }

  renderTimelineTrack(model.segments, model.totalDuration, activeSegmentIndex, timelineTime);
}

function tabHintText(note, emptyMessage) {
  if (!note) return emptyMessage;
  const group = chordGroupForNote(note);
  const tabbed = tabbedNotesFromGroup(group);
  if (!tabbed.length) return 'No mapped fret position for this note.';

  if (tabbed.length > 1) {
    return `Press together: ${formatGroupTargets(tabbed)}`;
  }

  const primary = tabbed[0];
  const tabString = GUITAR_STRINGS.find((guitarString) => guitarString.string === primary.tab.string);
  const alternate = primary.tabAlternatives.filter(
    (position) => position.string !== primary.tab.string || position.fret !== primary.tab.fret,
  );
  const rangePrefix = primary.tab.isExtended ? `Above beginner range (>${MAX_FRET_FOR_BEGINNER_TAB} frets). ` : '';
  const chordPrefix = primary.tab.isChordTone ? `Chord tone ${primary.tab.chordIndex + 1}/${primary.tab.chordSize}. ` : '';

  return alternate.length
    ? `${rangePrefix}${chordPrefix}${tabString.display}. Alt: S${alternate[0].string} F${alternate[0].fret}`
    : `${rangePrefix}${chordPrefix}${tabString.display}.`;
}

function renderTabSlot({ tabEl, hintEl, diagramEl }, note, emptyMessage) {
  const group = chordGroupForNote(note);
  tabEl.textContent = tabSummary(note);
  hintEl.textContent = tabHintText(note, emptyMessage);
  diagramEl.textContent = buildTabDiagram(group);
}

function tabIndicesAt(shiftedElapsedSeconds) {
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

function findPrevGroupAnchorIndex(notes, startTime) {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (notes[i].start < startTime - CHORD_GROUP_EPSILON_SECONDS) {
      return i;
    }
  }
  return -1;
}

function findNextGroupAnchorIndex(notes, startTime) {
  return notes.findIndex((note) => note.start > startTime + CHORD_GROUP_EPSILON_SECONDS);
}

function renderTabs(targetNote, shiftedElapsedSeconds) {
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

function scoreFrame({
  detectedFrequency,
  hasLivePitch,
  frequencyData,
  sampleRate,
  fftSize,
  frameDeltaMs,
  targetNote,
  shiftedElapsedSeconds,
}) {
  if (!targetNote) {
    renderCloseness(Number.NaN, 0, false);
    renderProgress(state.stats.notesHit.size, state.activePiece.notes.length);
    renderScores(state.practiceMode);
    return;
  }

  const stepGroup = stepGroupNotesForTarget(targetNote).filter((note) => !isStepNoteEmptyOrUnmapped(note));
  const remainingStepGroup = stepGroup.filter((note) => !state.stats.notesHit.has(note.index));
  if (isChordStepMode() && !remainingStepGroup.length && stepGroup.length) {
    const { endIndex } = stepGroupBoundsForNote(targetNote);
    if (endIndex >= state.stepIndex) {
      state.stepIndex = endIndex + 1;
    }
    renderProgress(state.stats.notesHit.size, state.activePiece.notes.length);
    renderScores(state.practiceMode);
    return;
  }

  const activeCandidates = state.practiceMode === 'step'
    ? (isChordStepMode() ? remainingStepGroup : [targetNote])
    : [targetNote];

  const resetHitCandidates = (candidates) => {
    if (isChordStepMode() && Number.isInteger(targetNote.index)) {
      state.stats.noteHitStreak.set(targetNote.index, 0);
      state.stats.noteHitHoldMs.set(targetNote.index, 0);
    }
    for (const candidate of candidates) {
      if (!candidate || !Number.isInteger(candidate.index)) continue;
      state.stats.noteHitStreak.set(candidate.index, 0);
      state.stats.noteHitHoldMs.set(candidate.index, 0);
    }
  };

  if (state.practiceMode === 'timed' && !isWithinTimedHitWindow(targetNote, shiftedElapsedSeconds)) {
    dom.closeness.textContent = 'Wait';
    dom.centsOff.textContent = 'Outside hit window';
    resetHitCandidates(activeCandidates);
    renderProgress(state.stats.notesHit.size, state.activePiece.notes.length);
    renderScores(state.practiceMode);
    return;
  }

  const canUseChordSpectrum = (
    isChordStepMode()
    && activeCandidates.length > 1
    && frequencyData
    && Number.isFinite(sampleRate)
    && Number.isFinite(fftSize)
  );
  const chordSpectrum = canUseChordSpectrum
    ? detectChordMatchesFromSpectrum(activeCandidates, frequencyData, sampleRate, fftSize)
    : { matched: [], scored: [] };
  const hasFullChordMatch = canUseChordSpectrum && chordSpectrum.matched.length >= activeCandidates.length;

  if ((!hasLivePitch || !detectedFrequency) && !hasFullChordMatch) {
    renderCloseness(Number.NaN, 0, true);
    resetHitCandidates(activeCandidates);
    renderProgress(state.stats.notesHit.size, state.activePiece.notes.length);
    renderScores(state.practiceMode);
    return;
  }

  const scoringTarget = hasLivePitch && detectedFrequency
    ? (
      activeCandidates.reduce((best, candidate) => {
        if (!best) return candidate;
        const candidateCents = Math.abs(centsDifference(detectedFrequency, candidate.freq));
        const bestCents = Math.abs(centsDifference(detectedFrequency, best.freq));
        return candidateCents < bestCents ? candidate : best;
      }, null) || targetNote
    )
    : (chordSpectrum.matched[0] || targetNote);

  const cents = hasLivePitch && detectedFrequency
    ? centsDifference(detectedFrequency, scoringTarget.freq)
    : 0;
  const centsAbs = Math.abs(cents);

  const pitchScore = hasLivePitch
    ? pitchScoreForCents(centsAbs)
    : (hasFullChordMatch ? 1 : 0);
  state.stats.pitchSamples += 1;
  state.stats.pitchTotal += pitchScore;

  let isHitNow = hasFullChordMatch;
  let holdHint = '';
  if (!isHitNow && state.practiceMode === 'timed') {
    const noteCenter = targetNote.start + targetNote.duration / 2;
    const timingMs = (shiftedElapsedSeconds - noteCenter) * 1000;
    const timingScore = timingScoreForMs(Math.abs(timingMs));
    state.stats.timingSamples += 1;
    state.stats.timingTotal += timingScore;
    isHitNow = centsAbs < HIT_CENTS_THRESHOLD && Math.abs(timingMs) < HIT_TIMING_THRESHOLD_MS;
  } else if (!isHitNow) {
    isHitNow = centsAbs < HIT_CENTS_THRESHOLD;
  }

  const requiredHoldMs = state.practiceMode === 'timed' ? TIMED_MIN_HIT_HOLD_MS : STEP_MIN_HIT_HOLD_MS;
  const noteIndex = hasFullChordMatch ? targetNote.index : scoringTarget.index;
  if (isHitNow) {
    const streak = (state.stats.noteHitStreak.get(noteIndex) || 0) + 1;
    const holdMs = (state.stats.noteHitHoldMs.get(noteIndex) || 0) + frameDeltaMs;
    state.stats.noteHitStreak.set(noteIndex, streak);
    state.stats.noteHitHoldMs.set(noteIndex, holdMs);

    if (streak >= MIN_HIT_STREAK && holdMs >= requiredHoldMs) {
      if (hasFullChordMatch && isChordStepMode()) {
        for (const candidate of activeCandidates) {
          state.stats.notesHit.add(candidate.index);
          state.stats.noteHitStreak.set(candidate.index, 0);
          state.stats.noteHitHoldMs.set(candidate.index, 0);
        }
        state.stats.noteHitStreak.set(targetNote.index, 0);
        state.stats.noteHitHoldMs.set(targetNote.index, 0);
      } else {
        state.stats.notesHit.add(noteIndex);
        state.stats.noteHitStreak.set(noteIndex, 0);
        state.stats.noteHitHoldMs.set(noteIndex, 0);
      }
      if (state.practiceMode === 'step') {
        if (isChordStepMode()) {
          const remaining = stepGroup.filter((note) => !state.stats.notesHit.has(note.index));
          if (!remaining.length) {
            const { endIndex } = stepGroupBoundsForNote(targetNote);
            if (endIndex >= state.stepIndex) {
              state.stepIndex = endIndex + 1;
            }
          }
        } else if (noteIndex === state.stepIndex) {
          state.stepIndex += 1;
        }
      }
    } else {
      if (hasFullChordMatch) {
        holdHint = `Full shape detected · hold ${Math.min(requiredHoldMs, Math.round(holdMs))}/${requiredHoldMs}ms`;
      } else {
        holdHint = `${scoringTarget.note} ${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents · hold ${Math.min(
          requiredHoldMs,
          Math.round(holdMs),
        )}/${requiredHoldMs}ms`;
      }
    }
  } else {
    resetHitCandidates(activeCandidates);
  }

  renderCloseness(centsAbs, cents, true);
  if (holdHint) {
    dom.centsOff.textContent = holdHint;
  }
  renderProgress(state.stats.notesHit.size, state.activePiece.notes.length);
  renderScores(state.practiceMode);
}

function tick() {
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

  const rawElapsedSeconds = (nowMs - state.startTimestamp) / 1000;
  const tempoScale = state.practiceMode === 'timed' ? getBpmScale() : 1;
  const elapsedSeconds = rawElapsedSeconds * tempoScale;
  const offsetMs = state.practiceMode === 'timed' ? Number(dom.latencyOffset.value) : 0;
  const shiftedElapsedSeconds = elapsedSeconds + offsetMs / 1000;

  state.analyser.getFloatTimeDomainData(state.data);
  if (state.frequencyData) {
    state.analyser.getFloatFrequencyData(state.frequencyData);
  }

  const rms = computeRms(state.data);
  const pitch = autoCorrelate(state.data, state.audioCtx.sampleRate);
  const liveFrequency = pitch?.frequency || null;
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

function loadPreset(index) {
  const selected = presetPieces[index];
  if (!selected) return;
  state.activePiece = normalizePiece(selected);
  syncBpmSliderWithPiece(state.activePiece);
  dom.customLoadStatus.textContent = `Loaded: ${state.activePiece.name}`;
  syncPieceEditor(state.activePiece);
  dom.songSelect.value = `preset:${index}`;
  restartPiece();
}

function loadImported(index) {
  const selected = state.importedPieces[index];
  if (!selected) return;
  state.activePiece = normalizePiece(selected);
  syncBpmSliderWithPiece(state.activePiece);
  dom.customLoadStatus.textContent = `Loaded imported: ${state.activePiece.name}`;
  syncPieceEditor(state.activePiece);
  dom.songSelect.value = `imported:${index}`;
  restartPiece();
}

function loadFromSongSelectValue(value) {
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

function loadCustomPiece() {
  const raw = dom.customPiece.value.trim();
  if (!raw) {
    dom.customLoadStatus.textContent = 'Custom piece is empty';
    return;
  }

  try {
    const pieceLike = parseCustomPieceInput(raw);
    const normalized = normalizePiece(pieceLike);

    state.activePiece = normalized;
    syncBpmSliderWithPiece(normalized);
    dom.customLoadStatus.textContent = `Custom piece loaded (${normalized.notes.length} notes)`;
    syncPieceEditor(normalized);
    dom.songSelect.selectedIndex = -1;
    restartPiece();
  } catch (error) {
    dom.customLoadStatus.textContent = `Invalid custom piece: ${error.message}`;
  }
}

function updateModeUi() {
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
    : `Timed mode: hit each note inside a narrow +/-${TIMED_HIT_WINDOW_MS}ms window around the note center.`;
  updateGuideToneHint();
  updateTabsPanelCopy();
}

function bindEvents() {
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

function init() {
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
  dom.micLevelFill.style.width = '0%';
  renderTabs(null, 0);
  renderStandaloneTuner(null);
  setImportStatus('Import tab links into playable single-note timelines.');
  setAudioTabStatus('Upload a clean guitar recording to auto-generate beginner single-note tabs.');
}

init();
