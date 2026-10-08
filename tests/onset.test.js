import { describe, expect, it } from 'vitest';
import {
  createOnsetDetector,
  detectPitch,
  midiToFrequency,
  normalizePiece,
} from '../src/main.js';

const SAMPLE_RATE = 48000;
const FRAME = 2048;
const HOP_MS = 1000 / 60; // requestAnimationFrame cadence

// Mono buffer with a plucked note (exp decay, 2 harmonics) starting at each time in `plucks`.
function renderPlucks(plucks, seconds) {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (const { at, frequency, gain = 0.1 } of plucks) {
    const startSample = Math.round(at * SAMPLE_RATE);
    const phase0 = 0;
    for (let i = startSample; i < out.length; i += 1) {
      const t = (i - startSample) / SAMPLE_RATE;
      const next = plucks.find((p) => p.at > at);
      if (next && i >= Math.round(next.at * SAMPLE_RATE)) break; // string is re-plucked/damped
      const phase = 2 * Math.PI * frequency * t + phase0;
      out[i] += gain * Math.exp(-2.5 * t) * (Math.sin(phase) + 0.5 * Math.sin(2 * phase));
    }
  }
  return out;
}

// Runs the live pipeline (pitch + onset) over a buffer the way tick() does.
function liveOnsets(buffer) {
  const detector = createOnsetDetector();
  const onsets = [];
  for (let nowMs = (FRAME / SAMPLE_RATE) * 1000; ; nowMs += HOP_MS) {
    const end = Math.round((nowMs / 1000) * SAMPLE_RATE);
    if (end > buffer.length) break;
    const frame = buffer.subarray(end - FRAME, end);
    let energy = 0;
    for (const v of frame) energy += v * v;
    const rms = Math.sqrt(energy / FRAME);
    const pitch = detectPitch(frame, SAMPLE_RATE);
    const pitchMidi = pitch ? 12 * Math.log2(pitch.frequency / 440) + 69 : null;
    const onsetMs = detector.update({ rms, pitchMidi, nowMs });
    if (onsetMs !== null) onsets.push(onsetMs / 1000);
  }
  return onsets;
}

describe('createOnsetDetector', () => {
  it('fires once for a single sustained pluck', () => {
    const onsets = liveOnsets(renderPlucks([{ at: 0.3, frequency: midiToFrequency(60) }], 2));
    expect(onsets).toHaveLength(1);
    expect(Math.abs(onsets[0] - 0.3)).toBeLessThan(0.04);
  });

  it('fires again when the same note is re-plucked while still ringing', () => {
    const frequency = midiToFrequency(60);
    const onsets = liveOnsets(renderPlucks([
      { at: 0.3, frequency },
      { at: 1.0, frequency },
    ], 2));
    expect(onsets).toHaveLength(2);
    expect(Math.abs(onsets[1] - 1.0)).toBeLessThan(0.04);
  });

  it('fires on a legato pitch change without a level rise', () => {
    // Hammer-on: same amplitude envelope continues, pitch jumps a whole tone.
    const out = new Float32Array(Math.round(1.5 * SAMPLE_RATE));
    let phase = 0;
    for (let i = 0; i < out.length; i += 1) {
      const t = i / SAMPLE_RATE;
      const frequency = t < 0.8 ? midiToFrequency(57) : midiToFrequency(59);
      phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
      out[i] = t < 0.2 ? 0 : 0.1 * Math.exp(-1.5 * (t - 0.2)) * Math.sin(phase);
    }
    const onsets = liveOnsets(out);
    expect(onsets).toHaveLength(2);
    expect(Math.abs(onsets[0] - 0.2)).toBeLessThan(0.04);
    expect(Math.abs(onsets[1] - 0.8)).toBeLessThan(0.06);
  });

  it('stays quiet on a decaying note and on silence', () => {
    const detector = createOnsetDetector();
    let fired = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const rms = 0.05 * Math.exp(-frame / 40);
      if (detector.update({ rms, pitchMidi: 64, nowMs: frame * HOP_MS }) !== null) fired += 1;
    }
    // Only the first stable-pitch frame may count (the note's own start).
    expect(fired).toBeLessThanOrEqual(1);
    const quiet = createOnsetDetector();
    for (let frame = 0; frame < 60; frame += 1) {
      expect(quiet.update({ rms: 0.0005, pitchMidi: null, nowMs: frame * HOP_MS })).toBeNull();
    }
  });
});

describe('note onset windows', () => {
  it('uses ±200 ms for sparse notes and half the gap for dense ones', () => {
    const piece = normalizePiece({
      notes: [
        { note: 'E2', start: 0, duration: 1 },
        { note: 'A2', start: 1, duration: 0.2 },
        { note: 'D3', start: 1.2, duration: 0.1 },
        { note: 'G3', start: 1.3, duration: 0.05 },
        { note: 'B3', start: 1.35, duration: 1 },
      ],
    });
    const windows = piece.notes.map((note) => Math.round(note.onsetWindow * 1000));
    expect(windows).toEqual([200, 100, 50, 25, 25].map((ms) => Math.max(60, ms)));
  });

  it('gives chord tones that share a start the same window', () => {
    const piece = normalizePiece({
      notes: [
        { note: 'E2', start: 0, duration: 1 },
        { note: 'B2', start: 0, duration: 1 },
        { note: 'E3', start: 0, duration: 1 },
        { note: 'A2', start: 0.3, duration: 1 },
      ],
    });
    expect(piece.notes.slice(0, 3).map((n) => n.onsetWindow)).toEqual([0.15, 0.15, 0.15]);
  });
});
