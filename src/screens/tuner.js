// Tuner: a big needle, the note, and "Tighten"/"Loosen" in words and arrows. Shown only for
// instruments that have tuner presets (pianos are tuned by a technician).
import { app } from '../app/context.js';
import { midiToFrequency, noteNameToMidi, tunerCentsFromTarget } from '../music.js';
import { h, iconEl, setAttr, setText } from '../ui/dom.js';

const IN_TUNE_CENTS = 5;
const SMOOTHING_MS = 110;

function polar(cx, cy, r, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
}

function arcPath(cx, cy, r, from, to) {
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

function gaugeSvg() {
  const ticks = [];
  for (let cents = -50; cents <= 50; cents += 10) {
    const angle = cents * 1.2;
    const [x0, y0] = polar(300, 300, 250, angle);
    const [x1, y1] = polar(300, 300, cents % 50 === 0 ? 220 : 234, angle);
    ticks.push(`<line class="tick" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`);
    if (cents % 25 === 0 || cents === -50 || cents === 50) {
      const [lx, ly] = polar(300, 300, 196, angle);
      ticks.push(`<text class="tick-label" x="${lx}" y="${ly + 6}">${cents > 0 ? '+' : ''}${cents}</text>`);
    }
  }
  return `<svg viewBox="0 0 600 330" role="img" aria-hidden="true">
    <path class="arc" d="${arcPath(300, 300, 250, -60, 60)}"/>
    <path class="zone" d="${arcPath(300, 300, 250, -IN_TUNE_CENTS * 1.2, IN_TUNE_CENTS * 1.2)}"/>
    ${ticks.join('')}
    <line class="needle" x1="300" y1="300" x2="300" y2="70"/>
    <circle cx="300" cy="300" r="14" fill="currentColor"/>
  </svg>`;
}

export const tunerScreen = {
  async mount(container) {
    const instrument = app.instrument();
    const heading = h('h1', {}, 'Tuner');
    if (!instrument.tuner) {
      container.append(h('section', { class: 'tuner' },
        heading,
        h('p', { class: 'muted', style: { fontSize: '20px' } }, `${instrument.name}s don't need tuning here. Pick a fretted instrument in Settings to use the tuner.`),
        h('a', { class: 'btn btn-primary btn-lg', href: '#/library' }, iconEl('library'), 'Back to songs')));
      return null;
    }

    const sets = instrument.tuner.sets;
    let setKey = app.settings.tunerSet && sets[app.settings.tunerSet] ? app.settings.tunerSet : instrument.tuner.defaultSet;
    let selected = 'auto';
    const history = [];

    const setSelect = h('select', { id: 'tuningSet' },
      ...Object.entries(sets).map(([key, set]) => h('option', { value: key, selected: key === setKey }, set.label)));
    const stringChips = h('div', { class: 'chips tuner-strings', role: 'radiogroup', 'aria-label': 'String to tune' });
    const gauge = h('div', { class: 'tuner-gauge', 'data-state': 'none', html: gaugeSvg() });
    const needle = gauge.querySelector('.needle');
    const noteEl = h('div', { class: 'tuner-note', 'aria-hidden': 'true' }, '--');
    const centsEl = h('p', { class: 'muted', style: { fontSize: '20px' } }, 'Play a string');
    const statusIcon = h('span', { class: 'icon', 'aria-hidden': 'true' });
    const statusText = h('span', {}, 'Listening…');
    const status = h('p', { class: 'tuner-status', 'data-state': 'none', role: 'status', 'aria-live': 'polite' }, statusIcon, statusText);
    const banner = h('div', { class: 'banner is-error', role: 'alert', hidden: true });

    container.append(h('section', { class: 'tuner', 'aria-labelledby': 'tunerTitle' },
      heading,
      h('div', { class: 'field', style: { minWidth: 'min(360px, 90vw)' } }, h('label', { for: 'tuningSet' }, `${instrument.name} tuning`), setSelect),
      stringChips,
      banner,
      gauge,
      noteEl,
      status,
      centsEl));
    heading.id = 'tunerTitle';

    function strings() {
      return sets[setKey].notes.map((name) => ({ name, midi: noteNameToMidi(name) }));
    }

    function renderChips() {
      const options = [{ name: 'Auto', id: 'auto' }, ...strings().map((s) => ({ name: s.name.replace(/-?\d+$/, ''), id: s.name, full: s.name }))];
      stringChips.replaceChildren(...options.map((option) => h('button', {
        class: 'chip',
        type: 'button',
        role: 'radio',
        'aria-checked': String(selected === option.id),
        'aria-label': option.id === 'auto' ? 'Auto: detect the string' : `Tune ${option.full}`,
        onclick: () => {
          selected = option.id;
          renderChips();
        },
      }, option.name)));
    }
    setSelect.addEventListener('change', () => {
      setKey = setSelect.value;
      selected = 'auto';
      app.updateSettings({ tunerSet: setKey });
      renderChips();
    });
    renderChips();

    let lastStatus = '';
    function show(frequency) {
      if (!frequency) {
        setAttr(gauge, 'data-state', 'none');
        return;
      }
      const candidates = selected === 'auto' ? strings() : strings().filter((s) => s.name === selected);
      // Nearest string by its real pitch; octave folding only helps when no string is close
      // (e.g. the detector locked onto a harmonic).
      const raw = candidates.map((candidate) => ({
        candidate,
        cents: 1200 * Math.log2(frequency / midiToFrequency(candidate.midi)),
        octaveShift: 0,
      })).sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents));
      let best = raw[0];
      if (Math.abs(best.cents) > 300) {
        candidates.forEach((candidate) => {
          const reading = tunerCentsFromTarget(frequency, midiToFrequency(candidate.midi));
          if (Math.abs(reading.cents) < Math.abs(best.cents)) best = { ...reading, candidate };
        });
      }
      const { cents } = best;
      const shown = Math.max(-50, Math.min(50, cents));
      needle.style.transform = `rotate(${shown * 1.2}deg)`;
      setText(noteEl, best.candidate.name);
      const state = Math.abs(cents) <= IN_TUNE_CENTS ? 'in' : cents > 0 ? 'sharp' : 'flat';
      setAttr(gauge, 'data-state', state === 'in' ? 'in' : 'off');
      setAttr(status, 'data-state', state);
      const message = state === 'in' ? 'In tune' : state === 'sharp' ? 'Too high: loosen the string' : 'Too low: tighten the string';
      const iconName = state === 'in' ? 'check' : state === 'sharp' ? 'down' : 'up';
      if (message !== lastStatus) {
        lastStatus = message;
        setText(statusText, message);
        statusIcon.replaceChildren(iconEl(iconName));
      }
      setText(centsEl, `${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents${Math.abs(cents) > 50 ? ' (far off)' : ''}${best.octaveShift ? ' · heard an octave away' : ''}`);
    }

    const unsubscribe = app.engine.on('analysis', (frame) => {
      if (frame.frequency) history.push({ t: frame.timeMs, f: frame.frequency });
      while (history.length && frame.timeMs - history[0].t > SMOOTHING_MS) history.shift();
      if (!frame.frequency && (!history.length || frame.timeMs - history[history.length - 1].t > 250)) {
        show(null);
        return;
      }
      const sorted = history.map((item) => item.f).sort((a, b) => a - b);
      show(sorted[Math.floor(sorted.length / 2)]);
    });

    try {
      // The tuner always listens through the microphone.
      await app.ensureInput({ instrument, source: 'mic' });
    } catch (error) {
      banner.replaceChildren(iconEl('mic'), h('span', {}, `The tuner needs the microphone (${error.message}).`),
        h('a', { class: 'btn', href: '#/settings' }, 'Input settings'));
      banner.hidden = false;
    }

    return {
      unmount() {
        unsubscribe();
        app.stopInput();
      },
    };
  },
};
