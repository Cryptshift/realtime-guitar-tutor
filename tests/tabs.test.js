// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  extractTabImportData,
  parseCustomPieceInput,
  parseTabLine,
  parseTabSystems,
  parseTabTextToPiece,
} from '../src/main.js';

const STANDARD = [
  'e|-----0-----|',
  'B|---1-------|',
  'G|-0---------|',
  'D|-----------|',
  'A|-----------|',
  'E|-----------|',
].join('\n');

const notesOf = (text, options) => parseTabTextToPiece(text, 120, 'Test', null, null, options)
  .notes.map((n) => `${n.note}:s${n.tab.string}f${n.tab.fret}`);

describe('parseTabLine', () => {
  it('accepts labelled, unlabelled and annotated tab lines', () => {
    expect(parseTabLine('e|--0--|')).toMatchObject({ label: 'e', body: '--0--|' });
    expect(parseTabLine('D#|--3--|')).toMatchObject({ label: 'D#' });
    expect(parseTabLine('Eb|--3--|')).toMatchObject({ label: 'Eb' });
    expect(parseTabLine('|---0---|')).toMatchObject({ label: null });
    expect(parseTabLine('----0----')).toMatchObject({ label: null });
    expect(parseTabLine('e|--0--|  x2')).toMatchObject({ body: '--0--|' });
  });

  it('rejects prose, chord names and lyrics', () => {
    expect(parseTabLine('Am I right?')).toBeNull();
    expect(parseTabLine('[Intro]')).toBeNull();
    expect(parseTabLine('A - B - C')).toBeNull();
    expect(parseTabLine('Em        G         D')).toBeNull();
    expect(parseTabLine('')).toBeNull();
  });
});

describe('parseTabSystems / parseTabTextToPiece', () => {
  it('parses a standard labelled system', () => {
    expect(notesOf(STANDARD)).toEqual(['G3:s3f0', 'C4:s2f1', 'E4:s1f0']);
  });

  it('handles "E" labels on both outer strings', () => {
    expect(notesOf(STANDARD.replace(/^e/m, 'E'))).toEqual(['G3:s3f0', 'C4:s2f1', 'E4:s1f0']);
  });

  it('handles lowercase and missing labels by line position', () => {
    expect(notesOf(STANDARD.toLowerCase())).toEqual(['G3:s3f0', 'C4:s2f1', 'E4:s1f0']);
    expect(notesOf(STANDARD.replace(/^[eBGDAE]/gm, ''))).toEqual(['G3:s3f0', 'C4:s2f1', 'E4:s1f0']);
  });

  it('reads drop-D from the string labels', () => {
    const dropD = [
      'e|---------|',
      'B|---------|',
      'G|---------|',
      'D|---------|',
      'A|---------|',
      'D|-0---2---|',
    ].join('\n');
    const { labelTuning } = parseTabSystems(dropD);
    expect(labelTuning).toMatchObject({ 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 38 });
    expect(notesOf(dropD)).toEqual(['D2:s6f0', 'E2:s6f2']);
  });

  it('prefers explicit tuning metadata over labels and applies a capo', () => {
    const halfStepDown = { 1: 63, 2: 58, 3: 54, 4: 49, 5: 44, 6: 39 };
    const piece = parseTabTextToPiece(STANDARD, 120, 'T', halfStepDown, null, { capo: 2 });
    expect(piece.notes.map((n) => n.note)).toEqual(['G#3', 'C#4', 'F4']);
    expect(piece.notes.map((n) => n.tab.fret)).toEqual([0, 1, 0]);
  });

  it('splits back-to-back systems and skips non-6-string blocks', () => {
    const twelve = `${STANDARD}\n${STANDARD.replace('-----0-----', '-----3-----')}`;
    const bass = ['G|--5--|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n');
    const { systems } = parseTabSystems(`${bass}\n\n${twelve}`);
    expect(systems).toHaveLength(2);
    expect(notesOf(twelve).at(-1)).toBe('G4:s1f3');
  });

  it('keeps two-digit frets intact and ignores [tab]/[ch] markup', () => {
    const marked = `[ch]Em[/ch]\n[tab]${STANDARD.replace('-----0-----', '--10---12--')}[/tab]`;
    expect(notesOf(marked).filter((n) => n.includes('s1'))).toEqual(['D5:s1f10', 'E5:s1f12']);
  });

  it('throws when there is no complete system', () => {
    expect(() => parseTabSystems('e|--0--|\nB|--1--|')).toThrow(/6-string/);
  });
});

describe('extractTabImportData', () => {
  const ugPage = (content, meta) => {
    const store = { store: { page: { data: { tab_view: { wiki_tab: { content }, meta } } } } };
    const encoded = JSON.stringify(store).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<!doctype html><html><body><div class="js-store" data-content="${encoded}"></div>`
      + '<main>Ultimate Guitar page chrome</main></body></html>';
  };

  it('reads Ultimate Guitar tabs from the .js-store JSON', () => {
    const content = `[Intro]\r\n\r\n[tab]${STANDARD.replace(/\n/g, '\r\n')}[/tab]\r\n`;
    const data = extractTabImportData(ugPage(content, {
      tuning: { name: 'Drop D', value: 'D A D G B E' },
      capo: 1,
    }));
    expect(data.tabText).not.toMatch(/\[tab\]/);
    expect(data.capo).toBe(1);
    expect(data.tuning.openMidiByString).toMatchObject({ 6: 38, 5: 45, 1: 64 });
    expect(data.tuning.source).toBe('Ultimate Guitar meta');
  });

  it('falls back to the tightest element with tab lines on generic pages', () => {
    const html = `<html><body><nav>Home | Tabs | About</nav><article><p>Intro riff:</p><pre>${STANDARD}</pre></article></body></html>`;
    const data = extractTabImportData(html);
    expect(data.tabText.trim()).toBe(STANDARD);
  });

  it('accepts plain-text/markdown responses (e.g. the jina mirror)', () => {
    const markdown = `Title: Riff\n\nTempo: 96 bpm\n\n\`\`\`\n${STANDARD}\n\`\`\``;
    const data = extractTabImportData(markdown);
    expect(data.bpm).toBe(96);
    expect(() => parseTabSystems(data.tabText)).not.toThrow();
  });

  it('reports pages without tabs', () => {
    expect(() => extractTabImportData('<html><body><p>No tabs here</p></body></html>')).toThrow(/tab lines/);
  });
});

describe('parseCustomPieceInput', () => {
  it('still accepts JSON', () => {
    const piece = parseCustomPieceInput('[{"note":"E4","start":0,"duration":0.5}]');
    expect(piece.notes).toHaveLength(1);
  });

  it('accepts raw ASCII tab pasted into the editor', () => {
    const piece = parseCustomPieceInput(`Some riff, tempo 120 bpm\n\n${STANDARD}`, { msPerColumn: 120 });
    expect(piece.importedFrom).toBe('ascii-tab');
    expect(piece.bpm).toBe(120);
    expect(piece.notes.map((n) => n.note)).toEqual(['G3', 'C4', 'E4']);
  });

  it('explains failures that are neither JSON nor tab', () => {
    expect(() => parseCustomPieceInput('hello there')).toThrow(/ASCII tab/);
  });
});
