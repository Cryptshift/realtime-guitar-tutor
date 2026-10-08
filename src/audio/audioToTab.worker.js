// Web Worker for "Generate tabs from audio": runs the whole offline transcription so a
// full song never blocks the UI. Messages in: { channels: Float32Array[], sampleRate,
// minNoteMs, range, frameSize }. Messages out: { type: 'progress', fraction },
// { type: 'done', notes, bpm } or { type: 'error', message }. Cancel = terminate().
import {
  detectMonophonicNotesFromAudio,
  downmixChannels,
  estimateBpmFromDetectedNotes,
} from '../audioToTab.js';

self.onmessage = (event) => {
  const { channels, sampleRate, minNoteMs, range, frameSize } = event.data;
  try {
    const mono = downmixChannels(channels);
    const notes = detectMonophonicNotesFromAudio(mono, sampleRate, minNoteMs, {
      range,
      frameSize,
      onProgress: (fraction) => self.postMessage({ type: 'progress', fraction }),
    });
    self.postMessage({ type: 'done', notes, bpm: estimateBpmFromDetectedNotes(notes) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
