// Builds an instrument add-on for a fretted, string-tuned instrument from a small config
// (strings, frets, tunings, detector range). Guitar, bass and ukulele use it.
import { frettedHint } from './hints.js';
import { assignFretFingers, createFretLayout } from './layout.js';
import { importTabPage } from './pageImport.js';
import { DEFAULT_TAB_MS_PER_COLUMN, countTabLines, parsePastedTab } from './tabParser.js';
import { buildTabDiagram, groupLabel, tabSummary } from './tabText.js';
import { describePosition, renderFretboard } from './view.js';

export function createFrettedInstrument({
  id,
  name,
  strings,
  maxFret = 24,
  beginnerMaxFret = 15,
  tunings,
  defaultTuning,
  detector,
  importTabs = true,
  description = '',
}) {
  const layout = createFretLayout({ strings, maxFret, beginnerMaxFret });
  const openPitches = strings.map((s) => s.openMidi);
  const defaultOpenMidi = layout.openMidiByString;
  const legend = 'Dots show where to press; numbers are fingers (1 index … 4 pinky, 0 open string).';

  return {
    id,
    name,
    kind: 'fretted',
    description,
    range: { minMidi: Math.min(...openPitches), maxMidi: Math.max(...openPitches) + maxFret },
    detector,
    layout,
    strings,

    placeNote: layout.placeNote,
    isPlayable: (note) => Boolean(note?.tab),
    serializePlacement: (note) => (note.tab ? { tab: { string: note.tab.string, fret: note.tab.fret } } : {}),
    annotatePiece: (notes) => assignFretFingers(notes),

    // Text helpers.
    shortLabel: (note) => (note?.tab ? String(note.tab.fret) : note?.note || ''),
    positionText: (note) => describePosition(note, layout),
    describeGroup: (note, group) => groupLabel(note, group),
    describeSlot: (note, group, emptyMessage) => ({
      summary: tabSummary(note, group),
      hint: note ? describePosition(note, layout) : emptyMessage,
      diagram: buildTabDiagram(group, strings),
    }),
    hintFor: (target, playedMidi, cents) => frettedHint(target, playedMidi, cents),

    // Note highway: one lane per string in tab order, fret numbers on the blocks.
    highwayLayout: () => ({
      lanes: strings.map((s) => ({ label: s.label })),
      laneOf: (note) => (note?.tab ? strings.findIndex((s) => s.string === note.tab.string) : -1),
      labelOf: (note) => (note?.tab ? String(note.tab.fret) : note?.note || ''),
    }),

    view: { title: 'Fretboard', legend },
    renderInstrumentView: (container, context) => renderFretboard(container, { ...context, layout, legend }),

    tuner: tunings ? { sets: tunings, defaultSet: defaultTuning } : null,

    importers: importTabs
      ? {
        text: {
          formatName: `${strings.length}-line ASCII tab system`,
          canParse: (text) => countTabLines(text) >= strings.length,
          parse: (text, options = {}) => parsePastedTab(text, { ...options, defaultOpenMidi }),
        },
        page: {
          defaultMsPerColumn: DEFAULT_TAB_MS_PER_COLUMN,
          parse: (htmlOrText, options = {}) => importTabPage(htmlOrText, { ...options, defaultOpenMidi }),
        },
      }
      : {},
  };
}
