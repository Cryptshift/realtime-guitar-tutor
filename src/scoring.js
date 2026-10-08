// Practice scoring: target selection, onset bookkeeping, hit/step logic.
import { detectChordMatchesFromSpectrum } from './dsp/spectrum.js';
import { centsDifference } from './music.js';
import {
  CHORD_GROUP_EPSILON_SECONDS,
  chordGroupBoundsAtIndex,
  clampBpm,
  isStepNoteEmptyOrUnmapped,
} from './piece.js';
import { renderCloseness, renderPieceProgress, renderScores } from './render/status.js';
import { dom, state } from './state.js';

export const MAX_CENTS_FOR_PERFECT = 12;

export const MAX_CENTS_FOR_GOOD = 28;

export const HIT_CENTS_THRESHOLD = 35;

export const MIN_HIT_STREAK = 2;

export const STEP_MIN_HIT_HOLD_MS = 220;

export const TIMED_MIN_HIT_HOLD_MS = 140;

export const MAX_SCORING_FRAME_DELTA_MS = 80;

export const SMOOTHING_WINDOW = 5;

export const HOLD_PITCH_MS = 200;

export const MAX_TRACKED_ONSETS = 24;

export function closenessLabel(centsAbs) {
  if (centsAbs <= MAX_CENTS_FOR_PERFECT) return 'Perfect';
  if (centsAbs <= MAX_CENTS_FOR_GOOD) return 'Good';
  if (centsAbs <= 50) return 'Close';
  return 'Off';
}

export function pitchScoreForCents(centsAbs) {
  if (centsAbs >= 120) return 0;
  return Math.max(0, 1 - centsAbs / 120);
}

export function timingScoreForMs(msAbs) {
  if (msAbs >= 260) return 0;
  return Math.max(0, 1 - msAbs / 260);
}

export function skipEmptyStepNotes() {
  if (state.practiceMode !== 'step') return 0;
  let skipped = 0;

  while (state.stepIndex < state.activePiece.notes.length) {
    const note = state.activePiece.notes[state.stepIndex];
    if (!isStepNoteEmptyOrUnmapped(note)) {
      break;
    }
    // Out-of-range/unmapped notes are skipped, not counted as hits.
    state.stats.notesSkipped.add(state.stepIndex);
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

export function pieceClockScale() {
  return state.practiceMode === 'timed' ? getBpmScale() : 1;
}

export function resetPieceClock(atMs = performance.now()) {
  state.pieceClock.reset(atMs, pieceClockScale());
}

export function getBpmScale() {
  const pieceBpm = clampBpm(state.activePiece?.bpm || 100);
  const activeBpm = clampBpm(state.activeBpm || pieceBpm);
  return activeBpm / pieceBpm;
}

export function findTargetNoteAt(shiftedElapsedSeconds, piece) {
  const activeNotes = piece.notes.filter(
    (note) => shiftedElapsedSeconds >= note.start
      && shiftedElapsedSeconds < note.end
      && !isStepNoteEmptyOrUnmapped(note),
  );
  if (!activeNotes.length) return null;

  const unhitActive = activeNotes.find((note) => !state.stats.notesHit.has(note.index));
  return unhitActive || activeNotes[0];
}

export function smoothFrequency(frequency) {
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

export function withPitchHold(rawFrequency) {
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

export function latencyOffsetSeconds() {
  return state.practiceMode === 'timed' ? Number(dom.latencyOffset.value) / 1000 : 0;
}

export function registerOnset(atMs) {
  state.onsetSeq += 1;
  state.lastOnsetAtMs = atMs;
  state.onsets.push({
    id: state.onsetSeq,
    // Same time base as the timed-mode target lookup (piece time + latency offset).
    pieceSeconds: state.pieceClock.secondsAt(atMs) + latencyOffsetSeconds(),
    consumedStart: null,
  });
  if (state.onsets.length > MAX_TRACKED_ONSETS) {
    state.onsets.shift();
  }
}

// Forget onsets heard before a (re)start; in step mode the first note needs a new pluck.
export function resetOnsets() {
  state.onsets = [];
  state.stepArmedOnsetSeq = state.onsetSeq;
  state.lastTimingMs = null;
}

// Nearest onset to note.start within the note's window that no other note start has used.
// Notes sharing a start (a chord) may share one onset (one strum).
export function findOnsetForNote(note) {
  let best = null;
  let bestDistance = Infinity;
  for (const onset of state.onsets) {
    if (
      onset.consumedStart !== null
      && Math.abs(onset.consumedStart - note.start) > CHORD_GROUP_EPSILON_SECONDS
    ) {
      continue;
    }
    const distance = Math.abs(onset.pieceSeconds - note.start);
    if (distance <= note.onsetWindow && distance < bestDistance) {
      best = onset;
      bestDistance = distance;
    }
  }
  return best;
}

export function advanceStepTo(index) {
  state.stepIndex = index;
  // Onsets heard so far belong to earlier steps; the next step needs a fresh one.
  state.stepArmedOnsetSeq = state.onsetSeq;
}

export function hasFreshStepOnset() {
  return state.onsetSeq > state.stepArmedOnsetSeq;
}

export function formatTimingOffset(timingMs) {
  if (!Number.isFinite(timingMs)) return '';
  if (Math.abs(timingMs) < 15) return 'on time';
  return `${Math.round(Math.abs(timingMs))} ms ${timingMs < 0 ? 'early' : 'late'}`;
}

export function isChordStepMode() {
  return state.practiceMode === 'step' && !state.simplifyTabs && state.chordStepAdvance;
}

export function stepGroupBoundsForNote(note) {
  if (!note) return { startIndex: -1, endIndex: -1 };
  const notes = state.activePiece?.notes || [];
  const index = Number.isInteger(note.index) ? note.index : notes.findIndex((candidate) => candidate === note);
  if (index < 0 || index >= notes.length) {
    return { startIndex: -1, endIndex: -1 };
  }
  return chordGroupBoundsAtIndex(notes, index);
}

export function stepGroupNotesForTarget(targetNote) {
  const notes = state.activePiece?.notes || [];
  if (!isChordStepMode()) {
    return targetNote ? [targetNote] : [];
  }

  const { startIndex, endIndex } = stepGroupBoundsForNote(targetNote);
  if (startIndex < 0 || endIndex < startIndex) return targetNote ? [targetNote] : [];
  return notes.slice(startIndex, endIndex + 1);
}

export function chordGroupForNote(note) {
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

export function scoreFrame({
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
    renderPieceProgress();
    renderScores(state.practiceMode);
    return;
  }

  const stepGroup = stepGroupNotesForTarget(targetNote).filter((note) => !isStepNoteEmptyOrUnmapped(note));
  const remainingStepGroup = stepGroup.filter((note) => !state.stats.notesHit.has(note.index));
  if (isChordStepMode() && !remainingStepGroup.length && stepGroup.length) {
    const { endIndex } = stepGroupBoundsForNote(targetNote);
    if (endIndex >= state.stepIndex) {
      advanceStepTo(endIndex + 1);
    }
    renderPieceProgress();
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
    renderPieceProgress();
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

  const isTimed = state.practiceMode === 'timed';
  if (isTimed && state.stats.notesHit.has(targetNote.index)) {
    // Already counted; keep pitch feedback while it rings but don't score it twice.
    renderCloseness(centsAbs, cents, true);
    dom.centsOff.textContent = `Hit · ${formatTimingOffset(state.lastTimingMs)}`;
    renderPieceProgress();
    renderScores(state.practiceMode);
    return;
  }

  // A hit needs the right pitch AND a fresh note start: in timed mode an onset near
  // note.start, in step mode any onset since this step became current. This stops a
  // ringing note from also counting for the next identical note.
  const timedOnset = isTimed ? findOnsetForNote(targetNote) : null;
  const hasRequiredOnset = isTimed ? Boolean(timedOnset) : hasFreshStepOnset();
  const pitchMatches = hasFullChordMatch || centsAbs < HIT_CENTS_THRESHOLD;
  const isHitNow = pitchMatches && hasRequiredOnset;
  let holdHint = '';
  if (pitchMatches && !hasRequiredOnset) {
    if (!isTimed) {
      holdHint = 'Right note - pluck it again to confirm this step';
    } else if (shiftedElapsedSeconds - targetNote.start > targetNote.onsetWindow) {
      holdHint = `Right note, but not plucked within ±${Math.round(targetNote.onsetWindow * 1000)} ms of its start`;
    } else {
      holdHint = 'Right note - pluck it on the beat';
    }
  }

  const requiredHoldMs = state.practiceMode === 'timed' ? TIMED_MIN_HIT_HOLD_MS : STEP_MIN_HIT_HOLD_MS;
  const noteIndex = hasFullChordMatch ? targetNote.index : scoringTarget.index;
  if (isHitNow) {
    const streak = (state.stats.noteHitStreak.get(noteIndex) || 0) + 1;
    const holdMs = (state.stats.noteHitHoldMs.get(noteIndex) || 0) + frameDeltaMs;
    state.stats.noteHitStreak.set(noteIndex, streak);
    state.stats.noteHitHoldMs.set(noteIndex, holdMs);

    if (streak >= MIN_HIT_STREAK && holdMs >= requiredHoldMs) {
      if (isTimed && timedOnset) {
        const timingMs = (timedOnset.pieceSeconds - targetNote.start) * 1000;
        state.stats.timingSamples += 1;
        state.stats.timingTotal += timingScoreForMs(Math.abs(timingMs));
        timedOnset.consumedStart = targetNote.start;
        state.lastTimingMs = timingMs;
        holdHint = `Hit · ${formatTimingOffset(timingMs)}`;
      }
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
              advanceStepTo(endIndex + 1);
            }
          }
        } else if (noteIndex === state.stepIndex) {
          advanceStepTo(state.stepIndex + 1);
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
  renderPieceProgress();
  renderScores(state.practiceMode);
}
