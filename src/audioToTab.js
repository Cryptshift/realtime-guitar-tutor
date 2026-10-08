// Offline monophonic transcription of a decoded recording into piece notes.
import { createOnsetDetector } from './dsp/onset.js';
import { FFT_SIZE, computeRms, detectPitch } from './dsp/pitch.js';
import { frequencyToFractionalMidi, midiToNoteName } from './music.js';
import { medianOf } from './util.js';

export function downmixAudioBufferToMono(audioBuffer) {
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

// Max distance (semitones) from the running pitch of a note before a frame is treated as a
// new note. Below 1 so chromatic neighbours split; above 0.5 so mild vibrato doesn't.
export const AUDIO_TAB_SAME_NOTE_SEMITONES = 0.6;

export function detectMonophonicNotesFromAudio(monoData, sampleRate, minNoteMs = 130) {
  if (!monoData?.length) return [];

  const frameSize = Math.min(FFT_SIZE, monoData.length);
  const hopSize = Math.max(256, Math.floor(sampleRate * 0.03));
  const frameSeconds = hopSize / sampleRate;
  const minFrames = Math.max(2, Math.round((Math.max(80, minNoteMs) / 1000) / frameSeconds));
  const frames = [];

  for (let offset = 0; offset + frameSize <= monoData.length; offset += hopSize) {
    const frame = monoData.subarray(offset, offset + frameSize);
    const pitch = detectPitch(frame, sampleRate);
    frames.push({
      time: offset / sampleRate,
      pitch: pitch ? frequencyToFractionalMidi(pitch.frequency) : null,
      rms: computeRms(frame),
    });
  }

  // Energy onsets let a re-plucked note of the same pitch become a separate note.
  const onsetDetector = createOnsetDetector();
  const onsetFrames = frames.map((frame) => (
    onsetDetector.update({ rms: frame.rms, pitchMidi: null, nowMs: frame.time * 1000 }) !== null
  ));

  // Median-of-3 removes single-frame glitches at note boundaries. (The old mean of rounded
  // MIDI values averaged two different notes into a third one, e.g. B3/G3 -> G#3.)
  const smoothed = frames.map((frame, index) => {
    if (frame.pitch === null) return null;
    const before = frames[index - 1]?.pitch;
    const after = frames[index + 1]?.pitch;
    if (before == null || after == null) return frame.pitch;
    return medianOf([before, frame.pitch, after]);
  });

  const rawEvents = [];
  let current = null;
  let lastOnsetFrame = -Infinity;
  const closeCurrent = (endTime) => {
    rawEvents.push({
      midi: Math.round(medianOf(current.pitches)),
      start: current.start,
      end: endTime,
      frames: current.pitches.length,
      onset: current.onset,
    });
    current = null;
  };

  for (let index = 0; index < smoothed.length; index += 1) {
    const pitch = smoothed[index];
    const frameTime = frames[index].time;
    if (onsetFrames[index]) lastOnsetFrame = index;

    if (pitch === null) {
      if (current) {
        current.silenceFrames += 1;
        if (current.silenceFrames >= 2) {
          closeCurrent(frameTime);
        }
      }
      continue;
    }

    if (current) {
      const reference = medianOf(current.pitches.slice(-5));
      const samePitch = Math.abs(pitch - reference) < AUDIO_TAB_SAME_NOTE_SEMITONES;
      const replucked = onsetFrames[index] && current.pitches.length >= 2;
      if (samePitch && !replucked) {
        current.pitches.push(pitch);
        current.silenceFrames = 0;
        continue;
      }
      closeCurrent(frameTime);
    }

    current = {
      pitches: [pitch],
      start: frameTime,
      silenceFrames: 0,
      onset: index - lastOnsetFrame <= 2,
    };
  }

  if (current) {
    closeCurrent(monoData.length / sampleRate);
  }

  const filtered = rawEvents
    .filter((event) => event.frames >= minFrames)
    .map((event) => ({
      midi: event.midi,
      start: Number(event.start.toFixed(3)),
      duration: Number(Math.max(0.1, event.end - event.start).toFixed(3)),
      onset: event.onset,
    }))
    .filter((event) => event.duration * 1000 >= Math.max(80, minNoteMs));

  const merged = [];
  for (const event of filtered) {
    const last = merged[merged.length - 1];
    // Re-join a note split by a brief dropout, but never across a fresh pluck.
    if (last && !event.onset && event.midi === last.midi && event.start <= last.start + last.duration + 0.07) {
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

export function estimateBpmFromDetectedNotes(notes) {
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
