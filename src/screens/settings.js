// Settings: instrument, input, latency, sound, display, practice defaults, advanced, setup.
import { app } from '../app/context.js';
import { listInstruments } from '../instruments/index.js';
import { h, iconEl, setText } from '../ui/dom.js';
import { createCalibration } from './calibration.js';

let uid = 0;

function toggle(label, key, hint = null) {
  const id = `set-${key}-${(uid += 1)}`;
  const box = h('input', { type: 'checkbox', id, checked: Boolean(app.settings[key]), onchange: (e) => app.updateSettings({ [key]: e.target.checked }) });
  return h('div', { class: 'field' },
    h('label', { class: 'switch', for: id }, box, label),
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

function slider(label, key, { min, max, step, unit, hint = null }) {
  const id = `set-${key}-${(uid += 1)}`;
  const output = h('output', { for: id }, `${app.settings[key]}${unit}`);
  const input = h('input', {
    type: 'range', id, min: String(min), max: String(max), step: String(step), value: String(app.settings[key]),
    oninput: (e) => {
      const value = Number(e.target.value);
      app.updateSettings({ [key]: value });
      setText(output, `${value}${unit}`);
    },
  });
  const field = h('div', { class: 'field' },
    h('label', { for: id }, label, ' ', output),
    input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
  field.refresh = () => {
    input.value = String(app.settings[key]);
    setText(output, `${app.settings[key]}${unit}`);
  };
  return field;
}

function radioGroup(legend, key, options) {
  const name = `set-${key}-${(uid += 1)}`;
  return h('div', { class: 'field', role: 'radiogroup', 'aria-label': legend },
    h('span', { class: 'label', style: { fontWeight: 600 } }, legend),
    h('div', { class: 'chips' }, ...options.map((option) => h('label', { class: 'switch' },
      h('input', {
        type: 'radio',
        name,
        value: option.value,
        checked: app.settings[key] === option.value,
        disabled: option.disabled,
        onchange: () => app.updateSettings({ [key]: option.value }),
      }),
      option.label))));
}

export const settingsScreen = {
  async mount(container) {
    const heading = h('h1', {}, 'Settings');
    const midiSupported = app.engine.isMidiSupported();

    // Instrument.
    const instrumentSelect = h('select', { id: 'settingsInstrument' },
      ...listInstruments().map((instrument) => h('option', { value: instrument.id, selected: instrument.id === app.settings.instrument }, instrument.name)));
    instrumentSelect.addEventListener('change', () => app.updateSettings({ instrument: instrumentSelect.value }));

    // Input.
    const micSelect = h('select', { id: 'micDevice' }, h('option', { value: '' }, 'Default microphone'));
    const midiSelect = h('select', { id: 'midiDevice', disabled: !midiSupported }, h('option', { value: '' }, 'All MIDI devices'));
    micSelect.addEventListener('change', () => app.updateSettings({ micDeviceId: micSelect.value || null }));
    midiSelect.addEventListener('change', () => app.updateSettings({ midiDeviceId: midiSelect.value || null }));
    app.engine.listDevices().then(({ mic, midi }) => {
      mic.forEach((device) => micSelect.append(h('option', { value: device.id, selected: device.id === app.settings.micDeviceId }, device.name)));
      midi.forEach((device) => midiSelect.append(h('option', { value: device.id, selected: device.id === app.settings.midiDeviceId }, device.name)));
      if (midiSupported && !midi.length) midiSelect.append(h('option', { disabled: true }, 'No MIDI devices found; plug one in and reopen Settings'));
    });

    // Latency.
    const latency = slider('Input latency', 'latencyMs', {
      min: -50, max: 400, step: 5, unit: ' ms', hint: 'How late your playing reaches the app. Calibrate to measure it.',
    });
    const calibrationDialog = h('dialog', { 'aria-labelledby': 'calibrateTitle' },
      h('div', { class: 'dialog-head' }, h('h2', { id: 'calibrateTitle' }, 'Calibrate latency'),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close', onclick: () => calibrationDialog.close() }, iconEl('cross'))),
      h('div', { class: 'dialog-body' }, createCalibration({ onResult: () => latency.refresh() })));
    calibrationDialog.addEventListener('close', () => latency.refresh());

    const theme = radioGroup('Theme', 'theme', [
      { value: 'system', label: 'Match my device' },
      { value: 'light', label: 'Paper (light)' },
      { value: 'dark', label: 'Stage (dark)' },
    ]);

    const sections = [
      h('fieldset', {}, h('legend', {}, 'Instrument'),
        h('div', { class: 'field' }, h('label', { for: 'settingsInstrument' }, 'I am learning'), instrumentSelect,
          h('span', { class: 'field-hint' }, 'Sets the library filter, the instrument view and the tuner.'))),
      h('fieldset', {}, h('legend', {}, 'Input'),
        radioGroup('Listen with', 'inputSource', [
          { value: 'mic', label: 'Microphone' },
          { value: 'midi', label: midiSupported ? 'MIDI keyboard or controller' : 'MIDI (not supported in this browser)', disabled: !midiSupported },
        ]),
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', { for: 'micDevice' }, 'Microphone'), micSelect),
          h('div', { class: 'field' }, h('label', { for: 'midiDevice' }, 'MIDI device'), midiSelect))),
      h('fieldset', {}, h('legend', {}, 'Timing'),
        latency,
        h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => calibrationDialog.showModal() }, iconEl('metronome'), 'Calibrate with 4 clicks'))),
      h('fieldset', {}, h('legend', {}, 'Sound'),
        h('p', { class: 'banner' }, iconEl('info'), h('span', {}, 'Use headphones for the guide tone and backing tracks so the microphone hears only your instrument.')),
        toggle('Guide tone (plays the target note in Play along)', 'guideTone'),
        h('div', { class: 'row' },
          slider('Guide tone volume', 'guideToneVolume', { min: 0, max: 100, step: 5, unit: '%' }),
          slider('Backing track volume', 'backingVolume', { min: 0, max: 100, step: 5, unit: '%' }))),
      h('fieldset', {}, h('legend', {}, 'Display'),
        theme,
        toggle('Left-handed fretboard', 'leftHanded', 'Mirrors the fretboard so the nut is on the right.'),
        toggle('Show key names on the piano', 'showKeyLabels', 'C keys are always labelled.')),
      h('fieldset', {}, h('legend', {}, 'Practice'),
        radioGroup('Start new songs in', 'defaultMode', [{ value: 'wait', label: 'Wait for me' }, { value: 'play', label: 'Play along' }]),
        slider('Starting tempo for new songs', 'defaultTempo', { min: 50, max: 120, step: 5, unit: '%' }),
        toggle('Count-in before Play along', 'countIn'),
        toggle('Metronome while playing along', 'metronome')),
      h('fieldset', {}, h('legend', {}, 'Advanced'),
        toggle('Simplify chords into single notes when importing tabs', 'simplifyChords'),
        toggle('Chords: wait until the whole shape is played', 'requireFullShape',
          'With a MIDI keyboard every key is checked; with a microphone the chord is matched approximately.')),
      h('fieldset', {}, h('legend', {}, 'Setup'),
        h('p', { class: 'muted' }, 'Run the first-time setup again: instrument, input check, latency and tuning.'),
        h('div', {}, h('a', { class: 'btn', href: '#/setup' }, iconEl('restart'), 'Re-run setup'))),
    ];

    container.append(h('section', { class: 'settings', 'aria-labelledby': 'settingsTitle' }, heading, ...sections, calibrationDialog));
    heading.id = 'settingsTitle';
    return {
      unmount() {
        if (calibrationDialog.open) calibrationDialog.close();
        app.stopInput();
      },
    };
  },
};
