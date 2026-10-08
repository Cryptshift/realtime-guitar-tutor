// The guitar instrument: everything guitar-specific that generic code reaches through the
// instrument interface (see ../index.js).
import { renderFretboardView } from './fretboard.js';
import { importTabPage } from './pageImport.js';
import { placeGuitarNote } from './strings.js';
import { DEFAULT_TAB_MS_PER_COLUMN, countTabLines, parsePastedTab } from './tabParser.js';
import { buildTabDiagram, planStepLabel, tabHintText, tabSummary } from './tabView.js';
import { TUNING_SETS } from './tuning.js';

export const guitar = {
  id: 'guitar',
  name: 'Guitar',
  // Standard tuning, open low E (E2) to the 24th fret of the high e (E6).
  range: { minMidi: 40, maxMidi: 88 },
  // Pitch-detector hints: fundamentals from drop tunings (D2 ~73 Hz) to E6 (~1319 Hz).
  detector: { minHz: 60, maxHz: 1400, frameSize: 2048 },

  placeNote: placeGuitarNote,
  isPlayable: (note) => Boolean(note?.tab),
  serializePlacement: (note) => ({ tab: note.tab }),

  // Short label for a note/chord group (timeline markers).
  describeGroup: (note, group) => planStepLabel(note, group),
  // Text for the previous/current/next slots.
  describeSlot: (note, group, emptyMessage) => ({
    summary: tabSummary(note, group),
    hint: tabHintText(note, group, emptyMessage),
    diagram: buildTabDiagram(group),
  }),

  view: {
    title: 'Finger Placement',
    legend: 'Finger numbers are suggested (1=index ... 4=pinky).',
  },
  renderInstrumentView: renderFretboardView,

  tuner: { sets: TUNING_SETS, defaultSet: 'standard' },

  importers: {
    // Plain text pasted into the custom piece box.
    text: {
      formatName: '6-line ASCII tab system',
      canParse: (text) => countTabLines(text) >= 6,
      parse: parsePastedTab,
    },
    // A fetched web page.
    page: {
      defaultMsPerColumn: DEFAULT_TAB_MS_PER_COLUMN,
      parse: importTabPage,
    },
  },
};
