// Manual latency / main-thread measurements with the synthetic microphone.
//
//   const m = await import('/tests/browser/measure.js');
//   await m.measureLatency();      // sound -> app shows "Note start" / the detected note
//   await m.measureMainThread();   // main-thread ms per second while listening
//
// Latency is measured from the scheduled pluck time (mapped from the fake AudioContext
// clock to performance.now()) to the first moment a 1 ms poller sees the DOM change, so
// it includes the MediaStream hop of the synthetic path. Compare runs, not absolutes.
// Pass { rafShim: true } in a hidden tab (hidden tabs pause requestAnimationFrame).

import { installFakeMic } from './fakeMicSuite.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => document.querySelector(selector);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const stats = { raf: 0, rafCount: 0, msg: 0, msgCount: 0 };
// Last worker analysis results seen on the main thread (worklet/worker pipeline only).
const workerEvents = { onsetAt: null, pitchAt: null, targetHz: null };

function installRafShim() {
  window.requestAnimationFrame = (callback) => setTimeout(() => {
    const started = performance.now();
    callback(started);
    stats.raf += performance.now() - started;
    stats.rafCount += 1;
  }, 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}

function timeMessageHandlers() {
  if (window.__messageTimingInstalled) return;
  window.__messageTimingInstalled = true;
  const wrap = (listener) => function timedListener(event) {
    const started = performance.now();
    const data = event.data;
    if (data?.type === 'analysis') {
      if (workerEvents.onsetAt === null && data.onsetTime !== null) workerEvents.onsetAt = started;
      if (
        workerEvents.pitchAt === null && data.frequency && workerEvents.targetHz
        && Math.abs(1200 * Math.log2(data.frequency / workerEvents.targetHz)) < 50
      ) {
        workerEvents.pitchAt = started;
      }
    }
    try {
      return listener.call(this, event);
    } finally {
      stats.msg += performance.now() - started;
      stats.msgCount += 1;
    }
  };
  for (const proto of [Worker.prototype, MessagePort.prototype]) {
    const add = proto.addEventListener;
    proto.addEventListener = function addEventListener(type, listener, options) {
      return add.call(this, type, type === 'message' && typeof listener === 'function' ? wrap(listener) : listener, options);
    };
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage');
    Object.defineProperty(proto, 'onmessage', {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(fn) { descriptor.set.call(this, typeof fn === 'function' ? wrap(fn) : fn); },
    });
  }
}

export async function measureLatency({ trials = 8, rafShim = false, midi = 57 } = {}) {
  if (rafShim) installRafShim();
  timeMessageHandlers();
  const handlerOnset = [];
  const handlerPitch = [];
  const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
  const onsetLatencies = [];
  const pitchLatencies = [];
  $('#modeSelect').value = 'step';
  $('#modeSelect').dispatchEvent(new Event('change'));
  for (let trial = 0; trial < trials; trial += 1) {
    const fake = installFakeMic([{ midi, at: 0.6 + (trial % 4) * 0.0041 }]);
    // Clear the previous trial's reading so only a fresh detection counts.
    $('#detectedNote').textContent = '--';
    $('#detectedFreq').textContent = '';
    $('#micStatus').textContent = '';
    $('#startBtn').click();
    // Wait until the fake context exists, then map the pluck time to performance.now().
    while (!fake.ctx || fake.ctx.state !== 'running') await sleep(1);
    const contextNow = fake.ctx.currentTime;
    const perfNow = performance.now();
    const pluckAt = fake.pluckTimes[0];
    const pluckPerfTime = perfNow + (pluckAt - contextNow) * 1000;
    Object.assign(workerEvents, { onsetAt: null, pitchAt: null, targetHz: 440 * 2 ** ((midi - 69) / 12) });
    let onsetSeen = null;
    let pitchSeen = null;
    const deadline = performance.now() + 2500;
    while (performance.now() < deadline && (onsetSeen === null || pitchSeen === null)) {
      if (onsetSeen === null && $('#micStatus').textContent === 'Note start') onsetSeen = performance.now();
      if (
        pitchSeen === null
        && $('#detectedNote').textContent === noteName
        && !$('#detectedFreq').textContent.includes('(last)')
      ) {
        pitchSeen = performance.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (onsetSeen !== null) onsetLatencies.push(onsetSeen - pluckPerfTime);
    if (pitchSeen !== null) pitchLatencies.push(pitchSeen - pluckPerfTime);
    if (workerEvents.onsetAt !== null) handlerOnset.push(workerEvents.onsetAt - pluckPerfTime);
    if (workerEvents.pitchAt !== null) handlerPitch.push(workerEvents.pitchAt - pluckPerfTime);
    $('#stopBtn').click();
    fake.ctx?.close();
    await sleep(200);
  }
  return {
    trials,
    onsetMedianMs: Number(median(onsetLatencies)?.toFixed(1)),
    pitchMedianMs: Number(median(pitchLatencies)?.toFixed(1)),
    // When the main thread first receives the result (before rendering); worker path only.
    onsetReceivedMedianMs: handlerOnset.length ? Number(median(handlerOnset).toFixed(1)) : null,
    pitchReceivedMedianMs: handlerPitch.length ? Number(median(handlerPitch).toFixed(1)) : null,
    onsetMs: onsetLatencies.map((v) => Math.round(v)),
    pitchMs: pitchLatencies.map((v) => Math.round(v)),
  };
}

export async function measureMainThread({ seconds = 6, rafShim = false } = {}) {
  if (rafShim) installRafShim();
  timeMessageHandlers();
  $('#songSelect').value = 'preset:1';
  $('#songSelect').dispatchEvent(new Event('change'));
  $('#modeSelect').value = 'timed';
  $('#modeSelect').dispatchEvent(new Event('change'));
  const plucks = Array.from({ length: Math.ceil(seconds / 0.35) }, (_, i) => ({ midi: 60 + (i % 5), at: 0.2 + i * 0.35 }));
  const fake = installFakeMic(plucks);
  $('#startBtn').click();
  await sleep(500);
  Object.assign(stats, { raf: 0, rafCount: 0, msg: 0, msgCount: 0 });
  const started = performance.now();
  await sleep(seconds * 1000);
  const elapsed = (performance.now() - started) / 1000;
  const snapshot = { ...stats };
  $('#stopBtn').click();
  fake.ctx?.close();
  return {
    seconds: Number(elapsed.toFixed(2)),
    mainThreadMsPerSecond: Number(((snapshot.raf + snapshot.msg) / elapsed).toFixed(2)),
    frameCallbacksPerSecond: Number((snapshot.rafCount / elapsed).toFixed(1)),
    frameMsEach: Number((snapshot.raf / Math.max(1, snapshot.rafCount)).toFixed(3)),
    messagesPerSecond: Number((snapshot.msgCount / elapsed).toFixed(1)),
    messageMsEach: Number((snapshot.msg / Math.max(1, snapshot.msgCount)).toFixed(3)),
  };
}
