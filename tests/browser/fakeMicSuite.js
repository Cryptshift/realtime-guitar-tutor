// Manual end-to-end check that drives the real app with a synthetic "microphone".
//
// Usage (dev server running, app open in a browser tab), in the devtools console:
//   const { runFakeMicSuite } = await import('/tests/browser/fakeMicSuite.js');
//   await runFakeMicSuite();            // ~70 s; returns a results object
//
// getUserMedia is replaced with a MediaStream rendered by a second AudioContext that
// plays plucked (decaying) or steady tones at scheduled times. Results are also stored on
// window.__fakeMicResults so they can be polled. Pass { rafShim: true } when the tab is
// hidden (hidden tabs pause requestAnimationFrame, which the renderer uses).
//
// Expected (with the default -80 ms latency calibration for this synthetic path):
//   timedOnTime 14/14 hit, timing ~95-100%; timedSustainRepeats 8/14; timedLate300 0/14;
//   stepOnePluck 1/14; stepFourPlucks 4/14; tuner +3c IN TUNE, +20c TOO SHARP,
//   octave +2c IN TUNE (heard an octave up); bpmHalve no jump and ~1.0 piece-s per 2 s;
//   startGuardCalls 1; failure: tracks ended, start re-enabled.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => document.querySelector(selector);

const fake = { calls: 0, ctx: null, stream: null };

export function installFakeMic(plan) {
  navigator.mediaDevices.getUserMedia = async () => {
    fake.calls += 1;
    const ctx = new AudioContext();
    fake.ctx = ctx;
    const dest = ctx.createMediaStreamDestination();
    const t0 = ctx.currentTime + 0.03;
    plan.forEach((pluck, index) => {
      const frequency = pluck.freq || 440 * 2 ** ((pluck.midi - 69) / 12);
      const at = t0 + pluck.at;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(pluck.gain || 0.2, at + 0.005);
      if (!pluck.steady) gain.gain.exponentialRampToValueAtTime(0.002, at + 3);
      const fundamental = ctx.createOscillator();
      fundamental.frequency.value = frequency;
      const overtone = ctx.createOscillator();
      overtone.frequency.value = 2 * frequency;
      const overtoneGain = ctx.createGain();
      overtoneGain.gain.value = 0.5;
      fundamental.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(dest);
      const next = plan[index + 1];
      const stopAt = next ? t0 + next.at : at + (pluck.steady ? 60 : 3.5);
      fundamental.start(at);
      overtone.start(at);
      fundamental.stop(stopAt);
      overtone.stop(stopAt);
    });
    await ctx.resume();
    fake.stream = dest.stream;
    return dest.stream;
  };
  return fake;
}

const setValue = (selector, value, eventName = 'change') => {
  const element = $(selector);
  element.value = value;
  element.dispatchEvent(new Event(eventName));
};

async function run(plan, { song = 'preset:1', mode = 'timed', waitMs, tuner = false }) {
  setValue('#songSelect', song);
  setValue('#modeSelect', mode);
  installFakeMic(plan);
  $(tuner ? '#tunerStartBtn' : '#startBtn').click();
  await sleep(waitMs);
  const result = {
    progress: $('#progressText').textContent,
    timing: $('#timingScore').textContent,
    pitch: $('#pitchScore').textContent,
    tuner: `${$('#tunerCloseness').textContent} | ${$('#tunerCents').textContent}`,
  };
  $(tuner ? '#tunerStopBtn' : '#stopBtn').click();
  fake.ctx?.close();
  await sleep(150);
  return result;
}

const TWINKLE = [
  [60, 0], [60, 0.7], [67, 1.4], [67, 2.1], [69, 2.8], [69, 3.5], [67, 4.2],
  [65, 5.6], [65, 6.3], [64, 7.0], [64, 7.7], [62, 8.4], [62, 9.1], [60, 9.8],
].map(([midi, at]) => ({ midi, at }));

export async function runFakeMicSuite({ rafShim = false, latencyOffsetMs = -80 } = {}) {
  if (rafShim) {
    window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  const results = {};
  window.__fakeMicResults = results;

  setValue('#latencyOffset', String(latencyOffsetMs), 'input');
  results.timedOnTime = await run(TWINKLE, { waitMs: 11900 });
  results.timedSustainRepeats = await run(
    TWINKLE.filter((note, i) => i === 0 || note.midi !== TWINKLE[i - 1].midi),
    { waitMs: 11900 },
  );
  results.timedLate300 = await run(TWINKLE.map((note) => ({ ...note, at: note.at + 0.3 })), { waitMs: 12200 });
  setValue('#latencyOffset', '0', 'input');

  results.stepOnePluck = await run([{ midi: 60, at: 0.2 }], { mode: 'step', waitMs: 3000 });
  results.stepFourPlucks = await run(
    [{ midi: 60, at: 0.2 }, { midi: 60, at: 1.0 }, { midi: 67, at: 2.0 }, { midi: 67, at: 2.8 }],
    { mode: 'step', waitMs: 4000 },
  );

  const E2 = 82.4069;
  for (const [label, frequency] of [
    ['tunerE2+3c', E2 * 2 ** (3 / 1200)],
    ['tunerE2+20c', E2 * 2 ** (20 / 1200)],
    ['tunerE3octave+2c', 2 * E2 * 2 ** (2 / 1200)],
  ]) {
    results[label] = (await run([{ freq: frequency, at: 0, steady: true, gain: 0.1 }], {
      waitMs: 1000,
      tuner: true,
    })).tuner;
  }

  // Halving the BPM mid-play must not move the playhead (Open String Warmup is 9 s long).
  setValue('#songSelect', 'preset:0');
  setValue('#modeSelect', 'timed');
  installFakeMic([{ freq: 100, at: 0, steady: true, gain: 0.00001 }]);
  $('#startBtn').click();
  await sleep(3000);
  const playhead = () => parseFloat($('.fret-playhead').style.left);
  const before = playhead();
  setValue('#bpmSlider', '45', 'input');
  await sleep(50);
  const justAfter = playhead();
  await sleep(2000);
  const later = playhead();
  $('#stopBtn').click();
  fake.ctx?.close();
  setValue('#songSelect', 'preset:0');
  results.bpmHalve = {
    beforePct: before,
    justAfterPct: justAfter,
    pieceSecondsPer2s: Number((((later - justAfter) / 100) * 9).toFixed(2)),
  };
  await sleep(150);

  // A triple click must request the microphone once.
  fake.calls = 0;
  installFakeMic([{ freq: 110, at: 0, steady: true }]);
  $('#startBtn').click();
  $('#startBtn').click();
  $('#tunerStartBtn').click();
  await sleep(600);
  results.startGuardCalls = fake.calls;
  $('#stopBtn').click();
  fake.ctx?.close();
  await sleep(150);

  // A failure after getUserMedia must release the microphone.
  installFakeMic([{ freq: 110, at: 0, steady: true }]);
  const originalResume = AudioContext.prototype.resume;
  const fakeGetUserMedia = navigator.mediaDevices.getUserMedia;
  let failNext = true;
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await fakeGetUserMedia(...args);
    AudioContext.prototype.resume = function resume() {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('simulated failure'));
      }
      return originalResume.call(this);
    };
    return stream;
  };
  $('#startBtn').click();
  await sleep(600);
  AudioContext.prototype.resume = originalResume;
  results.failure = {
    tracks: fake.stream.getTracks().map((track) => track.readyState).join(','),
    status: $('#micStatus').textContent,
    startEnabled: !$('#startBtn').disabled,
  };
  fake.ctx?.close();
  results.done = true;
  return results;
}
