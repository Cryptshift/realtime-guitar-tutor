// Finds guitar tab text in a fetched page (Ultimate Guitar .js-store, generic HTML, plain text).
import { extractBpmMetadata, parseBpmFromText } from '../../import/metadata.js';
import {
  DEFAULT_COLUMNS_PER_BEAT,
  DEFAULT_TAB_MS_PER_COLUMN,
  bpmToMsPerColumn,
  countTabLines,
  parseTabTextToPiece,
  stripTabMarkup,
} from './tabParser.js';
import { extractTuningMetadata, parseTuningFromText } from './tuning.js';

// Ultimate Guitar ships the tab as JSON in <div class="js-store" data-content="...">
// (store.page.data.tab_view): wiki_tab.content uses [tab]/[ch] markup, meta.tuning.value
// is low-to-high ("D A D G B E"), meta.capo is optional.
export function findNestedKey(value, key, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return undefined;
  if (Object.hasOwn(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findNestedKey(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function extractUltimateGuitarTab(doc) {
  const storeEl = doc.querySelector('.js-store[data-content]');
  if (!storeEl) return null;

  let data;
  try {
    data = JSON.parse(storeEl.getAttribute('data-content'));
  } catch {
    return null;
  }

  const tabView = data?.store?.page?.data?.tab_view || findNestedKey(data, 'tab_view');
  const content = tabView?.wiki_tab?.content;
  if (typeof content !== 'string' || !content.trim()) return null;

  const meta = tabView.meta || {};
  const tuningValue = typeof meta.tuning?.value === 'string' ? meta.tuning.value : null;
  const tuning = tuningValue ? parseTuningFromText(tuningValue, { allowBare: true }) : null;
  const capo = Number(meta.capo);
  const bpm = parseBpmFromText(String(meta.bpm ?? ''), { allowBare: true });

  return {
    tabText: stripTabMarkup(content),
    tuning: tuning ? { ...tuning, source: 'Ultimate Guitar meta' } : null,
    bpm: bpm ? { bpm, source: 'Ultimate Guitar meta' } : null,
    capo: Number.isInteger(capo) && capo > 0 && capo < 13 ? capo : 0,
  };
}

export function extractTabImportData(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Fetched page was empty');
  }

  const looksLikeHtml = /<[a-z!/][^>]*>/i.test(rawText);
  if (!looksLikeHtml && countTabLines(rawText) >= 6) {
    return {
      tabText: stripTabMarkup(rawText),
      tuning: parseTuningFromText(rawText, { allowBare: false }),
      bpm: parseBpmFromText(rawText, { allowBare: false }),
      capo: 0,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawText, 'text/html');

  const ultimateGuitar = extractUltimateGuitarTab(doc);
  if (ultimateGuitar && countTabLines(ultimateGuitar.tabText) >= 6) {
    return ultimateGuitar;
  }

  // Generic pages: the tightest element containing the most tab lines.
  const candidates = [];
  const selectors = ['pre', 'code', '.js-tab-content', '[class*="tab"]', 'article', 'main'];
  selectors.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => {
      const text = node.textContent || '';
      if (!text.trim()) return;
      candidates.push({ text, tabLines: countTabLines(text) });
    });
  });

  const bodyText = doc.body?.textContent || '';
  if (bodyText.trim()) {
    candidates.push({ text: bodyText, tabLines: countTabLines(bodyText) });
  }

  candidates.sort((a, b) => b.tabLines - a.tabLines || a.text.length - b.text.length);
  const best = candidates[0];
  if (!best || best.tabLines < 6) {
    throw new Error('Could not find tab lines in that page');
  }

  return {
    tabText: stripTabMarkup(best.text),
    tuning: extractTuningMetadata(rawText, doc),
    bpm: extractBpmMetadata(rawText, doc),
    capo: 0,
  };
}

// Instrument importer hook for a fetched page: finds the tab, applies page tuning/capo/BPM,
// and converts it to a piece. A BPM on the page replaces the default ms-per-column.
export function importTabPage(htmlOrText, { pieceName, msPerColumn, simplifyToSingleNotes = true } = {}) {
  const { tabText, tuning, bpm, capo } = extractTabImportData(htmlOrText);
  const requestedMsPerColumn = Number.isFinite(msPerColumn) ? msPerColumn : DEFAULT_TAB_MS_PER_COLUMN;
  const usingDefaultMsPerColumn = requestedMsPerColumn === DEFAULT_TAB_MS_PER_COLUMN;
  const effectiveMsPerColumn = bpm && usingDefaultMsPerColumn
    ? bpmToMsPerColumn(bpm.bpm, DEFAULT_COLUMNS_PER_BEAT)
    : requestedMsPerColumn;

  const piece = parseTabTextToPiece(
    tabText,
    effectiveMsPerColumn,
    pieceName,
    tuning?.openMidiByString || null,
    bpm?.bpm || null,
    { simplifyToSingleNotes, capo },
  );

  const details = [];
  if (tuning) details.push(`Tuning: ${tuning.label} (${tuning.source || 'tab text'})`);
  if (capo) details.push(`Capo ${capo}`);
  if (bpm) details.push(`BPM: ${bpm.bpm} (${bpm.source})`);
  if (bpm && usingDefaultMsPerColumn) details.push(`ms/col auto: ${effectiveMsPerColumn}`);

  return {
    piece,
    details,
    msPerColumn: bpm && usingDefaultMsPerColumn ? effectiveMsPerColumn : null,
  };
}
