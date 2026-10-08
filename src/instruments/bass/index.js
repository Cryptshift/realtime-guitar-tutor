// Four-string bass guitar (E1 A1 D2 G2).
import { createFrettedInstrument } from '../fretted/index.js';

export const bass = createFrettedInstrument({
  id: 'bass',
  name: 'Bass',
  description: 'Four strings, standard tuning',
  strings: [
    { string: 1, label: 'G', display: 'G (1st)', openMidi: 43 },
    { string: 2, label: 'D', display: 'D (2nd)', openMidi: 38 },
    { string: 3, label: 'A', display: 'A (3rd)', openMidi: 33 },
    { string: 4, label: 'E', display: 'Low E (4th)', openMidi: 28 },
  ],
  maxFret: 24,
  beginnerMaxFret: 12,
  // Low E is ~41 Hz (drop D ~37 Hz): a longer window keeps two periods in view.
  detector: { minHz: 34, maxHz: 500, frameSize: 4096 },
  tunings: {
    standard: { label: 'Standard (E A D G)', notes: ['E1', 'A1', 'D2', 'G2'] },
    drop_d: { label: 'Drop D (D A D G)', notes: ['D1', 'A1', 'D2', 'G2'] },
  },
  defaultTuning: 'standard',
});
