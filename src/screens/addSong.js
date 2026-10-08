// "Add a song" dialog: every import path in one place (tab link, pasted tab, MIDI file,
// a recording, or piece JSON under Advanced).
import { app } from '../app/context.js';
import { fetchTabPage, guessPieceNameFromUrl } from '../import/fetch.js';
import { startAudioToTab } from '../import/audioToTabJob.js';
import { defaultMidiTrack, midiTrackToPiece, parseMidiFile } from '../import/midiFile.js';
import { getInstrument, listInstruments } from '../instruments/index.js';
import { parseCustomPieceInput } from '../piece.js';
import { h, iconEl, setText } from '../ui/dom.js';

const TABS = [
  { id: 'link', label: 'Tab link', icon: 'link' },
  { id: 'paste', label: 'Paste tab', icon: 'text' },
  { id: 'midi', label: 'MIDI file', icon: 'file' },
  { id: 'audio', label: 'From a recording', icon: 'wave' },
  { id: 'json', label: 'Advanced (JSON)', icon: 'code' },
];

let uid = 0;
const nextId = (name) => `add-${name}-${(uid += 1)}`;

function field(labelText, control, hint = null) {
  const id = control.id || nextId('field');
  control.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, labelText),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function openAddSongDialog({ onAdded = () => {}, initialTab = 'link' } = {}) {
  let instrumentId = app.settings.instrument;
  let audioJob = null;

  const status = h('p', { class: 'status-line', role: 'status', 'aria-live': 'polite' });
  const setStatus = (message, isError = false) => {
    setText(status, message);
    status.classList.toggle('is-error', isError);
  };

  const instrumentSelect = h('select', {},
    ...listInstruments().map((instrument) => h('option', { value: instrument.id, selected: instrument.id === instrumentId }, instrument.name)));
  const titleInput = h('input', { type: 'text', placeholder: 'Leave empty to use the file or page name', autocomplete: 'off' });
  const simplifyBox = h('input', { type: 'checkbox', checked: app.settings.simplifyChords });

  const tabButtons = [];
  const panels = {};

  // --- Tab link
  const urlInput = h('input', { type: 'url', placeholder: 'https://tabs.ultimate-guitar.com/…', autocomplete: 'off' });
  const msInput = h('input', { type: 'number', min: '40', max: '500', step: '5', value: '120' });
  panels.link = [
    field('Tab page address', urlInput, 'Ultimate Guitar and most pages with plain-text tab work.'),
    field('Milliseconds per tab column', msInput, 'Used when the page has no tempo. Lower is faster.'),
    h('p', { class: 'field-hint' }, iconEl('info'), ' The address is fetched through public CORS proxies (allorigins.win, r.jina.ai), so they see the URL. Nothing else is sent.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => importLink() }, iconEl('link'), 'Import tab'),
  ];

  // --- Paste tab
  const pasteArea = h('textarea', { rows: '10', placeholder: 'e|-----0-----|\nB|---1-------|\nG|-0---------|\nD|-----------|\nA|-----------|\nE|-----------|' });
  panels.paste = [
    field('Tab text', pasteArea, 'Paste one or more tab systems (one line per string).'),
    field('Milliseconds per tab column', h('input', { type: 'number', min: '40', max: '500', step: '5', value: '120', 'data-role': 'pasteMs' })),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => importPaste() }, iconEl('text'), 'Convert tab'),
  ];

  // --- MIDI file
  const midiInput = h('input', { type: 'file', accept: '.mid,.midi,audio/midi,audio/x-midi' });
  const trackSelect = h('select', { disabled: true }, h('option', {}, 'Choose a file first'));
  const quantizeSelect = h('select', {},
    h('option', { value: '' }, 'No quantising'),
    h('option', { value: '1/16', selected: true }, 'Snap to 1/16 notes'),
    h('option', { value: '1/8' }, 'Snap to 1/8 notes'),
    h('option', { value: '1/4' }, 'Snap to 1/4 notes'));
  let parsedMidi = null;
  midiInput.addEventListener('change', async () => {
    const file = midiInput.files?.[0];
    parsedMidi = null;
    trackSelect.disabled = true;
    if (!file) return;
    try {
      parsedMidi = parseMidiFile(new Uint8Array(await file.arrayBuffer()));
      const usable = parsedMidi.tracks.filter((track) => track.notes.length);
      trackSelect.replaceChildren(...usable.map((track) => h('option', {
        value: String(track.index),
        selected: track.index === defaultMidiTrack(parsedMidi),
      }, `${track.name || `Track ${track.index + 1}`}${track.isDrums ? ' (drums)' : ''} · ${track.notes.length} notes`)));
      trackSelect.disabled = !usable.length;
      if (!titleInput.value) titleInput.value = file.name.replace(/\.midi?$/i, '');
      setStatus(`${usable.length} track${usable.length === 1 ? '' : 's'} with notes · ${parsedMidi.bpm} BPM`);
    } catch (error) {
      setStatus(`That file could not be read: ${error.message}`, true);
    }
  });
  panels.midi = [
    field('MIDI file (.mid)', midiInput),
    field('Track', trackSelect, 'Pick the melody; drum tracks are marked.'),
    field('Timing', quantizeSelect),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => importMidi() }, iconEl('file'), 'Import MIDI'),
  ];

  // --- Recording
  const audioInput = h('input', { type: 'file', accept: 'audio/*' });
  const minNote = h('input', { type: 'number', min: '80', max: '800', step: '10', value: '130' });
  const audioProgress = h('progress', { max: '100', value: '0', hidden: true, 'aria-label': 'Analysis progress' });
  const audioGo = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => importAudio() }, iconEl('wave'), 'Find the notes');
  const audioCancel = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => audioJob?.cancel() }, iconEl('cross'), 'Cancel');
  panels.audio = [
    field('Recording', audioInput, 'A clean recording of one instrument playing single notes works best.'),
    field('Shortest note (ms)', minNote),
    audioProgress,
    h('div', { class: 'chips' }, audioGo, audioCancel),
  ];

  // --- JSON
  const jsonArea = h('textarea', { rows: '10', placeholder: '[{"note":"E4","start":0,"duration":0.5}]' });
  panels.json = [
    field('Piece JSON', jsonArea, 'An array of { note, start, duration } (seconds), or { name, bpm, notes }. Optional per note: tab {string, fret}, finger, hand.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => importJson() }, iconEl('code'), 'Load JSON'),
  ];

  const panelEls = {};
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'How to add the song' });
  TABS.forEach((tab, i) => {
    const button = h('button', {
      type: 'button',
      role: 'tab',
      id: `addtab-${tab.id}`,
      'aria-controls': `addpanel-${tab.id}`,
      'aria-selected': String(tab.id === initialTab),
      tabindex: tab.id === initialTab ? '0' : '-1',
      onclick: () => selectTab(tab.id),
      onkeydown: (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = TABS[(i + step + TABS.length) % TABS.length];
        selectTab(next.id);
        tabButtons.find((b) => b.id === `addtab-${next.id}`).focus();
      },
    }, iconEl(tab.icon), tab.label);
    tabButtons.push(button);
    tablist.append(button);
    panelEls[tab.id] = h('div', {
      class: 'tab-panel',
      role: 'tabpanel',
      id: `addpanel-${tab.id}`,
      'aria-labelledby': `addtab-${tab.id}`,
      hidden: tab.id !== initialTab,
    }, ...panels[tab.id]);
  });

  const fretNote = h('p', { class: 'banner', hidden: true }, iconEl('info'), h('span', {}, ''));
  function updateInstrumentNotes() {
    const instrument = getInstrument(instrumentId);
    const hasTabs = Boolean(instrument.importers?.page);
    fretNote.hidden = hasTabs;
    setText(fretNote.lastChild, `Tab import is for fretted instruments. For ${instrument.name.toLowerCase()}, use a MIDI file, a recording or JSON.`);
    ['link', 'paste'].forEach((id) => {
      panelEls[id].querySelectorAll('button, input, textarea').forEach((el) => { el.disabled = !hasTabs; });
    });
  }
  instrumentSelect.addEventListener('change', () => {
    instrumentId = instrumentSelect.value;
    updateInstrumentNotes();
  });

  function selectTab(id) {
    tabButtons.forEach((button) => {
      const selected = button.id === `addtab-${id}`;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    Object.entries(panelEls).forEach(([key, panel]) => { panel.hidden = key !== id; });
    setStatus('');
  }

  const dialog = h('dialog', { 'aria-labelledby': 'addSongTitle' },
    h('div', { class: 'dialog-head' },
      h('h2', { id: 'addSongTitle' }, 'Add a song'),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, iconEl('cross'))),
    h('div', { class: 'dialog-body' },
      h('div', { class: 'form-row' }, field('Instrument', instrumentSelect), field('Title', titleInput)),
      h('label', { class: 'switch' }, simplifyBox, 'Simplify chords into single notes (recommended for beginners)'),
      tablist,
      fretNote,
      ...Object.values(panelEls),
      status));
  dialog.addEventListener('close', () => {
    audioJob?.cancel();
    dialog.remove();
  });
  document.body.append(dialog);
  updateInstrumentNotes();
  dialog.showModal();

  // ---------- importers ----------
  function finish(rawPiece, source, fallbackTitle) {
    const instrument = getInstrument(instrumentId);
    const title = titleInput.value.trim() || rawPiece.name || fallbackTitle || 'New song';
    const song = app.library.add({ title, instrument: instrument.id, piece: rawPiece, source });
    const piece = app.library.piece(song);
    const unplayable = piece.notes.length - piece.playableCount;
    app.toast(`Added “${song.title}” (${piece.notes.length} notes${unplayable ? `, ${unplayable} out of range` : ''})`);
    dialog.close();
    onAdded(song);
    app.go(`practice/${encodeURIComponent(song.id)}`);
  }

  async function run(button, task) {
    const buttons = dialog.querySelectorAll('.tab-panel .btn-primary');
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await task();
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus(error.message || String(error), true);
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
      updateInstrumentNotes();
    }
  }

  function importLink() {
    return run(null, async () => {
      const instrument = getInstrument(instrumentId);
      const url = urlInput.value.trim();
      if (!url) throw new Error('Paste the address of a tab page first.');
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error('That does not look like a web address.');
      }
      setStatus('Fetching the page…');
      const { htmlOrText, via } = await fetchTabPage(parsedUrl.toString());
      setStatus('Converting the tab…');
      const imported = instrument.importers.page.parse(htmlOrText, {
        pieceName: guessPieceNameFromUrl(parsedUrl.toString()),
        msPerColumn: Number(msInput.value) || 120,
        simplifyToSingleNotes: simplifyBox.checked,
      });
      setStatus(`Imported via ${via}. ${imported.details.join(' · ')}`);
      finish(imported.piece, 'tab-link');
    });
  }

  function importPaste() {
    return run(null, async () => {
      const instrument = getInstrument(instrumentId);
      const text = pasteArea.value;
      if (!instrument.importers.text.canParse(text)) {
        throw new Error(`Paste at least one complete tab system (${instrument.strings.length} lines, one per string).`);
      }
      const ms = Number(dialog.querySelector('[data-role="pasteMs"]').value) || 120;
      const piece = instrument.importers.text.parse(text, { msPerColumn: ms, simplifyToSingleNotes: simplifyBox.checked });
      finish(piece, 'pasted-tab', 'Pasted tab');
    });
  }

  function importMidi() {
    return run(null, async () => {
      if (!parsedMidi) throw new Error('Choose a MIDI file first.');
      const piece = midiTrackToPiece(parsedMidi, {
        trackIndex: Number(trackSelect.value),
        quantize: quantizeSelect.value || null,
        instrument: instrumentId,
      });
      finish(piece, 'midi', 'MIDI import');
    });
  }

  function importAudio() {
    return run(null, async () => {
      const file = audioInput.files?.[0];
      if (!file) throw new Error('Choose a recording first.');
      const instrument = getInstrument(instrumentId);
      audioProgress.hidden = false;
      audioCancel.hidden = false;
      setStatus('Listening to the recording… you can keep using the app.');
      audioJob = startAudioToTab(file, {
        minNoteMs: Number(minNote.value) || 130,
        detector: instrument.detector,
        onProgress: (fraction) => { audioProgress.value = Math.round(fraction * 100); },
      });
      try {
        const piece = await audioJob.promise;
        finish(piece, 'recording');
      } catch (error) {
        if (error?.name === 'AbortError') setStatus('Cancelled.');
        throw error;
      } finally {
        audioJob = null;
        audioProgress.hidden = true;
        audioCancel.hidden = true;
      }
    });
  }

  function importJson() {
    return run(null, async () => {
      const piece = parseCustomPieceInput(jsonArea.value, { simplifyToSingleNotes: simplifyBox.checked }, getInstrument(instrumentId));
      finish(piece, 'json', 'Custom piece');
    });
  }

  return dialog;
}
