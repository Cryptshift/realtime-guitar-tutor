// Browser end-to-end checks for the redesigned app, driven with a synthetic microphone
// and a mock Web MIDI keyboard. Needs the dev server (it uses the window.__rtApp hook).
//
//   const e2e = await import('/tests/browser/e2e.js');
//   await e2e.onboarding();           // first run: instrument, mic, level check, finish
//   await e2e.guitarRun();            // Mary Had a Little Lamb, Wait for me, fake mic
//   await e2e.guitarPlayAlong();      // Twinkle, Play along at 100 %, fake mic
//   await e2e.pianoRun();             // Ode to Joy, Wait for me, mock MIDI, one wrong note
//   await e2e.pianoPlayAlong();       // Twinkle (piano), Play along, mock MIDI
//
// Each returns what the page showed. In a hidden tab pass { rafShim: true }: hidden tabs
// pause requestAnimationFrame, which the practice screen renders with.
import { createMockMidiAccess } from '../helpers/mockMidi.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => document.querySelector(selector);
const app = () => window.__rtApp;
const text = (selector) => $(selector)?.textContent.trim() ?? null;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteToMidi(name) {
  const match = name.match(/^([A-G]#?)(-?\d)$/);
  return NAMES.indexOf(match[1]) + (Number(match[2]) + 1) * 12;
}

export function shimAnimationFrames() {
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}

async function waitFor(check, { timeout = 8000, interval = 25 } = {}) {
  const started = performance.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (performance.now() - started > timeout) throw new Error(`Timed out waiting for ${check}`);
    await sleep(interval);
  }
}

// ---- synthetic microphone: plucked tones rendered by a second AudioContext -------------
const fakeMic = { ctx: null, startedAt: 0 };

export function installFakeMic() {
  navigator.mediaDevices.getUserMedia = async () => {
    fakeMic.ctx?.close();
    const ctx = new AudioContext();
    fakeMic.ctx = ctx;
    fakeMic.dest = ctx.createMediaStreamDestination();
    await ctx.resume();
    return fakeMic.dest.stream;
  };
}

// Schedules plucks: [{ midi, at (s from now), gain?, length? }]. Each pluck stops at the next.
export function playOnFakeMic(plan) {
  const { ctx, dest } = fakeMic;
  if (!ctx) throw new Error('Fake microphone not started');
  const t0 = ctx.currentTime + 0.05;
  plan.forEach((pluck, i) => {
    const frequency = 440 * 2 ** ((pluck.midi - 69) / 12);
    const at = t0 + pluck.at;
    const end = plan[i + 1] ? t0 + plan[i + 1].at : at + (pluck.length || 2.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, 0);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(pluck.gain || 0.2, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.004, at + 2.5);
    const fundamental = ctx.createOscillator();
    fundamental.frequency.value = frequency;
    const overtone = ctx.createOscillator();
    overtone.frequency.value = frequency * 2;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.5;
    fundamental.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(dest);
    fundamental.start(at);
    overtone.start(at);
    fundamental.stop(end);
    overtone.stop(end);
  });
  return t0;
}

// ---- mock MIDI keyboard ---------------------------------------------------------------------
const midi = { access: null };

export function installMockMidi() {
  midi.access = createMockMidiAccess(['Mock Keyboard 61']);
  navigator.requestMIDIAccess = async () => midi.access;
  return midi.access;
}

export function pressKey(note, holdMs = 200) {
  const number = typeof note === 'number' ? note : noteToMidi(note);
  midi.access.send(0, [0x90, number, 90]);
  setTimeout(() => midi.access.send(0, [0x80, number, 0]), holdMs);
}

// ---- helpers ------------------------------------------------------------------------------
function resetApp(patch) {
  app().updateSettings({ onboarded: true, latencyMs: 0, countIn: false, metronome: false, ...patch });
}

async function openSong(id) {
  app().go(`practice/${encodeURIComponent(id)}`);
  await waitFor(() => $('.practice') && text('.input-status')?.startsWith('Listening'));
}

function songNotes(id) {
  return app().library.get(id).piece.notes;
}

async function finishAndReadSummary(timeout = 40000) {
  await waitFor(() => location.hash === '#/summary', { timeout });
  await waitFor(() => $('.big-number'));
  return {
    headline: text('.score-hero h1'),
    accuracy: text('.big-number'),
    detail: [...document.querySelectorAll('.score-hero .muted')].map((e) => e.textContent).join(' | '),
    stats: [...document.querySelectorAll('.stat')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()),
    next: text('[aria-label="Suggested next step"] p'),
    tricky: [...document.querySelectorAll('.tricky-list li')].map((li) => li.textContent.trim()),
    actions: [...document.querySelectorAll('.summary-actions .btn')].map((b) => b.textContent.trim()),
  };
}

// ---- flows --------------------------------------------------------------------------------------
export async function onboarding({ rafShim = false } = {}) {
  if (rafShim) shimAnimationFrames();
  installFakeMic();
  app().updateSettings({ onboarded: false, instrument: 'piano', inputSource: 'mic' });
  app().go('setup');
  await waitFor(() => text('.setup-step h2') === 'What are you learning?');
  const result = { steps: [] };
  [...document.querySelectorAll('.instrument-pick')].find((b) => b.textContent.includes('Guitar')).click();
  result.instrument = app().settings.instrument;
  [...document.querySelectorAll('.setup-nav .btn')].find((b) => b.textContent.includes('Next')).click();
  result.steps.push(text('.setup-step h2'));
  [...document.querySelectorAll('.setup-step .btn')].find((b) => b.textContent.includes('Allow microphone')).click();
  await waitFor(() => text('.setup-step h2') === 'Play any note');
  result.steps.push(text('.setup-step h2'));
  playOnFakeMic([{ midi: noteToMidi('A3'), at: 0.2 }]);
  result.heard = await waitFor(() => (text('.heard-note') !== '--' ? text('.heard-note') : null));
  result.levelStatus = text('.setup-step .status-line');
  [...document.querySelectorAll('.setup-nav .btn')].find((b) => b.textContent.includes('Next')).click();
  result.steps.push(text('.setup-step h2'));
  [...document.querySelectorAll('.setup-nav .btn')].find((b) => b.textContent.includes('Skip')).click();
  result.steps.push(text('.setup-step h2'));
  [...document.querySelectorAll('.setup-nav .btn')].find((b) => b.textContent.includes('Finish')).click();
  await waitFor(() => location.hash === '#/library');
  result.endedOn = location.hash;
  result.onboarded = app().settings.onboarded;
  return result;
}

export async function guitarRun({ rafShim = false, songId = 'guitar-mary' } = {}) {
  if (rafShim) shimAnimationFrames();
  installFakeMic();
  resetApp({ instrument: 'guitar', inputSource: 'mic' });
  app().store.setLastPlayed(null);
  await openSong(songId);
  const result = { start: { label: text('.now-label'), note: text('.now-note'), position: text('.now-position'), hint: text('.start-hint') } };
  // Play every note, one per 0.75 s, ignoring the song's rhythm: Wait for me waits.
  const notes = songNotes(songId);
  playOnFakeMic(notes.map((note, i) => ({ midi: noteToMidi(note.note), at: 0.3 + i * 0.75 })));
  await sleep(1300);
  result.midRun = {
    note: text('.now-note'),
    feedback: text('.feedback'),
    fretboard: $('.view-canvas svg')?.getAttribute('aria-label'),
    highwayLanes: true,
    where: text('.practice-top .where'),
  };
  result.summary = await finishAndReadSummary();
  return result;
}

export async function guitarPlayAlong({ rafShim = false, songId = 'guitar-twinkle', latencyMs = 80 } = {}) {
  if (rafShim) shimAnimationFrames();
  installFakeMic();
  resetApp({ instrument: 'guitar', inputSource: 'mic', latencyMs });
  app().store.setLastPlayed(null);
  app().pendingPractice = { songId, mode: 'play', tempoPercent: 100 };
  await openSong(songId);
  const song = app().library.get(songId);
  const beat = 60 / song.piece.bpm;
  $('.practice-footer .btn-primary').click();
  const startedAt = performance.now();
  const notes = songNotes(songId);
  // The synthetic path adds ~70-80 ms; the latency setting compensates for it.
  playOnFakeMic(notes.map((note) => ({ midi: noteToMidi(note.note), at: note.start })));
  await sleep(1500);
  const mid = { feedback: text('.feedback'), detail: text('.feedback-detail'), streak: text('.streak') };
  const total = notes.at(-1).start + beat * 2;
  await sleep(Math.max(0, total * 1000 - (performance.now() - startedAt)));
  return { mid, summary: await finishAndReadSummary() };
}

export async function pianoRun({ rafShim = false, songId = 'piano-ode' } = {}) {
  if (rafShim) shimAnimationFrames();
  installMockMidi();
  resetApp({ instrument: 'piano', inputSource: 'midi' });
  app().store.setLastPlayed(null);
  await openSong(songId);
  const result = {
    input: text('.input-status'),
    start: { note: text('.now-note'), position: text('.now-position'), keyboard: $('.view-canvas svg')?.getAttribute('aria-label') },
  };
  const notes = songNotes(songId);
  for (let i = 0; i < notes.length; i += 1) {
    if (i === 3) {
      // A wrong key first: expect a plain-language hint and a slip on that note.
      pressKey(noteToMidi(notes[i].note) + 2, 120);
      await sleep(200);
      result.wrongHint = text('.feedback');
      await sleep(100);
    }
    pressKey(notes[i].note, 120);
    await sleep(180);
    if (i === 4) result.midRun = { note: text('.now-note'), feedback: text('.feedback'), streak: text('.streak') };
  }
  result.summary = await finishAndReadSummary();
  return result;
}

export async function pianoPlayAlong({ rafShim = false, songId = 'piano-twinkle' } = {}) {
  if (rafShim) shimAnimationFrames();
  installMockMidi();
  resetApp({ instrument: 'piano', inputSource: 'midi', countIn: true });
  app().store.setLastPlayed(null);
  app().pendingPractice = { songId, mode: 'play', tempoPercent: 100 };
  await openSong(songId);
  const song = app().library.get(songId);
  const beat = 60 / song.piece.bpm;
  $('.practice-footer .btn-primary').click();
  const countIn = await waitFor(() => (!$('.countin').hidden ? text('.countin') : null));
  const startMs = performance.now() + 4 * beat * 1000;
  const notes = songNotes(songId);
  // Press every note on time except the 5th (left out) and the 9th (60 ms late).
  notes.forEach((note, i) => {
    if (i === 4) return;
    const at = startMs + note.start * 1000 + (i === 8 ? 60 : 0);
    setTimeout(() => pressKey(note.note, 150), Math.max(0, at - performance.now()));
  });
  await sleep(startMs - performance.now() + notes.at(-1).start * 1000 + 1600);
  return { countIn, summary: await finishAndReadSummary() };
}
