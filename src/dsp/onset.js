// Frame-level note-onset detection (level rise or new stable pitch).
import { MIN_SIGNAL_RMS } from './pitch.js';

export const ONSET_RISE_RATIO = 1.6;

export const ONSET_MIN_RMS = MIN_SIGNAL_RMS * 2;

export const ONSET_REFRACTORY_MS = 120;

export const ONSET_HISTORY_FRAMES = 6;

export const ONSET_PITCH_CHANGE_SEMITONES = 0.7;

export const ONSET_PITCH_STABLE_FRAMES = 2;

export const ONSET_PITCH_MERGE_MS = 250;

// Frame-by-frame note-onset detector. A new note starts when either
//  - the level jumps by ONSET_RISE_RATIO over the quietest recent frame (a pluck, including
//    re-plucking a string that is still ringing), or
//  - a new pitch becomes stable (legato hammer-on/slide, or a soft note after silence)
//    and no energy onset fired in the previous ONSET_PITCH_MERGE_MS.
// update() returns the onset time in ms for the frame that starts a note, otherwise null.
export function createOnsetDetector(options = {}) {
  const {
    riseRatio = ONSET_RISE_RATIO,
    minRms = ONSET_MIN_RMS,
    refractoryMs = ONSET_REFRACTORY_MS,
    historyFrames = ONSET_HISTORY_FRAMES,
    pitchChangeSemitones = ONSET_PITCH_CHANGE_SEMITONES,
    stableFrames = ONSET_PITCH_STABLE_FRAMES,
    pitchMergeMs = ONSET_PITCH_MERGE_MS,
  } = options;

  let rmsHistory = [];
  let lastOnsetMs = -Infinity;
  let stablePitch = null;
  let candidate = null;
  let unpitchedFrames = 0;

  return {
    reset() {
      rmsHistory = [];
      lastOnsetMs = -Infinity;
      stablePitch = null;
      candidate = null;
      unpitchedFrames = 0;
    },
    update({ rms, pitchMidi = null, nowMs }) {
      let onsetMs = null;
      if (nowMs - lastOnsetMs < refractoryMs) {
        // Still inside the attack: track only the latest level so the baseline after the
        // refractory period is the sustained level, not the pre-attack silence.
        rmsHistory = [rms];
      } else {
        const baseline = rmsHistory.length ? Math.min(...rmsHistory) : null;
        if (
          baseline !== null
          && rms >= minRms
          && rms >= Math.max(baseline, minRms / 2) * riseRatio
        ) {
          onsetMs = nowMs;
          lastOnsetMs = nowMs;
        }
        rmsHistory.push(rms);
        if (rmsHistory.length > historyFrames) rmsHistory.shift();
      }

      if (!Number.isFinite(pitchMidi)) {
        unpitchedFrames += 1;
        candidate = null;
        if (unpitchedFrames >= 3) stablePitch = null;
        return onsetMs;
      }

      unpitchedFrames = 0;
      if (stablePitch !== null && Math.abs(pitchMidi - stablePitch) < pitchChangeSemitones) {
        candidate = null;
        return onsetMs;
      }

      if (candidate && Math.abs(pitchMidi - candidate.pitch) < pitchChangeSemitones) {
        candidate.frames += 1;
      } else {
        candidate = { pitch: pitchMidi, frames: 1, startMs: nowMs };
      }

      if (candidate.frames >= stableFrames) {
        stablePitch = candidate.pitch;
        if (onsetMs === null && candidate.startMs - lastOnsetMs >= pitchMergeMs) {
          onsetMs = candidate.startMs;
          lastOnsetMs = candidate.startMs;
        }
        candidate = null;
      }
      return onsetMs;
    },
  };
}
