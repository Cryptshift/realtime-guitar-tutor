// Guitar tuning sets and tuning detection from text/labels.
import { DEFAULT_OPEN_MIDI_BY_STRING } from './strings.js';
import {
  midiForPitchClassOctave,
  midiToNoteName,
  nearestMidiForPitchClass,
  parseTuningToken,
} from '../../music.js';

export const TUNING_SETS = {
  standard: {
    label: 'Standard (E A D G B E)',
    notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
  drop_d: {
    label: 'Drop D (D A D G B E)',
    notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
  d_standard: {
    label: 'D Standard (D G C F A D)',
    notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
  },
  open_g: {
    label: 'Open G (D G D G B D)',
    notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
  },
};

export function scoreOpenMidiMap(openMidiByString) {
  let score = 0;
  [1, 2, 3, 4, 5, 6].forEach((stringNumber) => {
    const midi = openMidiByString[stringNumber];
    const fallback = DEFAULT_OPEN_MIDI_BY_STRING[stringNumber];
    if (!Number.isFinite(midi)) {
      score += 99;
      return;
    }
    score += Math.abs(midi - fallback);
  });

  const lowToHigh = [6, 5, 4, 3, 2, 1].map((stringNumber) => openMidiByString[stringNumber]);
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

export function buildOpenMidiMapFromTokens(tokens, orientation) {
  if (!Array.isArray(tokens) || tokens.length !== 6) {
    return null;
  }

  const stringOrder = orientation === 'high-to-low'
    ? [1, 2, 3, 4, 5, 6]
    : [6, 5, 4, 3, 2, 1];

  const openMidiByString = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const stringNumber = stringOrder[i];
    const targetMidi = DEFAULT_OPEN_MIDI_BY_STRING[stringNumber];
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
    score: scoreOpenMidiMap(openMidiByString),
    orientation,
  };
}

export function pickBestTuningWindow(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 6) {
    return null;
  }

  let best = null;
  for (let start = 0; start <= tokens.length - 6; start += 1) {
    const windowTokens = tokens.slice(start, start + 6);
    const lowToHigh = buildOpenMidiMapFromTokens(windowTokens, 'low-to-high');
    const highToLow = buildOpenMidiMapFromTokens(windowTokens, 'high-to-low');
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
  const { allowBare = false } = options;
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const text = rawText
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/&nbsp;/gi, ' ');

  const candidatePatterns = [
    /(?:^|[\s>"'=])tuning(?:\s*[:=]\s*|\s+)([A-G][#b]?\d?(?:[\s,;|/\\-]+[A-G][#b]?\d?){5,10})/gi,
    /"tuning"\s*:\s*"([^"]{6,120})"/gi,
    /"tuning"\s*:\s*\[([^\]]{6,200})\]/gi,
    /(?:open\s+tuning|tuned\s+to)\s*[:=]?\s*([A-G][#b]?\d?(?:[\s,;|/\\-]+[A-G][#b]?\d?){5,10})/gi,
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
    const parsed = pickBestTuningWindow(tokens);
    if (!parsed) return;

    if (!best || parsed.score < best.score) {
      best = parsed;
    }
  });

  if (!best) return null;

  const ordered = [6, 5, 4, 3, 2, 1].map((stringNumber) => midiToNoteName(best.openMidiByString[stringNumber]));
  return {
    openMidiByString: best.openMidiByString,
    label: ordered.join(' '),
    orientation: best.orientation,
  };
}

export function extractTuningMetadata(rawText, doc) {
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
    const parsed = parseTuningFromText(source.text, { allowBare: source.allowBare });
    if (parsed) {
      return {
        ...parsed,
        source: source.label,
      };
    }
  }

  return null;
}
