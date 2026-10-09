// End-of-run summary: accuracy, timing tendency, the trickiest notes and bar, and a
// suggested next step. Pure, so it is unit-tested.
import { handOf, inHands, isTwoHanded } from '../piece.js';
import { timingScoreForMs } from './session.js';

export const STAR_THRESHOLDS = [0.5, 0.75, 0.9];
export const BEATS_PER_BAR = 4;

export function starsFor(accuracy) {
  return STAR_THRESHOLDS.filter((threshold) => accuracy >= threshold).length;
}

export function barSecondsFor(piece) {
  const bpm = Number(piece?.bpm) > 0 ? piece.bpm : 100;
  return (60 / bpm) * (piece?.beatsPerBar || BEATS_PER_BAR);
}

// Sections for the progress bar: groups of `barsPerSection` bars.
export function sectionsFor(piece, barsPerSection = 4) {
  const barSeconds = barSecondsFor(piece);
  const total = Math.max(barSeconds, piece?.totalDuration || 0);
  const barCount = Math.max(1, Math.ceil(total / barSeconds - 1e-9));
  const sections = [];
  for (let bar = 0; bar < barCount; bar += barsPerSection) {
    const lastBar = Math.min(barCount, bar + barsPerSection);
    sections.push({
      start: bar * barSeconds,
      end: Math.min(total, lastBar * barSeconds),
      label: lastBar - bar > 1 ? `Bars ${bar + 1}–${lastBar}` : `Bar ${bar + 1}`,
    });
  }
  return sections;
}

const clampTempo = (value) => Math.max(50, Math.min(120, Math.round(value / 5) * 5));

const percent = (value) => `${Math.round(value * 100)}%`;
const HAND_WORDS = { R: 'right', L: 'left' };

// results: array indexed by note index: { hit, timingMs, wrongAttempts, missed }.
// hands: 'R' | 'L' | 'both' (two-handed piano pieces): only those notes are scored, and with
// both hands the accuracy is also given per hand.
export function computeSummary({ piece, results, mode, tempoPercent = 100, describeNote = (n) => n.note, hands = 'both' }) {
  const twoHanded = isTwoHanded(piece);
  const practised = twoHanded ? hands : 'both';
  const notes = (piece?.notes || []).filter((note) => note.playable !== false && inHands(note, practised));
  const resultFor = (note) => results?.[note.index] || {};
  const hits = notes.filter((note) => resultFor(note).hit);
  const accuracy = notes.length ? hits.length / notes.length : 0;

  let byHand = null;
  if (twoHanded && practised === 'both') {
    byHand = {};
    ['R', 'L'].forEach((hand) => {
      const own = notes.filter((note) => handOf(note) === hand);
      const ownHits = own.filter((note) => resultFor(note).hit).length;
      byHand[hand] = { notes: own.length, hits: ownHits, accuracy: own.length ? ownHits / own.length : 0 };
    });
  }

  const offsets = hits.map((note) => resultFor(note).timingMs).filter(Number.isFinite);
  const timing = mode === 'play' && offsets.length
    ? offsets.reduce((sum, ms) => sum + timingScoreForMs(Math.abs(ms)), 0) / offsets.length
    : null;
  const meanOffsetMs = offsets.length ? offsets.reduce((sum, ms) => sum + ms, 0) / offsets.length : null;
  let tendency = null;
  if (mode === 'play' && meanOffsetMs !== null) {
    if (Math.abs(meanOffsetMs) < 25) tendency = 'Right on the beat';
    else tendency = `You tend to play ${Math.round(Math.abs(meanOffsetMs))} ms ${meanOffsetMs < 0 ? 'early' : 'late'}`;
  }

  const trouble = (note) => (resultFor(note).hit ? 0 : 1) + (resultFor(note).wrongAttempts || 0);
  const byLabel = new Map();
  notes.forEach((note) => {
    const count = trouble(note);
    if (!count) return;
    const label = describeNote(note);
    const entry = byLabel.get(label) || { label, note: note.note, count: 0 };
    entry.count += count;
    byLabel.set(label, entry);
  });
  const trickyNotes = [...byLabel.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  const barSeconds = barSecondsFor(piece);
  const bars = new Map();
  notes.forEach((note) => {
    const bar = Math.floor(note.start / barSeconds + 1e-9);
    const entry = bars.get(bar) || { bar, notes: 0, hits: 0, trouble: 0 };
    entry.notes += 1;
    entry.hits += resultFor(note).hit ? 1 : 0;
    entry.trouble += trouble(note);
    bars.set(bar, entry);
  });
  const barList = [...bars.values()].map((entry) => ({ ...entry, accuracy: entry.hits / entry.notes }));
  const worst = barList
    .filter((entry) => entry.trouble > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.trouble - a.trouble || a.bar - b.bar)[0] || null;
  const trickyBar = worst
    ? {
      bar: worst.bar + 1,
      accuracy: worst.accuracy,
      loop: { start: worst.bar * barSeconds, end: (worst.bar + 1) * barSeconds },
      tempoPercent: clampTempo(tempoPercent - 20),
    }
    : null;

  // Two hands: if one lags well behind, practise it alone first; one hand mastered: put
  // them together.
  const lower = byHand ? (byHand.L.accuracy < byHand.R.accuracy ? 'L' : 'R') : null;
  const stronger = lower === 'L' ? 'R' : 'L';
  const weaker = byHand && byHand[lower].accuracy < 0.9 && byHand[stronger].accuracy - byHand[lower].accuracy >= 0.1 ? lower : null;
  let suggestion;
  if (weaker) {
    suggestion = {
      text: `Your ${HAND_WORDS[weaker]} hand is behind (${percent(byHand[weaker].accuracy)}, against ${percent(byHand[stronger].accuracy)}). Practise the ${HAND_WORDS[weaker]} hand alone in "Wait for me", then play both hands again.`,
      hands: weaker,
      mode: 'wait',
    };
  } else if (twoHanded && practised !== 'both' && accuracy >= 0.9) {
    suggestion = { text: `Your ${HAND_WORDS[practised]} hand has it. Now try both hands together.`, hands: 'both' };
  } else if (accuracy >= 0.9 && tempoPercent < 120) {
    const next = clampTempo(tempoPercent + 10);
    suggestion = { text: `You are ready for more speed. Try it at ${next}% tempo.`, tempoPercent: next };
  } else if (accuracy >= 0.9 && mode === 'wait') {
    suggestion = { text: 'You have it at full speed. Try "Play along" next.', mode: 'play' };
  } else if (accuracy >= 0.9) {
    suggestion = { text: 'Full speed and nearly perfect. Try a new song.' };
  } else if (accuracy < 0.6 && mode === 'play') {
    suggestion = { text: 'Switch to "Wait for me" and learn the notes first.', mode: 'wait' };
  } else if (trickyBar) {
    suggestion = { text: `Loop bar ${trickyBar.bar} at ${trickyBar.tempoPercent}% until it feels easy.`, loop: trickyBar.loop, tempoPercent: trickyBar.tempoPercent };
  } else {
    suggestion = { text: `Play it again at ${clampTempo(tempoPercent)}% to lock it in.` };
  }

  return {
    notes: notes.length,
    hits: hits.length,
    accuracy,
    hands: practised,
    byHand,
    // The hand that clearly trails (worth practising alone), or null.
    weakerHand: weaker,
    stars: starsFor(accuracy),
    timing,
    meanOffsetMs,
    tendency,
    trickyNotes,
    trickyBar,
    suggestion,
  };
}
