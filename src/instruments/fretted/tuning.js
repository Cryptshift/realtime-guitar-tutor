// Tuning detection from page/tab text for fretted instruments. Every function takes the
// instrument's standard open-string map ({ stringNumber: midi }, string 1 = top tab line);
// its size is the string count. The default is a standard-tuned 6-string guitar.
import {
  midiForPitchClassOctave,
  midiToNoteName,
  nearestMidiForPitchClass,
  parseTuningToken,
} from '../../music.js';

export const SIX_STRING_STANDARD = Object.freeze({ 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 });

function stringNumbersOf(defaultOpenMidi) {
  return Object.keys(defaultOpenMidi).map(Number).sort((a, b) => a - b);
}

export function scoreOpenMidiMap(openMidiByString, defaultOpenMidi = SIX_STRING_STANDARD) {
  let score = 0;
  const stringNumbers = stringNumbersOf(defaultOpenMidi);
  stringNumbers.forEach((stringNumber) => {
    const midi = openMidiByString[stringNumber];
    const fallback = defaultOpenMidi[stringNumber];
    if (!Number.isFinite(midi)) {
      score += 99;
      return;
    }
    score += Math.abs(midi - fallback);
  });

  const lowToHigh = [...stringNumbers].reverse().map((stringNumber) => openMidiByString[stringNumber]);
  for (let i = 1; i < lowToHigh.length; i += 1) {
    if (lowToHigh[i] <= lowToHigh[i - 1]) {
      score += 30;
      continue;
    }

    const interval = lowToHigh[i] - lowToHigh[i - 1];
    if (interval > 10) {
      score += interval - 10;
    }
  }

  return score;
}

export function buildOpenMidiMapFromTokens(tokens, orientation, defaultOpenMidi = SIX_STRING_STANDARD) {
  const stringNumbers = stringNumbersOf(defaultOpenMidi);
  if (!Array.isArray(tokens) || tokens.length !== stringNumbers.length) {
    return null;
  }

  const stringOrder = orientation === 'high-to-low' ? stringNumbers : [...stringNumbers].reverse();

  const openMidiByString = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const stringNumber = stringOrder[i];
    const targetMidi = defaultOpenMidi[stringNumber];
    const midi = token.octave === null
      ? nearestMidiForPitchClass(token.pitchClass, targetMidi)
      : midiForPitchClassOctave(token.pitchClass, token.octave);
    if (!Number.isFinite(midi)) {
      return null;
    }
    openMidiByString[stringNumber] = midi;
  }

  return {
    openMidiByString,
    score: scoreOpenMidiMap(openMidiByString, defaultOpenMidi),
    orientation,
  };
}

export function pickBestTuningWindow(tokens, defaultOpenMidi = SIX_STRING_STANDARD) {
  const count = stringNumbersOf(defaultOpenMidi).length;
  if (!Array.isArray(tokens) || tokens.length < count) {
    return null;
  }

  let best = null;
  for (let start = 0; start <= tokens.length - count; start += 1) {
    const windowTokens = tokens.slice(start, start + count);
    const lowToHigh = buildOpenMidiMapFromTokens(windowTokens, 'low-to-high', defaultOpenMidi);
    const highToLow = buildOpenMidiMapFromTokens(windowTokens, 'high-to-low', defaultOpenMidi);
    const winner = [lowToHigh, highToLow]
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)[0];
    if (!winner) continue;

    if (!best || winner.score < best.score) {
      best = {
        ...winner,
        tokens: windowTokens,
      };
    }
  }

  return best;
}

export function parseTuningFromText(rawText, options = {}) {
  const { allowBare = false, defaultOpenMidi = SIX_STRING_STANDARD } = options;
  const extraTokens = `{${stringNumbersOf(defaultOpenMidi).length - 1},10}`;
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const text = rawText
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/&nbsp;/gi, ' ');

  const candidatePatterns = [
    new RegExp(`(?:^|[\\s>"'=])tuning(?:\\s*[:=]\\s*|\\s+)([A-G][#b]?\\d?(?:[\\s,;|/\\\\-]+[A-G][#b]?\\d?)${extraTokens})`, 'gi'),
    /"tuning"\s*:\s*"([^"]{6,120})"/gi,
    /"tuning"\s*:\s*\[([^\]]{6,200})\]/gi,
    new RegExp(`(?:open\\s+tuning|tuned\\s+to)\\s*[:=]?\\s*([A-G][#b]?\\d?(?:[\\s,;|/\\\\-]+[A-G][#b]?\\d?)${extraTokens})`, 'gi'),
  ];

  const chunks = [];
  candidatePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) chunks.push(match[1]);
    }
  });

  if (!chunks.length) {
    if (!allowBare) return null;
    chunks.push(text);
  }

  let best = null;
  chunks.forEach((chunk) => {
    const tokenMatches = chunk.match(/\b[A-Ga-g][#b]?(?:-?\d+)?\b/g) || [];
    const tokens = tokenMatches.map(parseTuningToken).filter(Boolean);
    const parsed = pickBestTuningWindow(tokens, defaultOpenMidi);
    if (!parsed) return;

    if (!best || parsed.score < best.score) {
      best = parsed;
    }
  });

  if (!best) return null;

  const ordered = [...stringNumbersOf(defaultOpenMidi)].reverse()
    .map((stringNumber) => midiToNoteName(best.openMidiByString[stringNumber]));
  return {
    openMidiByString: best.openMidiByString,
    label: ordered.join(' '),
    orientation: best.orientation,
  };
}

export function extractTuningMetadata(rawText, doc, defaultOpenMidi = SIX_STRING_STANDARD) {
  const sources = [];
  if (doc) {
    const tuningSelectors = [
      { selector: '[data-testid*="tuning"]', allowBare: true },
      { selector: '[data-testid*="Tuning"]', allowBare: true },
      { selector: '[class*="tuning"]', allowBare: true },
      { selector: '[class*="Tuning"]', allowBare: true },
      { selector: 'meta[name="description"]', allowBare: false },
    ];

    tuningSelectors.forEach(({ selector, allowBare }) => {
      doc.querySelectorAll(selector).forEach((node) => {
        const content = node.getAttribute('content');
        const text = typeof content === 'string' ? content : (node.textContent || '');
        if (text.trim()) {
          sources.push({ label: selector, text, allowBare });
        }
      });
    });
  }

  sources.push({ label: 'raw', text: rawText, allowBare: false });

  for (const source of sources) {
    const parsed = parseTuningFromText(source.text, { allowBare: source.allowBare, defaultOpenMidi });
    if (parsed) {
      return {
        ...parsed,
        source: source.label,
      };
    }
  }

  return null;
}
