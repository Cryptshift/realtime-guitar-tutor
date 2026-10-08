// Web Worker that runs pitch and onset detection on frames from the capture worklet,
// keeping all DSP off the main thread. Posts one small result per frame to the page:
// { type: 'analysis', endTime, rms, frequency, clarity, onsetTime } (times in
// AudioContext seconds).
import { createOnsetDetector } from '../dsp/onset.js';
import { computeRms, detectPitch } from '../dsp/pitch.js';
import { frequencyToFractionalMidi } from '../music.js';

let framePort = null;
let sampleRate = 48000;
let range = undefined;
let onsetDetector = createOnsetDetector();

function analyse(samples, endTime) {
  const rms = computeRms(samples);
  const pitch = detectPitch(samples, sampleRate, range);
  const frequency = pitch?.frequency || null;
  const onsetMs = onsetDetector.update({
    rms,
    pitchMidi: frequency ? frequencyToFractionalMidi(frequency) : null,
    nowMs: endTime * 1000,
  });
  return {
    type: 'analysis',
    endTime,
    rms,
    frequency,
    clarity: pitch?.confidence ?? 0,
    onsetTime: onsetMs === null ? null : onsetMs / 1000,
  };
}

self.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'init') {
    sampleRate = message.sampleRate;
    range = message.range;
    const hopMs = (message.hopSize / sampleRate) * 1000;
    // The onset detector's frame-count settings were tuned at ~60 frames/s; keep the
    // same time spans at this hop size.
    onsetDetector = createOnsetDetector({
      historyFrames: Math.max(3, Math.round(100 / hopMs)),
      stableFrames: Math.max(2, Math.round(33 / hopMs)),
    });
    framePort = message.port;
    framePort.onmessage = (frameEvent) => {
      const frame = frameEvent.data;
      if (frame?.type !== 'frame') return;
      self.postMessage(analyse(frame.samples, frame.endTime));
      framePort.postMessage({ type: 'recycle', buffer: frame.samples }, [frame.samples.buffer]);
    };
  }
};
