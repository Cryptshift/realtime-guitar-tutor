// Practice screen: one primary action (Start/Pause), the current note in large type, the
// note highway, the instrument view and plain-language feedback. Hands-free: Space starts
// and pauses; in "Wait for me" the first correct note starts the run.
import { app } from '../app/context.js';
import { getInstrument } from '../instruments/index.js';
import { HAND_NAMES, handOf, isTwoHanded, normalizeHands } from '../piece.js';
import { createHighway } from '../practice/highway.js';
import { createPracticeSession } from '../practice/session.js';
import { barSecondsFor, computeSummary, sectionsFor } from '../practice/summary.js';
import { clear, formatDuration, h, iconEl, isTypingTarget, prefersReducedMotion, setAttr, setText } from '../ui/dom.js';

const MODES = [
  { id: 'wait', label: 'Wait for me' },
  { id: 'play', label: 'Play along' },
];

// Piano pieces with both hands.
const HANDS = [
  { id: 'R', label: 'Right' },
  { id: 'L', label: 'Left' },
  { id: 'both', label: 'Both' },
];
const MIC_TWO_HANDS_HINT = 'Two hands work best with a MIDI keyboard';

const SHORTCUTS = [
  ['Space', 'Start / pause'],
  ['R', 'Restart'],
  ['W', 'Switch Wait for me / Play along'],
  ['[  ]', 'Tempo −5% / +5%'],
  ['M', 'Metronome on/off'],
  ['C', 'Count-in on/off'],
  ['L', 'Clear the loop'],
  ['Esc', 'Finish and see your results'],
  ['?', 'Show these shortcuts'],
];

const FEEDBACK_HOLD_MS = 1800;

function describeForSummary(instrument, twoHanded) {
  return (note) => {
    if (instrument.kind === 'fretted' && note.tab) return `${note.note} (string ${note.tab.string}, fret ${note.tab.fret})`;
    if (twoHanded) return `${note.note} (${handOf(note) === 'L' ? 'left' : 'right'} hand)`;
    return note.note;
  };
}

// What to play now, hand by hand: "Left C3 · Right E4" (the keys show the fingers), or
// "Right E4, finger 3" for one hand.
function describeHands(group) {
  const parts = ['L', 'R'].map((hand) => ({ hand, notes: group.filter((note) => handOf(note) === hand) })).filter((part) => part.notes.length);
  return parts.map(({ hand, notes }) => {
    const finger = parts.length === 1 && notes.length === 1 && Number.isInteger(notes[0].finger) && notes[0].finger > 0 ? `, finger ${notes[0].finger}` : '';
    return `${hand === 'L' ? 'Left' : 'Right'} ${notes.map((note) => note.note).join(' ')}${finger}`;
  }).join(' · ');
}

export const practiceScreen = {
  async mount(container, [songId]) {
    const song = app.library.get(songId);
    if (!song) {
      app.toast('That song is not in your library any more.');
      app.go('library');
      return null;
    }
    const instrument = getInstrument(song.instrument);
    const piece = app.library.piece(song);
    const twoHanded = instrument.kind === 'keyboard' && isTwoHanded(piece);
    const settings = app.settings;
    const lastPlayed = app.store.loadProgress().lastPlayed;
    const remembered = lastPlayed?.songId === song.id ? lastPlayed : null;
    const pending = app.pendingPractice?.songId === song.id ? app.pendingPractice : null;
    app.pendingPractice = null;

    let mode = pending?.mode || remembered?.mode || settings.defaultMode || 'wait';
    let tempo = pending?.tempoPercent || remembered?.tempoPercent || settings.defaultTempo || 70;
    let loop = pending?.loop || null;
    let hands = twoHanded ? normalizeHands(pending?.hands || app.store.loadSongPrefs(song.id).hands) : 'both';
    if (twoHanded && pending?.hands) app.store.saveSongPrefs(song.id, { hands });
    let countIn = settings.countIn;
    let metronome = settings.metronome;
    const beatsPerBar = Math.max(1, Math.round(piece.beatsPerBar || 4));
    const barSeconds = barSecondsFor(piece);
    const barCount = Math.max(1, Math.ceil(piece.totalDuration / barSeconds - 1e-9));
    const sectionSize = [1, 2, 4, 8, 16].find((size) => barCount / size <= 8) || 16;
    const sections = sectionsFor(piece, sectionSize);

    // ---------- DOM ----------
    const title = h('h1', {}, song.title);
    const where = h('span', { class: 'where', 'aria-live': 'off' }, '');
    const helpBtn = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts (?)' }, iconEl('help'));
    const top = h('div', { class: 'practice-top' },
      h('a', { class: 'btn btn-ghost', href: '#/library' }, iconEl('chevronLeft'), h('span', {}, 'Library')),
      title,
      where,
      helpBtn);

    const progressFill = h('div', { class: 'fill' });
    const loopRegion = h('div', { class: 'loop-region', hidden: true });
    const playhead = h('div', { class: 'playhead' });
    // "Bar 3" / "Bars 3–4": the word gets its own span so phones can show just the numbers.
    const sectionLabel = (label) => {
      const [, word, numbers] = label.match(/^(Bars?)\s+(.+)$/) || [];
      return word ? [h('span', { class: 'section-word' }, `${word} `), numbers] : [label];
    };
    const sectionButtons = sections.map((section) => h('button', {
      class: 'section',
      type: 'button',
      title: `Loop ${section.label.toLowerCase()}`,
      'aria-label': `Loop ${section.label.toLowerCase()}`,
      onclick: () => {
        if (dragMoved) return;
        const same = loop && Math.abs(loop.start - section.start) < 1e-6 && Math.abs(loop.end - section.end) < 1e-6;
        setLoop(same ? null : { start: section.start, end: section.end });
      },
    }, ...sectionLabel(section.label)));
    const progressBar = h('div', {
      class: 'song-progress',
      role: 'group',
      'aria-label': 'Song sections. Choose one to loop it, or drag across the bar to loop a range.',
    }, progressFill, ...sectionButtons, loopRegion, playhead);

    const modeButtons = MODES.map((option) => h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(option.id === mode),
      onclick: () => setMode(option.id),
    }, option.label));
    const modeControl = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Practice mode' }, ...modeButtons);

    const handButtons = HANDS.map((option) => h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(option.id === hands),
      'aria-label': HAND_NAMES[option.id],
      onclick: () => setHands(option.id),
    }, option.label));
    const handsHint = h('span', { class: 'field-hint hands-hint', hidden: true }, MIC_TWO_HANDS_HINT);
    const handsControl = twoHanded
      ? h('div', { class: 'hands-control' },
        h('span', { class: 'control-label', id: 'handsLabel' }, 'Hands'),
        h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'handsLabel' }, ...handButtons),
        handsHint)
      : null;

    const tempoOutput = h('output', { for: 'tempoRange' }, `${tempo}%`);
    const tempoRange = h('input', {
      id: 'tempoRange',
      type: 'range',
      min: '50',
      max: '120',
      step: '5',
      value: String(tempo),
      'aria-valuetext': `${tempo} percent`,
      oninput: (event) => setTempo(Number(event.target.value)),
    });
    const tempoControl = h('div', { class: 'tempo-control' }, h('label', { for: 'tempoRange' }, 'Tempo'), tempoRange, tempoOutput);

    const countInBox = h('input', { type: 'checkbox', checked: countIn, onchange: (e) => setCountIn(e.target.checked) });
    const metronomeBox = h('input', { type: 'checkbox', checked: metronome, onchange: (e) => setMetronome(e.target.checked) });
    const clearLoopBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => setLoop(null) }, iconEl('loop'), 'Clear loop');

    const backingInput = h('input', { type: 'file', accept: 'audio/*', id: 'backingFile' });
    const backingStatus = h('span', { class: 'field-hint' }, 'Plays from the start of the song, at your tempo.');
    const guideBox = h('input', { type: 'checkbox', checked: settings.guideTone, onchange: (e) => app.updateSettings({ guideTone: e.target.checked }) });
    const otherHandBox = h('input', {
      type: 'checkbox',
      checked: settings.otherHandSound,
      disabled: hands === 'both',
      onchange: (e) => app.updateSettings({ otherHandSound: e.target.checked }),
    });
    const more = h('details', { class: 'more-options' },
      h('summary', { 'aria-label': 'More options: backing track and guide tone' }, iconEl('settings'), 'More'),
      h('div', { class: 'options-body' },
        h('div', { class: 'field' }, h('label', { for: 'backingFile' }, 'Backing track'), backingInput, backingStatus),
        h('label', { class: 'switch' }, guideBox, 'Guide tone in Play along (use headphones)'),
        twoHanded ? h('label', { class: 'switch' }, otherHandBox, 'Play the other hand quietly when practising one hand (Play along)') : null));

    // On phones the controls fold into an "Options" disclosure; on larger screens it stays open.
    const optionsSummary = h('span', { class: 'options-summary' });
    const controls = h('details', { class: 'practice-options', open: true },
      h('summary', {}, iconEl('settings'), h('span', {}, 'Options'), optionsSummary),
      h('div', { class: 'practice-controls' },
        modeControl,
        handsControl,
        tempoControl,
        h('label', { class: 'switch' }, countInBox, 'Count-in'),
        h('label', { class: 'switch' }, metronomeBox, iconEl('metronome'), 'Metronome'),
        clearLoopBtn,
        more));
    const phoneQuery = window.matchMedia('(max-width: 720px)');
    const syncOptions = () => { controls.open = !phoneQuery.matches; };
    syncOptions();
    phoneQuery.addEventListener('change', syncOptions);

    const nowLabel = h('div', { class: 'now-label' }, 'Play');
    const nowNote = h('div', { class: 'now-note', 'aria-hidden': 'true' }, '--');
    const nowPosition = h('div', { class: 'now-position' }, '');
    const feedbackIcon = h('span', { class: 'icon', 'aria-hidden': 'true' });
    const feedbackText = h('span', {}, '');
    const feedback = h('div', { class: 'feedback', 'data-tone': 'idle' }, feedbackIcon, feedbackText);
    const feedbackDetail = h('div', { class: 'feedback-detail' }, '');
    const needle = h('div', { class: 'needle' });
    // A piano can't be played out of tune, so it gets no intonation needle.
    const tuneMeter = h('div', {
      class: 'tune-meter', 'data-state': 'none', role: 'img', 'aria-label': 'Intonation', hidden: instrument.kind === 'keyboard',
    }, h('div', { class: 'scale' }), h('div', { class: 'center' }), needle);
    const streak = h('div', { class: 'streak' });
    // Screen readers get one polite announcement per change instead of per-frame noise.
    const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
    const nowCard = h('section', { class: 'now-card', 'aria-label': 'Current note' },
      nowLabel, nowNote, nowPosition, feedback, feedbackDetail, tuneMeter, streak, announcer);

    const canvas = h('canvas', { role: 'img', 'aria-label': 'Note highway: upcoming notes move toward the line' });
    const countInOverlay = h('div', { class: 'countin', hidden: true, 'aria-hidden': 'true' });
    const startHint = h('div', { class: 'start-hint' }, '');
    const highwayBox = h('div', { class: 'highway' }, canvas, countInOverlay, startHint);
    const stage = h('div', { class: 'stage' }, nowCard, highwayBox);

    const viewCanvas = h('div', { class: 'view-canvas' });
    const viewCaption = h('div', { class: 'instrument-caption' }, '');
    const instrumentBox = h('section', { class: 'instrument-view', 'aria-label': instrument.view.title }, viewCanvas, viewCaption);

    const startIcon = iconEl('play');
    const startLabel = h('span', {}, 'Start');
    const startBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => toggle() },
      startIcon, startLabel, h('kbd', {}, 'Space'));
    const restartBtn = h('button', { class: 'btn footer-secondary', type: 'button', onclick: () => restart() }, iconEl('restart'), 'Restart');
    const finishBtn = h('button', { class: 'btn footer-secondary', type: 'button', onclick: () => finish() }, iconEl('check'), 'Finish');
    const levelDot = h('span', { class: 'level-dot' });
    const inputLabel = h('span', {}, 'Starting input…');
    const footer = h('div', { class: 'practice-footer' },
      h('span', { class: 'input-status' }, levelDot, inputLabel),
      restartBtn, startBtn, finishBtn);

    const banner = h('div', { class: 'banner is-error', role: 'alert', hidden: true });

    const shortcuts = twoHanded
      ? [...SHORTCUTS.slice(0, 3), ['H', 'Switch hands: right, left, both'], ...SHORTCUTS.slice(3)]
      : SHORTCUTS;
    const helpDialog = h('dialog', { 'aria-labelledby': 'shortcutsTitle' },
      h('div', { class: 'dialog-head' }, h('h2', { id: 'shortcutsTitle' }, 'Keyboard shortcuts'),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close', onclick: () => helpDialog.close() }, iconEl('cross'))),
      h('div', { class: 'dialog-body' },
        h('dl', { class: 'shortcut-list' }, ...shortcuts.flatMap(([key, action]) => [h('dt', {}, h('kbd', {}, key)), h('dd', {}, action)]))));
    helpBtn.addEventListener('click', () => helpDialog.showModal());

    const screen = h('section', { class: 'practice', 'aria-labelledby': 'practiceTitle' },
      top, banner, progressBar, controls, stage, instrumentBox, footer, helpDialog);
    title.id = 'practiceTitle';
    container.append(screen);

    // ---------- session & input ----------
    const highway = createHighway(canvas, { piece, instrument });
    let session;
    let lastScheduledBeat = -Infinity;
    let backing = null;
    let rafId = 0;
    let dragMoved = false;
    let lastAnnouncement = '';
    let viewSignature = '';
    let lastLevelMs = 0;
    let finishTimer = 0;
    let inputKind = null;
    // The selected hand(s)' range over the whole piece (the keyboard fits it when it can).
    let pieceRange = null;
    // Quiet other hand (Play along, one hand): the next of its notes to schedule.
    let otherHandNotes = [];
    let otherHandNext = 0;

    function newSession() {
      session = createPracticeSession({
        piece,
        instrument,
        mode,
        tempoPercent: tempo,
        latencyMs: settings.latencyMs,
        countInBeats: countIn ? beatsPerBar : 0,
        requireFullShape: settings.requireFullShape,
        loop,
        hands,
      });
      session.setChordMatcher((group) => app.engine.matchChord(group));
      lastScheduledBeat = -Infinity;
      viewSignature = '';
      const inPlay = piece.notes.filter(session.isActive);
      pieceRange = inPlay.length
        ? { minMidi: Math.min(...inPlay.map((n) => n.midi)), maxMidi: Math.max(...inPlay.map((n) => n.midi)) }
        : null;
      otherHandNotes = twoHanded && hands !== 'both' ? piece.notes.filter((n) => n.playable !== false && !session.isActive(n)) : [];
      otherHandNext = 0;
      if (mode === 'wait') session.start(performance.now());
    }
    newSession();

    function setHands(next) {
      if (!twoHanded || next === hands) return;
      hands = normalizeHands(next);
      app.store.saveSongPrefs(song.id, { hands });
      handButtons.forEach((button, i) => setAttr(button, 'aria-checked', String(HANDS[i].id === hands)));
      otherHandBox.disabled = hands === 'both';
      updateHandsHint();
      stopBacking();
      newSession();
      app.toast(hands === 'both' ? 'Both hands together' : `${HAND_NAMES[hands]} alone. The other hand is shown faintly.`);
    }

    function updateHandsHint() {
      handsHint.hidden = !(twoHanded && hands === 'both' && inputKind === 'mic');
    }

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      modeButtons.forEach((button, i) => setAttr(button, 'aria-checked', String(MODES[i].id === mode)));
      stopBacking();
      newSession();
      app.toast(mode === 'wait' ? 'Wait for me: play each note when you are ready.' : 'Play along: press Space to count in.');
    }

    function setTempo(next) {
      tempo = Math.max(50, Math.min(120, next));
      tempoRange.value = String(tempo);
      setAttr(tempoRange, 'aria-valuetext', `${tempo} percent`);
      setText(tempoOutput, `${tempo}%`);
      session.setTempo(performance.now(), tempo);
      if (backing?.audio) backing.audio.playbackRate = tempo / 100;
      lastScheduledBeat = -Infinity;
    }

    function setCountIn(on) {
      countIn = on;
      countInBox.checked = on;
      app.updateSettings({ countIn: on });
      const wasRunning = session.status === 'running' || session.status === 'countin';
      if (!wasRunning) newSession();
    }

    function setMetronome(on) {
      metronome = on;
      metronomeBox.checked = on;
      app.updateSettings({ metronome: on });
    }

    function setLoop(next) {
      loop = next;
      clearLoopBtn.hidden = !loop;
      stopBacking();
      session.setLoop(performance.now(), loop);
      if (mode === 'wait') session.start(performance.now());
      lastScheduledBeat = -Infinity;
      app.toast(loop ? `Looping ${formatLoop(loop)}` : 'Loop cleared');
    }

    function formatLoop(range) {
      const first = Math.floor(range.start / barSeconds + 1e-6) + 1;
      const last = Math.round(range.end / barSeconds);
      return last > first ? `bars ${first}–${last}` : `bar ${first}`;
    }

    function toggle() {
      app.engine.ensureContext();
      session.toggle(performance.now());
      if (session.status === 'paused') stopBacking({ keepPosition: true });
    }

    function restart() {
      stopBacking();
      session.restart(performance.now());
      if (mode === 'wait') session.start(performance.now());
      lastScheduledBeat = -Infinity;
      app.toast('Restarted');
    }

    function finish() {
      const played = session.results.some((r) => r.hit || r.missed || r.wrongAttempts);
      if (!played) {
        app.go('library');
        return;
      }
      const summary = computeSummary({
        piece,
        results: session.results,
        mode,
        tempoPercent: tempo,
        describeNote: describeForSummary(instrument, twoHanded),
        hands: session.hands,
      });
      const run = {
        accuracy: summary.accuracy,
        timing: summary.timing,
        stars: summary.stars,
        tempoPercent: tempo,
        mode,
        looped: Boolean(loop),
        ...(twoHanded ? { hands } : {}),
      };
      const { isNewBest } = loop ? { isNewBest: false } : app.store.recordRun(song.id, run);
      app.store.setLastPlayed({ songId: song.id, mode, tempoPercent: tempo, ...(twoHanded ? { hands } : {}) });
      app.lastRun = {
        songId: song.id, summary, mode, tempoPercent: tempo, isNewBest, loop, bestStreak: session.bestStreak, hands: twoHanded ? hands : null,
      };
      app.go('summary');
    }

    // ---------- progress-bar drag to loop ----------
    let dragStart = null;
    progressBar.addEventListener('pointerdown', (event) => {
      dragStart = event.clientX;
      dragMoved = false;
    });
    progressBar.addEventListener('pointermove', (event) => {
      if (dragStart === null) return;
      if (Math.abs(event.clientX - dragStart) > 8) {
        dragMoved = true;
        progressBar.setPointerCapture?.(event.pointerId);
        const range = rangeFromPixels(dragStart, event.clientX);
        showLoopRegion(range);
      }
    });
    progressBar.addEventListener('pointerup', (event) => {
      if (dragStart !== null && dragMoved) {
        setLoop(rangeFromPixels(dragStart, event.clientX));
        setTimeout(() => { dragMoved = false; }, 0);
      }
      dragStart = null;
    });
    progressBar.addEventListener('pointercancel', () => { dragStart = null; dragMoved = false; });

    function rangeFromPixels(x0, x1) {
      const rect = progressBar.getBoundingClientRect();
      const toSeconds = (x) => Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * piece.totalDuration;
      const a = Math.min(toSeconds(x0), toSeconds(x1));
      const b = Math.max(toSeconds(x0), toSeconds(x1));
      const start = Math.floor(a / barSeconds) * barSeconds;
      const end = Math.min(barCount * barSeconds, Math.max(start + barSeconds, Math.ceil(b / barSeconds) * barSeconds));
      return { start, end };
    }

    function showLoopRegion(range) {
      if (!range) {
        loopRegion.hidden = true;
        return;
      }
      loopRegion.hidden = false;
      loopRegion.style.left = `${(range.start / piece.totalDuration) * 100}%`;
      loopRegion.style.width = `${(Math.min(range.end, piece.totalDuration) - range.start) / piece.totalDuration * 100}%`;
    }

    // ---------- backing track ----------
    backingInput.addEventListener('change', () => {
      const file = backingInput.files?.[0];
      stopBacking();
      if (backing?.url) URL.revokeObjectURL(backing.url);
      backing = null;
      if (!file) return;
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.preservesPitch = true;
      audio.volume = (settings.backingVolume ?? 80) / 100;
      backing = { url, audio };
      setText(backingStatus, `${file.name}: plays with Play along.`);
    });

    function startBacking(position) {
      if (!backing?.audio || mode !== 'play') return;
      backing.audio.playbackRate = tempo / 100;
      backing.audio.currentTime = Math.max(0, position);
      backing.audio.play().catch(() => setText(backingStatus, 'The browser blocked playback; press Start again.'));
    }

    function stopBacking() {
      backing?.audio?.pause();
    }

    // ---------- input ----------
    const unsubscribe = [
      app.engine.on('analysis', (frame) => session.onPitch({ timeMs: frame.timeMs, midi: frame.midi, onsetTimeMs: frame.onsetTimeMs })),
      app.engine.on('noteon', (event) => session.onNoteOn(event)),
      app.engine.on('noteoff', (event) => session.onNoteOff(event)),
      app.engine.on('level', (event) => {
        lastLevelMs = event.rms > 0.004 ? performance.now() : lastLevelMs;
      }),
    ];

    async function startInput() {
      banner.hidden = true;
      try {
        const info = await app.ensureInput({ instrument });
        inputKind = info.kind;
        updateHandsHint();
        setText(inputLabel, info.kind === 'midi' ? `Listening: ${info.label}` : 'Listening: microphone');
      } catch (error) {
        setText(inputLabel, 'No input');
        clear(banner);
        banner.append(
          iconEl('mic'),
          h('span', {}, settings.inputSource === 'midi'
            ? `Could not open the MIDI keyboard (${error.message}).`
            : `The app needs your microphone to hear you play (${error.message}).`),
          h('button', { class: 'btn', type: 'button', onclick: startInput }, 'Try again'),
          h('a', { class: 'btn btn-ghost', href: '#/settings' }, 'Input settings'));
        banner.hidden = false;
      }
    }
    await startInput();

    // ---------- keyboard ----------
    function onKey(event) {
      if (event.defaultPrevented || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (helpDialog.open && event.key !== '?') return;
      const key = event.key;
      if (event.code === 'Space') {
        event.preventDefault();
        toggle();
      } else if (key === 'r' || key === 'R') {
        restart();
      } else if (key === 'w' || key === 'W') {
        setMode(mode === 'wait' ? 'play' : 'wait');
      } else if ((key === 'h' || key === 'H') && twoHanded) {
        setHands({ both: 'R', R: 'L', L: 'both' }[hands]);
      } else if (key === '[') {
        setTempo(tempo - 5);
      } else if (key === ']') {
        setTempo(tempo + 5);
      } else if (key === 'm' || key === 'M') {
        setMetronome(!metronome);
        app.toast(metronome ? 'Metronome on' : 'Metronome off');
      } else if (key === 'c' || key === 'C') {
        setCountIn(!countIn);
        app.toast(countIn ? 'Count-in on' : 'Count-in off');
      } else if (key === 'l' || key === 'L') {
        if (loop) setLoop(null);
      } else if (key === 'Escape') {
        if (!helpDialog.open) finish();
      } else if (key === '?') {
        if (helpDialog.open) helpDialog.close();
        else helpDialog.showModal();
      }
    }
    document.addEventListener('keydown', onKey);

    const resizeObserver = new ResizeObserver(() => {
      highway.resize();
      viewSignature = '';
    });
    resizeObserver.observe(highwayBox);
    resizeObserver.observe(viewCanvas);
    const themeObserver = new MutationObserver(() => {
      highway.refreshTheme();
      viewSignature = '';
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ---------- frame loop ----------
    const reducedMotion = prefersReducedMotion();

    function scheduleClicks(now, view) {
      if (mode !== 'play' || !app.engine.context) return;
      const counting = view.status === 'countin';
      if (!counting && !(view.status === 'running' && metronome)) return;
      const beat = session.beatSeconds;
      const horizonMs = now + 150;
      let next = Math.max(lastScheduledBeat + 1, Math.ceil((view.position - 0.02) / beat));
      for (; ; next += 1) {
        const atMs = session.timeToMs(next * beat);
        if (atMs > horizonMs) break;
        if (atMs >= now - 30 && (counting || next * beat >= 0)) {
          const isCountIn = next * beat < (loop ? loop.start : 0);
          if (isCountIn || metronome) {
            app.engine.click(atMs, { accent: ((next % beatsPerBar) + beatsPerBar) % beatsPerBar === 0 });
          }
        }
        lastScheduledBeat = next;
      }
    }

    // Practising one hand in Play along: the other hand can sound quietly (off by default).
    function scheduleOtherHand(now, view) {
      if (!otherHandNotes.length || !settings.otherHandSound || mode !== 'play' || view.status !== 'running' || !app.engine.context) return;
      const horizonMs = now + 150;
      while (otherHandNext < otherHandNotes.length) {
        const note = otherHandNotes[otherHandNext];
        const atMs = session.timeToMs(note.start);
        if (atMs > horizonMs) break;
        if (atMs >= now - 30 && (!loop || (note.start >= loop.start && note.start < loop.end))) {
          app.engine.tone(note.freq, atMs, (note.duration / (tempo / 100)) * 1000, settings.guideToneVolume / 100);
        }
        otherHandNext += 1;
      }
    }

    function rewindOtherHand(position) {
      otherHandNext = otherHandNotes.findIndex((note) => note.start >= position - 0.02);
      if (otherHandNext < 0) otherHandNext = otherHandNotes.length;
    }

    function renderFeedback(view, now) {
      const fb = view.feedback;
      const fresh = fb.text && now - fb.atMs < FEEDBACK_HOLD_MS;
      let tone = 'idle';
      let text = '';
      let iconName = null;
      let detail = '';
      if (view.status === 'finished') {
        tone = 'hit';
        text = 'Finished';
        iconName = 'check';
      } else if (fresh) {
        ({ tone } = fb);
        ({ text } = fb);
        // Every tone has a shape: check (correct), tilde (close), cross or arrow (off).
        iconName = fb.icon || (tone === 'close' ? 'tilde' : tone === 'off' ? 'cross' : null);
        detail = fb.detail || '';
      } else if (view.status === 'ready' && mode === 'wait') {
        text = 'Play the first note to begin';
      } else if (view.target) {
        text = mode === 'wait' ? 'Your turn' : '';
      }
      setAttr(feedback, 'data-tone', tone);
      setText(feedbackText, text);
      if (feedbackIcon.dataset.icon !== (iconName || '')) {
        feedbackIcon.dataset.icon = iconName || '';
        feedbackIcon.replaceChildren(...(iconName ? [iconEl(iconName)] : []));
        feedbackIcon.hidden = !iconName;
      }
      setText(feedbackDetail, detail);
      if (fresh && fb.text !== lastAnnouncement && (tone === 'hit' || tone === 'off')) {
        lastAnnouncement = fb.text;
        setText(announcer, `${fb.text}${detail ? `, ${detail}` : ''}`);
      }
    }

    function render(view, now) {
      const bar = Math.min(barCount, Math.floor(Math.max(0, view.position) / barSeconds + 1e-6) + 1);
      setText(where, `Bar ${bar} of ${barCount} · ${formatDuration(Math.max(0, view.position) / (tempo / 100))}`);
      const fraction = Math.max(0, Math.min(1, view.position / piece.totalDuration));
      progressFill.style.width = `${fraction * 100}%`;
      playhead.style.left = `${fraction * 100}%`;
      if (dragStart === null) showLoopRegion(view.loop);

      // Count-in and start hints.
      countInOverlay.hidden = !(view.status === 'countin' && view.countInBeat > 0);
      setText(countInOverlay, String(view.countInBeat));
      let hint = '';
      if (view.status === 'ready') hint = mode === 'wait' ? 'Play the first note to begin' : 'Press Space or Start to count in';
      if (view.status === 'ready' && !handsHint.hidden) hint = `${hint}. ${MIC_TWO_HANDS_HINT}.`;
      else if (view.status === 'paused') hint = 'Paused · press Space to continue';
      else if (view.status === 'finished') hint = 'Finished. Your results are next';
      startHint.hidden = !hint;
      setText(startHint, hint);

      // One badge per setting: badges wrap cleanly, where " · " separators left dots dangling.
      const summaryItems = [mode === 'wait' ? 'Wait for me' : 'Play along', `${tempo}%`, ...(twoHanded ? [HAND_NAMES[hands]] : [])];
      const summaryKey = summaryItems.join('|');
      if (optionsSummary.dataset.key !== summaryKey) {
        optionsSummary.dataset.key = summaryKey;
        optionsSummary.replaceChildren(...summaryItems.map((item) => h('span', { class: 'badge' }, item)));
      }

      // Primary button.
      const running = view.status === 'running' || view.status === 'countin' || (mode === 'wait' && view.status === 'ready');
      const label = running ? 'Pause' : view.status === 'paused' ? 'Resume' : view.status === 'finished' ? 'Play again' : 'Start';
      if (startLabel.textContent !== label) {
        startLabel.textContent = label;
        startIcon.replaceChildren(iconEl(running ? 'pause' : 'play'));
      }

      // Current note.
      const group = view.current;
      const target = view.target;
      if (group.length > 1) {
        setText(nowLabel, twoHanded && new Set(group.map(handOf)).size > 1 ? 'Both hands together' : 'Play together');
        // Two-handed chords read bottom-up, like the keyboard.
        const ordered = twoHanded ? [...group].sort((a, b) => a.midi - b.midi) : group;
        setText(nowNote, ordered.map((n) => n.note.replace(/-?\d+$/, '')).join(' '));
      } else {
        setText(nowLabel, view.status === 'finished' ? 'Well done' : mode === 'wait' || view.status === 'running' ? 'Play' : 'First note');
        setText(nowNote, target ? target.note : '--');
      }
      const position = target ? (twoHanded ? describeHands(group.length ? group : [target]) : instrument.positionText(target)) : '';
      setAttr(nowCard, 'aria-label', target ? `Current note ${target.note}. ${position}` : 'Current note');
      setAttr(nowCard, 'data-mode', mode);
      setText(nowPosition, position);

      // Intonation needle (±50 cents).
      if (Number.isFinite(view.cents) && view.status !== 'finished') {
        setAttr(tuneMeter, 'data-state', Math.abs(view.cents) < 15 ? 'in' : 'off');
        needle.style.left = `${50 + Math.max(-50, Math.min(50, view.cents))}%`;
        setAttr(tuneMeter, 'aria-label', `Intonation ${Math.round(view.cents)} cents`);
      } else {
        setAttr(tuneMeter, 'data-state', 'none');
      }

      if (view.streak >= 3) {
        if (!streak.firstChild) streak.append(h('span', {}, ''));
        setText(streak.lastChild, `${view.streak} in a row`);
      } else if (streak.firstChild) {
        streak.replaceChildren();
      }

      renderFeedback(view, now);
      highway.draw(view, now, { reducedMotion });

      // Instrument view (re-rendered only when what it shows changes).
      const signature = [
        group.map((n) => `${n.index}${view.results[n.index]?.hit ? 'h' : ''}`).join(','),
        view.upcoming.map((n) => n.index).join(','),
        settings.leftHanded,
        settings.showKeyLabels,
        hands,
      ].join('|');
      if (signature !== viewSignature) {
        viewSignature = signature;
        // The notes coming up in the next two bars (the keyboard keeps them in view).
        const from = group[0]?.start ?? view.position;
        const focus = piece.notes.filter((n) => session.isActive(n) && n.start >= from - 0.01 && n.start <= from + barSeconds * 2);
        const texts = instrument.renderInstrumentView(viewCanvas, {
          current: group.length ? { note: group[0], group } : null,
          upcoming: view.upcoming.length ? { note: view.upcoming[0], group: view.upcoming } : null,
          leftHanded: settings.leftHanded,
          showLabels: settings.showKeyLabels,
          pieceRange,
          twoHanded,
          focus,
          widthPx: viewCanvas.clientWidth,
        });
        setText(viewCaption, texts?.next && texts.next !== '--' ? `Next: ${texts.next}` : '');
      }

      levelDot.classList.toggle('is-live', now - lastLevelMs < 200);
    }

    function frame() {
      const now = performance.now();
      session.tick(now);
      for (const event of session.takeEvents()) {
        if (event.type === 'started') {
          startBacking(loop ? loop.start : 0);
          rewindOtherHand(session.view(now).position);
        }
        if (event.type === 'loop') {
          lastScheduledBeat = -Infinity;
          if (backing?.audio && loop) backing.audio.currentTime = loop.start;
          rewindOtherHand(loop ? loop.start : 0);
        }
        if (event.type === 'finished') {
          stopBacking();
          // Hands-free: show the results shortly after the last note.
          finishTimer = setTimeout(finish, 1400);
        }
      }
      const view = session.view(now);
      scheduleClicks(now, view);
      scheduleOtherHand(now, view);
      if (settings.guideTone && mode === 'play' && view.status === 'running' && view.target) {
        app.engine.setGuideTone(view.target.freq, settings.guideToneVolume / 100);
      } else {
        app.engine.setGuideTone(null);
      }
      render(view, now);
      rafId = requestAnimationFrame(frame);
    }
    if (loop) {
      clearLoopBtn.hidden = false;
    }
    frame();

    return {
      unmount() {
        cancelAnimationFrame(rafId);
        clearTimeout(finishTimer);
        unsubscribe.forEach((fn) => fn());
        document.removeEventListener('keydown', onKey);
        resizeObserver.disconnect();
        phoneQuery.removeEventListener('change', syncOptions);
        themeObserver.disconnect();
        app.engine.setGuideTone(null);
        stopBacking();
        if (backing?.url) URL.revokeObjectURL(backing.url);
        app.stopInput();
      },
    };
  },
};
