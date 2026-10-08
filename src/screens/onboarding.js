// First-run setup: instrument, input permission (with the reason), a level check, an
// optional latency calibration, and a nudge to tune. Re-runnable from Settings.
import { app } from '../app/context.js';
import { listInstruments } from '../instruments/index.js';
import { midiToNoteName } from '../music.js';
import { h, iconEl, setText } from '../ui/dom.js';
import { INSTRUMENT_ICONS } from '../ui/icons.js';
import { createCalibration } from './calibration.js';

export const onboardingScreen = {
  mount(container) {
    const steps = ['instrument', 'input', 'level', 'latency', 'tune'];
    let index = 0;
    let heard = false;
    let cleanup = [];

    const heading = h('h1', {}, 'Set up');
    const dots = h('div', { class: 'setup-dots', 'aria-hidden': 'true' }, ...steps.map(() => h('span')));
    const stepLabel = h('p', { class: 'muted', style: { textAlign: 'center' } });
    const body = h('div');
    const back = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go(index - 1) }, iconEl('chevronLeft'), 'Back');
    const skip = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go(index + 1) }, 'Skip');
    const next = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => go(index + 1) }, 'Next');
    container.append(h('section', { class: 'setup', 'aria-labelledby': 'setupTitle' },
      heading, dots, stepLabel, body, h('div', { class: 'setup-nav' }, back, h('div', { class: 'chips' }, skip, next))));
    heading.id = 'setupTitle';

    function done() {
      app.updateSettings({ onboarded: true });
      app.go(app.instrument().tuner && steps[index] === 'tune' ? 'tuner' : 'library');
    }

    function go(target) {
      cleanup.forEach((fn) => fn());
      cleanup = [];
      if (target >= steps.length) {
        app.updateSettings({ onboarded: true });
        app.go('library');
        return;
      }
      index = Math.max(0, target);
      // Pianos skip the tuning step.
      if (steps[index] === 'tune' && !app.instrument().tuner) {
        app.updateSettings({ onboarded: true });
        app.go('library');
        return;
      }
      [...dots.children].forEach((dot, i) => dot.classList.toggle('is-done', i <= index));
      setText(stepLabel, `Step ${index + 1} of ${steps.length}`);
      back.hidden = index === 0;
      skip.hidden = steps[index] === 'instrument';
      next.disabled = false;
      next.lastChild.textContent = 'Next';
      body.replaceChildren(renderStep(steps[index]));
      body.querySelector('h2')?.focus?.();
    }

    function renderStep(step) {
      if (step === 'instrument') {
        const picks = h('div', { class: 'instrument-picks', role: 'radiogroup', 'aria-label': 'Instrument' });
        const renderPicks = () => picks.replaceChildren(...listInstruments().map((instrument) => h('button', {
          class: 'instrument-pick',
          type: 'button',
          role: 'radio',
          'aria-checked': String(app.settings.instrument === instrument.id),
          onclick: () => {
            app.updateSettings({ instrument: instrument.id });
            renderPicks();
          },
        }, iconEl(INSTRUMENT_ICONS[instrument.id]), h('strong', {}, instrument.name), h('span', { class: 'muted' }, instrument.description))));
        renderPicks();
        return h('div', { class: 'setup-step' }, h('h2', { tabindex: '-1' }, 'What are you learning?'), picks);
      }

      if (step === 'input') {
        const status = h('p', { class: 'status-line', role: 'status', 'aria-live': 'polite' });
        next.disabled = !app.inputInfo;
        const connect = async (source) => {
          setText(status, source === 'midi' ? 'Connecting to MIDI…' : 'Asking for the microphone…');
          status.classList.remove('is-error');
          try {
            app.updateSettings({ inputSource: source });
            app.stopInput();
            const info = await app.ensureInput({ source });
            setText(status, info.kind === 'midi' ? `Connected: ${info.label || 'MIDI'}` : 'Microphone ready.');
            next.disabled = false;
            go(index + 1);
          } catch (error) {
            setText(status, `That didn't work: ${error.message}. You can allow it in the browser's address bar and try again.`);
            status.classList.add('is-error');
          }
        };
        return h('div', { class: 'setup-step' },
          h('h2', { tabindex: '-1' }, 'Let the app hear you'),
          h('p', {}, 'We listen to your playing to check each note. Audio is analysed on this device and never leaves it.'),
          h('div', { class: 'chips', style: { justifyContent: 'center' } },
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => connect('mic') }, iconEl('mic'), 'Allow microphone'),
            app.engine.isMidiSupported()
              ? h('button', { class: 'btn btn-lg', type: 'button', onclick: () => connect('midi') }, iconEl('midi'), 'Use a MIDI keyboard')
              : null),
          status);
      }

      if (step === 'level') {
        const level = h('span');
        const note = h('div', { class: 'heard-note', 'aria-live': 'polite' }, '--');
        const status = h('p', { class: 'status-line' }, 'Play any note…');
        next.disabled = !heard;
        const show = (midi) => {
          setText(note, midiToNoteName(Math.round(midi)));
          if (!heard) {
            heard = true;
            next.disabled = false;
            setText(status, 'Heard it. Your input works.');
          }
        };
        cleanup.push(
          app.engine.on('level', (event) => { level.style.width = `${Math.min(100, (event.rms / 0.06) * 100)}%`; }),
          app.engine.on('analysis', (frame) => { if (frame.midi) show(frame.midi); }),
          app.engine.on('noteon', (event) => show(event.midi)),
        );
        app.ensureInput().catch((error) => setText(status, `No input yet: ${error.message}. Go back to connect one.`));
        return h('div', { class: 'setup-step' },
          h('h2', { tabindex: '-1' }, 'Play any note'),
          h('p', {}, 'Check that the app hears you. The note you play appears below.'),
          h('div', { class: 'level-bar', role: 'img', 'aria-label': 'Input level' }, level),
          note,
          status);
      }

      if (step === 'latency') {
        next.lastChild.textContent = 'Next';
        return h('div', { class: 'setup-step' },
          h('h2', { tabindex: '-1' }, 'Line up the timing (optional)'),
          createCalibration({ onResult: () => {} }));
      }

      // tune
      next.lastChild.textContent = 'Finish';
      return h('div', { class: 'setup-step' },
        h('h2', { tabindex: '-1' }, 'Tune up before you play'),
        h('p', {}, `A ${app.instrument().name.toLowerCase()} that is in tune makes every note easier to score.`),
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: done }, iconEl('tuner'), 'Open the tuner'));
    }

    go(0);
    return {
      unmount() {
        cleanup.forEach((fn) => fn());
        app.stopInput();
      },
    };
  },
};
