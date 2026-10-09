// One practice run, independent of the DOM and of audio: feed it input events (pitch
// frames from the microphone pipeline, or MIDI note on/off) and a clock, and it decides
// targets, hits, misses, timing, streaks and plain-language feedback.
//
// Modes:
//   'wait' ("Wait for me")  - no clock; each note (or chord shape) waits until it is played
//                             with a fresh attack. The first correct note starts the run.
//   'play' ("Play along")   - the piece runs on a tempo-scaled clock; a note counts when the
//                             right pitch starts within its onset window of note.start.
//
// Hands (piano): `hands` is 'R', 'L' or 'both'. Only the selected hand's notes are required
// and scored; the other hand's notes stay in the piece (the screen shows them dimmed) and
// playing them is never counted as a mistake. With 'both', notes that start together in
// either hand form one chord step (Wait for me) and share one onset window (Play along).
//
// All times are performance.now() milliseconds. Input times are shifted back by
// `latencyMs` (how late the input arrives) before they are compared with the piece.
import { createPieceClock } from '../clock.js';
import {
  CHORD_GROUP_EPSILON_SECONDS, chordGroupBoundsAtIndex, handOf, inHands, isTwoHanded, normalizeHands, onsetWindowsFor,
} from '../piece.js';

export const HIT_CENTS = 35;
export const WAIT_HOLD_MS = 220;
export const PLAY_HOLD_MS = 140;
export const WRONG_NOTE_STABLE_MS = 70;
const PITCH_DROPOUT_MS = 90;
// Play along: how far from an attack the other (unscored) hand's notes are recognised.
const TIMED_OTHER_HAND_SLACK = 0.25;
const MAX_ONSETS = 32;
const PRAISE = ['Correct', 'Good', 'That’s it'];

export function timingScoreForMs(msAbs) {
  if (msAbs >= 260) return 0;
  return Math.max(0, 1 - msAbs / 260);
}

export function formatTimingOffset(timingMs) {
  if (!Number.isFinite(timingMs)) return '';
  if (Math.abs(timingMs) < 25) return 'On time';
  return `${Math.round(Math.abs(timingMs))} ms ${timingMs < 0 ? 'early' : 'late'}`;
}

export function createPracticeSession({
  piece,
  instrument,
  mode = 'wait',
  tempoPercent = 100,
  latencyMs = 0,
  countInBeats = 4,
  requireFullShape = true,
  loop = null,
  hands = 'both',
}) {
  const notes = piece.notes;
  const twoHanded = isTwoHanded(piece);
  const selectedHands = twoHanded ? normalizeHands(hands) : 'both';
  const playable = (note) => note && note.playable !== false;
  // Required and scored in this run: playable and in the selected hand(s).
  const active = (note) => playable(note) && inHands(note, selectedHands);
  const beatSeconds = 60 / (piece.bpm || 100);

  // One hand alone gets onset windows from its own note gaps, not the other hand's.
  const onsetWindows = new Map();
  if (selectedHands !== 'both') {
    const own = notes.filter(active);
    onsetWindowsFor(own).forEach((window, i) => onsetWindows.set(own[i].index, window));
  }
  const windowOf = (note) => onsetWindows.get(note.index) ?? note.onsetWindow;

  const s = {
    mode,
    tempoPercent,
    latencyMs,
    countInBeats,
    requireFullShape,
    loop,
    status: 'ready',
    clock: createPieceClock(0, tempoPercent / 100),
    pausedAt: null,
    stepIndex: 0,
    results: [],
    onsets: [],
    onsetSeq: 0,
    stepArmedSeq: 0,
    countedWrongOnsets: new Set(),
    heard: null,
    held: new Map(),
    streak: 0,
    bestStreak: 0,
    feedback: { tone: 'idle', text: '', icon: null, atMs: 0 },
    lastHit: null,
    hitCount: 0,
    events: [],
    chordMatcher: null,
    laps: 0,
    // Start of the last completed step (Wait for me): the other hand may be played since then.
    lastStepStart: -Infinity,
  };

  const emit = (event) => s.events.push(event);

  function resetResults(filter = () => true) {
    notes.forEach((note, i) => {
      if (filter(note)) s.results[i] = { hit: false, timingMs: null, wrongAttempts: 0, missed: false };
    });
  }
  resetResults();

  const inLoop = (note) => !s.loop || (note.start >= s.loop.start - 1e-6 && note.start < s.loop.end - 1e-6);
  const startPosition = () => (s.loop ? s.loop.start : 0);
  const endPosition = () => (s.loop ? s.loop.end : piece.totalDuration);

  // ---- groups -------------------------------------------------------------------
  function groupAt(index) {
    if (index < 0 || index >= notes.length) return [];
    const chordAware = s.requireFullShape;
    if (!chordAware) return [notes[index]].filter(active);
    const { startIndex, endIndex } = chordGroupBoundsAtIndex(notes, index);
    return notes.slice(startIndex, endIndex + 1).filter(active);
  }

  function firstStepIndexFrom(index) {
    let i = index;
    while (i < notes.length && (!active(notes[i]) || !inLoop(notes[i]))) {
      if (s.loop && notes[i].start >= s.loop.end - 1e-6) return notes.length;
      i += 1;
    }
    return i;
  }

  function stepGroup() {
    const group = groupAt(s.stepIndex);
    return group.filter((note) => !s.results[note.index].hit);
  }

  function nextGroupAfter(index) {
    const { endIndex } = s.requireFullShape ? chordGroupBoundsAtIndex(notes, index) : { endIndex: index };
    const next = firstStepIndexFrom(endIndex + 1);
    return next < notes.length ? groupAt(next) : [];
  }

  // ---- clock ----------------------------------------------------------------------
  const countInSeconds = () => (s.countInBeats > 0 ? s.countInBeats * beatSeconds : 0);
  const pieceTime = (nowMs) => s.clock.secondsAt(nowMs);
  const inputPieceTime = (timeMs) => s.clock.secondsAt(timeMs - s.latencyMs);

  // ---- onsets ---------------------------------------------------------------------
  function registerOnset(timeMs) {
    s.onsetSeq += 1;
    s.onsets.push({ id: s.onsetSeq, timeMs, pieceSeconds: s.mode === 'play' ? inputPieceTime(timeMs) : null, consumedStart: null });
    if (s.onsets.length > MAX_ONSETS) s.onsets.shift();
    return s.onsetSeq;
  }

  function onsetForNote(note) {
    let best = null;
    let bestDistance = Infinity;
    for (const onset of s.onsets) {
      if (onset.pieceSeconds === null) continue;
      if (onset.consumedStart !== null && Math.abs(onset.consumedStart - note.start) > CHORD_GROUP_EPSILON_SECONDS) continue;
      const distance = Math.abs(onset.pieceSeconds - note.start);
      if (distance <= windowOf(note) && distance < bestDistance) {
        best = onset;
        bestDistance = distance;
      }
    }
    return best;
  }

  const latestOnset = () => s.onsets[s.onsets.length - 1] || null;

  // The press of a held MIDI key, if it falls within the note's onset window.
  function keyOnsetFor(note) {
    const pressedMs = s.held.get(note.midi);
    const onset = [...s.onsets].reverse().find((candidate) => candidate.timeMs === pressedMs);
    if (!onset || onset.pieceSeconds === null) return null;
    if (onset.consumedStart !== null && Math.abs(onset.consumedStart - note.start) > CHORD_GROUP_EPSILON_SECONDS) return null;
    return Math.abs(onset.pieceSeconds - note.start) <= windowOf(note) ? onset : null;
  }

  // ---- feedback ---------------------------------------------------------------------
  function setFeedback(nowMs, tone, text, icon = null, detail = '') {
    s.feedback = { tone, text, icon, detail, atMs: nowMs };
  }

  function centsTo(note) {
    if (!s.heard || !note) return null;
    const cents = (s.heard.midi - note.midi) * 100;
    return Math.abs(cents) < 100 ? cents : null;
  }

  function matches(note) {
    const cents = centsTo(note);
    return cents !== null && Math.abs(cents) < HIT_CENTS;
  }

  function registerHit(note, nowMs, timingMs = null) {
    const result = s.results[note.index];
    if (result.hit) return;
    result.hit = true;
    result.timingMs = timingMs;
    s.hitCount += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastHit = { index: note.index, timingMs, atMs: nowMs };
    const praise = PRAISE[s.hitCount % PRAISE.length];
    setFeedback(nowMs, 'hit', praise, 'check', s.mode === 'play' ? formatTimingOffset(timingMs) : '');
    emit({ type: 'hit', index: note.index, timingMs, atMs: nowMs });
  }

  function registerWrong(note, nowMs, onsetId) {
    if (onsetId !== null && s.countedWrongOnsets.has(onsetId)) return;
    if (onsetId !== null) s.countedWrongOnsets.add(onsetId);
    if (note) s.results[note.index].wrongAttempts += 1;
    s.streak = 0;
    emit({ type: 'wrong', index: note?.index ?? null, atMs: nowMs });
  }

  function registerMiss(note, nowMs) {
    const result = s.results[note.index];
    if (result.hit || result.missed) return;
    result.missed = true;
    s.streak = 0;
    setFeedback(nowMs, 'off', 'Missed', 'cross');
    emit({ type: 'miss', index: note.index, atMs: nowMs });
  }

  // Of the notes still due, the one the learner was most likely reaching for.
  function nearestTo(group) {
    if (!s.heard || group.length < 2) return group[0] || null;
    return group.reduce((best, note) => (Math.abs(note.midi - s.heard.midi) < Math.abs(best.midi - s.heard.midi) ? note : best));
  }

  // Hint for the note the learner should be playing. With both hands in play, it names the
  // hand ("Left hand: you played C3, aim for A2: three keys to the left").
  function hintFeedback(target, nowMs) {
    if (!s.heard || !target) return;
    const cents = s.heard.exact ? 0 : (s.heard.midi - target.midi) * 100;
    const context = twoHanded ? { hand: selectedHands === 'both' ? handOf(target) : null, octave: true } : {};
    const hint = instrument.hintFor?.(target, s.heard.midi, cents, context);
    if (hint) setFeedback(nowMs, hint.tone || 'off', hint.text, hint.icon || null);
  }

  // The other hand's notes are not scored: playing one of them (around now) isn't a mistake.
  function isOtherHandNote(heardMidi, from, to) {
    if (selectedHands === 'both' || !Number.isFinite(heardMidi)) return false;
    const rounded = Math.round(heardMidi);
    return notes.some((note) => playable(note) && !active(note) && note.midi === rounded
      && note.start >= from - CHORD_GROUP_EPSILON_SECONDS && note.start <= to + CHORD_GROUP_EPSILON_SECONDS);
  }

  // ---- evaluation ---------------------------------------------------------------------
  function evaluateWait(nowMs) {
    if (s.stepIndex >= notes.length) return;
    let group = stepGroup();
    if (!group.length) {
      advance(nowMs);
      return;
    }
    const fresh = s.onsetSeq > s.stepArmedSeq;
    const onset = latestOnset();
    const holdFrom = (heard) => Math.max(heard.since, onset ? onset.timeMs : -Infinity);

    // Exact chords from MIDI: every remaining note held.
    if (s.held.size && group.length > 1 && fresh && group.every((note) => s.held.has(note.midi))) {
      group.forEach((note) => registerHit(note, nowMs));
      if (onset) onset.hit = true;
    } else if (fresh && group.length > 1 && s.chordMatcher && !s.held.size) {
      const matched = s.chordMatcher(group);
      if (matched && matched.length >= group.length) {
        group.forEach((note) => registerHit(note, nowMs));
        if (onset) onset.hit = true;
      }
    }
    group = stepGroup();
    if (!group.length) {
      advance(nowMs);
      return;
    }

    if (!s.heard) return;
    const target = group.find((note) => matches(note) || (s.held.has(note.midi)));
    if (target) {
      if (!fresh) {
        setFeedback(nowMs, 'close', 'Play it again', 'repeat');
        return;
      }
      const holdMs = s.heard.exact ? Infinity : nowMs - holdFrom(s.heard);
      if (holdMs >= WAIT_HOLD_MS) {
        registerHit(target, nowMs);
        if (onset) onset.hit = true;
        if (s.status === 'ready') s.status = 'running';
        if (!stepGroup().length) advance(nowMs);
      } else {
        setFeedback(nowMs, 'close', 'Hold it…', 'hold');
      }
      return;
    }

    // Wrong pitch after a fresh attack: count it once, and say how to fix it. (A note still
    // ringing from the previous step is not an attempt, so it gets no hint; neither is a
    // chord note that was just played correctly while the rest of the chord is still due.)
    if (!fresh || onset?.hit) return;
    const stable = s.heard.exact || nowMs - Math.max(s.heard.since, onset ? onset.timeMs : -Infinity) >= WRONG_NOTE_STABLE_MS;
    if (!stable) return;
    if (isOtherHandNote(s.heard.midi, s.lastStepStart, group[0].start)) return;
    const aim = nearestTo(group);
    if (onset) registerWrong(aim, nowMs, onset.id);
    hintFeedback(aim, nowMs);
  }

  function advance(nowMs) {
    const group = groupAt(s.stepIndex);
    const lastIndex = group.length ? group[group.length - 1].index : s.stepIndex;
    if (group.length) s.lastStepStart = group[0].start;
    let next = firstStepIndexFrom(lastIndex + 1);
    if (s.loop && next >= notes.length) {
      s.laps += 1;
      resetResults(inLoop);
      next = firstStepIndexFrom(0);
      s.lastStepStart = -Infinity;
      emit({ type: 'loop', atMs: nowMs });
    }
    s.stepIndex = next;
    s.stepArmedSeq = s.onsetSeq;
    if (s.stepIndex >= notes.length) finish(nowMs);
  }

  function activePlayNotes(t, slackBefore) {
    return notes.filter((note) => active(note)
      && inLoop(note)
      && t >= note.start - slackBefore
      && t < note.end + 0.05);
  }

  function evaluatePlay(nowMs) {
    if (s.status !== 'running') return;
    const t = pieceTime(nowMs);
    const tInput = inputPieceTime(nowMs);
    const candidates = activePlayNotes(tInput, 0.25).filter((note) => !s.results[note.index].hit && !s.results[note.index].missed);

    for (const note of candidates) {
      // MIDI keys are judged by their own press time (exact, key by key); the microphone by
      // the nearest attack, which a strummed or struck chord shares.
      const heldExactly = s.held.has(note.midi);
      const onset = heldExactly ? keyOnsetFor(note) : onsetForNote(note);
      if (!onset) continue;
      if (heldExactly || matches(note)) {
        const holdMs = heldExactly || s.heard?.exact ? Infinity : nowMs - Math.max(s.heard.since, onset.timeMs);
        if (holdMs >= PLAY_HOLD_MS) {
          onset.consumedStart = note.start;
          const timingMs = ((onset.pieceSeconds - note.start) / (s.tempoPercent / 100)) * 1000;
          registerHit(note, nowMs, timingMs);
        } else {
          setFeedback(nowMs, 'close', 'Hold it…', 'hold');
        }
      }
    }

    // Wrong attempt: a stable wrong pitch after an attack while a note is due. An attack that
    // already scored (one key of a chord) is not a wrong attempt at the rest of the chord.
    const onset = latestOnset();
    const due = candidates.filter((note) => !s.results[note.index].hit);
    if (s.heard && onset && onset.consumedStart === null && due.length && !due.some((note) => matches(note) || s.held.has(note.midi))) {
      // Judge the pitch that follows the attack, not the previous note still in the window.
      const stable = s.heard.exact || nowMs - Math.max(s.heard.since, onset.timeMs) >= WRONG_NOTE_STABLE_MS;
      const aim = nearestTo(due);
      const recent = onset.pieceSeconds !== null && Math.abs(onset.pieceSeconds - aim.start) <= windowOf(aim);
      const otherHand = onset.pieceSeconds !== null
        && isOtherHandNote(s.heard.midi, onset.pieceSeconds - TIMED_OTHER_HAND_SLACK, onset.pieceSeconds + TIMED_OTHER_HAND_SLACK);
      if (stable && recent && !otherHand) {
        registerWrong(aim, nowMs, onset.id);
        hintFeedback(aim, nowMs);
      }
    }

    // Misses: once the note is over (judged a little late to allow for input latency).
    const judgeDelay = s.latencyMs / 1000 + 0.12;
    notes.forEach((note) => {
      if (!active(note) || !inLoop(note)) return;
      const result = s.results[note.index];
      if (result.hit || result.missed) return;
      const windowOver = t - judgeDelay > note.start + windowOf(note) && !onsetForNote(note);
      if (t - judgeDelay >= note.end || windowOver) registerMiss(note, nowMs);
    });

    // Loop or finish.
    if (t >= endPosition() + (s.loop ? 0 : 0.4)) {
      if (s.loop) {
        s.laps += 1;
        resetResults(inLoop);
        s.onsets = [];
        s.clock.seek(nowMs, s.loop.start);
        emit({ type: 'loop', atMs: nowMs });
      } else {
        finish(nowMs);
      }
    }
  }

  function finish(nowMs) {
    if (s.status === 'finished') return;
    s.status = 'finished';
    emit({ type: 'finished', atMs: nowMs });
  }

  function evaluate(nowMs) {
    if (s.status === 'paused' || s.status === 'finished') return;
    if (s.mode === 'play') {
      if (s.status === 'countin' && pieceTime(nowMs) >= startPosition()) {
        s.status = 'running';
        emit({ type: 'started', atMs: nowMs });
      }
      evaluatePlay(nowMs);
    } else {
      evaluateWait(nowMs);
    }
  }

  // ---- public API -----------------------------------------------------------------------
  const api = {
    get status() { return s.status; },
    get mode() { return s.mode; },
    get results() { return s.results; },
    get streak() { return s.streak; },
    get bestStreak() { return s.bestStreak; },
    get loop() { return s.loop; },
    get tempoPercent() { return s.tempoPercent; },
    get laps() { return s.laps; },
    // 'R' | 'L' | 'both' (always 'both' for one-handed pieces).
    hands: selectedHands,
    twoHanded,
    // True when the note is required and scored in this run.
    isActive: active,
    beatSeconds,

    // Wall-clock time (ms) at which the running piece reaches `seconds` (play mode).
    timeToMs(seconds) {
      return s.clock.msAt(seconds);
    },

    // Wait mode: arms the run (the first correct note starts it). Play mode: count-in, then go.
    start(nowMs) {
      if (s.status === 'finished') api.restart(nowMs);
      if (s.mode === 'wait') {
        if (s.status === 'paused') s.status = s.hitCount ? 'running' : 'ready';
        s.stepIndex = Math.max(s.stepIndex, firstStepIndexFrom(s.stepIndex));
        if (s.stepIndex >= notes.length) s.stepIndex = firstStepIndexFrom(0);
        s.stepArmedSeq = s.onsetSeq;
        return;
      }
      const resumeAt = s.pausedAt ?? startPosition();
      s.pausedAt = null;
      s.clock.seek(nowMs, resumeAt - countInSeconds());
      s.status = countInSeconds() > 0 ? 'countin' : 'running';
      s.onsets = [];
      if (s.status === 'running') emit({ type: 'started', atMs: nowMs });
    },

    pause(nowMs) {
      if (s.status === 'finished' || s.status === 'paused') return;
      if (s.mode === 'play') s.pausedAt = Math.max(startPosition(), pieceTime(nowMs));
      s.status = 'paused';
    },

    toggle(nowMs) {
      if (s.status === 'paused' || s.status === 'finished' || (s.mode === 'play' && s.status === 'ready')) api.start(nowMs);
      else api.pause(nowMs);
    },

    restart(nowMs) {
      resetResults();
      s.status = 'ready';
      s.pausedAt = null;
      s.stepIndex = firstStepIndexFrom(0);
      s.onsets = [];
      s.stepArmedSeq = s.onsetSeq;
      s.streak = 0;
      s.hitCount = 0;
      s.laps = 0;
      s.lastStepStart = -Infinity;
      s.countedWrongOnsets.clear();
      setFeedback(nowMs, 'idle', '');
      s.clock.seek(nowMs, startPosition());
    },

    setTempo(nowMs, percent) {
      s.tempoPercent = percent;
      s.clock.setScale(nowMs, percent / 100);
    },

    setLatency(ms) {
      s.latencyMs = ms;
    },

    setLoop(nowMs, nextLoop) {
      s.loop = nextLoop && nextLoop.end > nextLoop.start ? { ...nextLoop } : null;
      api.restart(nowMs);
    },

    setChordMatcher(fn) {
      s.chordMatcher = fn;
    },

    // Microphone pipeline: one analysis result. `midi` is fractional (null = no pitch).
    onPitch({ timeMs, midi, onsetTimeMs = null }) {
      if (onsetTimeMs !== null && Number.isFinite(onsetTimeMs)) registerOnset(onsetTimeMs);
      if (Number.isFinite(midi)) {
        const rounded = Math.round(midi);
        if (!s.heard || s.heard.exact || s.heard.rounded !== rounded || timeMs - s.heard.lastMs > PITCH_DROPOUT_MS) {
          s.heard = { midi, rounded, since: timeMs, lastMs: timeMs, exact: false };
        } else {
          s.heard.midi = midi;
          s.heard.lastMs = timeMs;
        }
      } else if (s.heard && !s.heard.exact && timeMs - s.heard.lastMs > PITCH_DROPOUT_MS) {
        s.heard = null;
      }
      evaluate(timeMs);
    },

    // MIDI keyboard: exact pitch and timing.
    onNoteOn({ midi, timeMs }) {
      s.held.set(midi, timeMs);
      registerOnset(timeMs);
      s.heard = { midi, rounded: midi, since: timeMs, lastMs: timeMs, exact: true };
      evaluate(timeMs);
    },

    onNoteOff({ midi, timeMs }) {
      s.held.delete(midi);
      if (s.heard?.exact && s.heard.rounded === midi) {
        const remaining = [...s.held.entries()].sort((a, b) => b[1] - a[1])[0];
        s.heard = remaining ? { midi: remaining[0], rounded: remaining[0], since: remaining[1], lastMs: timeMs, exact: true } : null;
      }
      evaluate(timeMs);
    },

    // Called every display frame: advances time-based judgments (play mode).
    tick(nowMs) {
      evaluate(nowMs);
    },

    // Drains events since the last call (hits, misses, wrong notes, loop, finish).
    takeEvents() {
      const events = s.events;
      s.events = [];
      return events;
    },

    view(nowMs) {
      let current = [];
      let upcoming = [];
      let position;
      if (s.mode === 'wait') {
        current = s.stepIndex < notes.length ? groupAt(s.stepIndex) : [];
        upcoming = s.stepIndex < notes.length ? nextGroupAfter(s.stepIndex) : [];
        position = current[0]?.start ?? endPosition();
      } else {
        position = pieceTime(nowMs);
        const sounding = activePlayNotes(position, 0.08);
        const focus = sounding.find((note) => !s.results[note.index].hit) || sounding[0];
        if (focus) current = groupAt(focus.index);
        const after = notes.find((note) => active(note) && inLoop(note) && note.start > (current[0]?.start ?? position) + CHORD_GROUP_EPSILON_SECONDS);
        if (after) upcoming = groupAt(after.index);
      }
      const target = current.find((note) => !s.results[note.index].hit) || current[0] || null;
      const beatsLeft = s.status === 'countin' ? Math.ceil((startPosition() - pieceTime(nowMs)) / beatSeconds - 1e-6) : 0;
      const total = notes.filter((note) => active(note) && inLoop(note)).length;
      const done = notes.filter((note) => active(note) && inLoop(note) && s.results[note.index].hit).length;
      return {
        status: s.status,
        mode: s.mode,
        hands: selectedHands,
        twoHanded,
        isActive: active,
        position,
        countInBeat: beatsLeft,
        current,
        upcoming,
        target,
        // Only meaningful when the learner is within half a semitone of the target.
        cents: (() => {
          const value = centsTo(target);
          return value !== null && Math.abs(value) < 50 ? value : null;
        })(),
        heardMidi: s.heard ? s.heard.midi : null,
        feedback: s.feedback,
        streak: s.streak,
        hits: done,
        total,
        results: s.results,
        loop: s.loop,
      };
    },
  };

  api.restart(0);
  return api;
}
