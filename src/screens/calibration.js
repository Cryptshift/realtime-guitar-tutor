// Latency calibration: four clicks; the learner plays any note on each. The median delay
// between each click and the attack the app hears is the input latency to compensate.
import { app } from '../app/context.js';
import { h, iconEl, setText } from '../ui/dom.js';

const CLICKS = 4;
const INTERVAL_MS = 900;
const LEAD_IN_MS = 1400;
const MATCH_WINDOW_MS = 420;

export function measureLatency(clickTimes, onsetTimes) {
  const offsets = [];
  clickTimes.forEach((click) => {
    let best = null;
    onsetTimes.forEach((onset) => {
      const offset = onset - click;
      if (Math.abs(offset) <= MATCH_WINDOW_MS && (best === null || Math.abs(offset) < Math.abs(best))) best = offset;
    });
    if (best !== null) offsets.push(best);
  });
  if (offsets.length < 2) return { latencyMs: null, matched: offsets.length };
  const sorted = [...offsets].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { latencyMs: Math.max(0, Math.min(400, Math.round(median / 5) * 5)), matched: offsets.length };
}

export function createCalibration({ onResult = () => {} } = {}) {
  const beats = Array.from({ length: CLICKS }, (_, i) => h('span', { 'aria-hidden': 'true' }, String(i + 1)));
  const result = h('p', { class: 'status-line', role: 'status', 'aria-live': 'polite' },
    `Current setting: ${app.settings.latencyMs} ms.`);
  const startBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, iconEl('metronome'), 'Start the clicks');
  const element = h('div', { class: 'setup-step' },
    h('p', {}, 'Play any note exactly on each of the 4 clicks. We measure how late your playing reaches the app and correct for it.'),
    h('div', { class: 'calibration-beats' }, ...beats),
    startBtn,
    result);

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    beats.forEach((beat) => beat.classList.remove('is-now', 'is-heard'));
    try {
      await app.ensureInput();
      await app.engine.ensureContext();
    } catch (error) {
      setText(result, `Could not start the input: ${error.message}`);
      startBtn.disabled = false;
      return;
    }
    const onsets = [];
    const offs = [
      app.engine.on('analysis', (frame) => { if (frame.onsetTimeMs !== null) onsets.push(frame.onsetTimeMs); }),
      app.engine.on('noteon', (event) => onsets.push(event.timeMs)),
    ];
    const start = performance.now() + LEAD_IN_MS;
    const clicks = Array.from({ length: CLICKS }, (_, i) => start + i * INTERVAL_MS);
    setText(result, 'Get ready…');
    clicks.forEach((at, i) => {
      app.engine.click(at, { accent: i === 0 });
      setTimeout(() => {
        beats.forEach((beat, j) => beat.classList.toggle('is-now', j === i));
        setText(result, `Click ${i + 1} of ${CLICKS}`);
      }, Math.max(0, at - performance.now()));
    });
    setTimeout(() => {
      offs.forEach((off) => off());
      beats.forEach((beat) => beat.classList.remove('is-now'));
      clicks.forEach((click, i) => {
        if (onsets.some((onset) => Math.abs(onset - click) <= MATCH_WINDOW_MS)) beats[i].classList.add('is-heard');
      });
      const { latencyMs, matched } = measureLatency(clicks, onsets);
      if (latencyMs === null) {
        setText(result, `Only heard ${matched} of ${CLICKS} notes. Try again a little louder, right on the clicks.`);
      } else {
        app.updateSettings({ latencyMs });
        setText(result, `Your setup adds about ${latencyMs} ms. Saved; Play along will correct for it.`);
        onResult(latencyMs);
      }
      startBtn.disabled = false;
      startBtn.lastChild.textContent = 'Try again';
    }, LEAD_IN_MS + (CLICKS - 1) * INTERVAL_MS + 700);
  });

  return element;
}
