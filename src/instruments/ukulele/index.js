// Soprano/concert/tenor ukulele in re-entrant standard tuning: G4 C4 E4 A4. String 4 (G)
// is the high G, so it is *higher* than string 3 (C); positions are worked out per string.
import { createFrettedInstrument } from '../fretted/index.js';

export const ukulele = createFrettedInstrument({
  id: 'ukulele',
  name: 'Ukulele',
  description: 'Four strings, G C E A (high G)',
  strings: [
    { string: 1, label: 'A', display: 'A (1st)', openMidi: 69 },
    { string: 2, label: 'E', display: 'E (2nd)', openMidi: 64 },
    { string: 3, label: 'C', display: 'C (3rd)', openMidi: 60 },
    { string: 4, label: 'G', display: 'High G (4th)', openMidi: 67 },
  ],
  maxFret: 15,
  beginnerMaxFret: 12,
  detector: { minHz: 150, maxHz: 1600, frameSize: 2048 },
  tunings: {
    standard: { label: 'Standard (G C E A, high G)', notes: ['G4', 'C4', 'E4', 'A4'] },
    low_g: { label: 'Low G (G C E A)', notes: ['G3', 'C4', 'E4', 'A4'] },
  },
  defaultTuning: 'standard',
});
