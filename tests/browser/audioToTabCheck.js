// Manual check that "Generate From Audio" keeps the page responsive.
//
//   const { checkAudioToTab } = await import('/tests/browser/audioToTabCheck.js');
//   await checkAudioToTab({ seconds: 180 });               // full run
//   await checkAudioToTab({ seconds: 180, cancelAfterMs: 800 });
//
// Renders a synthetic plucked melody with an OfflineAudioContext, encodes it as a WAV
// File, feeds it to the file input and clicks Generate. A 5 ms interval timer records the
// longest main-thread stall while the job runs. `blockingBaselineMs` times the same
// analysis run directly on the main thread (what the app did before the worker).

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function renderMelody(seconds, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * sampleRate), sampleRate);
  const scale = [40, 45, 50, 55, 59, 64, 59, 55, 52, 57];
  for (let i = 0, t = 0.1; t < seconds - 0.5; i += 1, t += 0.5) {
    const frequency = 440 * 2 ** ((scale[i % scale.length] - 69) / 12);
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.48);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.49);
  }
  return ctx.startRendering();
}

function encodeWav(audioBuffer) {
  const samples = audioBuffer.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  }
  return new File([buffer], 'synthetic-melody.wav', { type: 'audio/wav' });
}

export async function checkAudioToTab({ seconds = 180, cancelAfterMs = null, baseline = true } = {}) {
  const audioBuffer = await renderMelody(seconds);
  const file = encodeWav(audioBuffer);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  $('#audioTabInput').files = transfer.files;

  let blockingBaselineMs = null;
  if (baseline) {
    const { detectMonophonicNotesFromAudio } = await import('/src/audioToTab.js');
    const started = performance.now();
    detectMonophonicNotesFromAudio(audioBuffer.getChannelData(0), audioBuffer.sampleRate, 130);
    blockingBaselineMs = Math.round(performance.now() - started);
    await sleep(100);
  }

  let last = performance.now();
  let maxGapMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maxGapMs = Math.max(maxGapMs, now - last);
    last = now;
  }, 5);
  const progressSeen = new Set();
  const progressTimer = setInterval(() => {
    if (!$('#audioTabProgress').hidden) progressSeen.add(Math.round($('#audioTabProgress').value));
  }, 50);

  const started = performance.now();
  $('#generateAudioTabBtn').click();
  if (cancelAfterMs !== null) {
    await sleep(cancelAfterMs);
    $('#cancelAudioTabBtn').click();
  }
  while ($('#generateAudioTabBtn').disabled && performance.now() - started < 120000) {
    await sleep(20);
  }
  const elapsedMs = Math.round(performance.now() - started);
  clearInterval(timer);
  clearInterval(progressTimer);
  return {
    seconds,
    elapsedMs,
    blockingBaselineMs,
    maxMainThreadGapMs: Math.round(maxGapMs),
    progressValues: [...progressSeen].sort((a, b) => a - b),
    status: $('#audioTabStatus').textContent,
    cancelVisibleAfter: !$('#cancelAudioTabBtn').hidden,
  };
}
