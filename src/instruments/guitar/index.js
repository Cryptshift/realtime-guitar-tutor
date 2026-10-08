// Six-string guitar in standard tuning (alternate tunings available in the tuner).
import { createFrettedInstrument } from '../fretted/index.js';

export const guitar = createFrettedInstrument({
  id: 'guitar',
  name: 'Guitar',
  description: 'Six strings, standard tuning',
  strings: [
    { string: 1, label: 'e', display: 'High e (1st)', openMidi: 64 },
    { string: 2, label: 'B', display: 'B (2nd)', openMidi: 59 },
    { string: 3, label: 'G', display: 'G (3rd)', openMidi: 55 },
    { string: 4, label: 'D', display: 'D (4th)', openMidi: 50 },
    { string: 5, label: 'A', display: 'A (5th)', openMidi: 45 },
    { string: 6, label: 'E', display: 'Low E (6th)', openMidi: 40 },
  ],
  maxFret: 24,
  beginnerMaxFret: 15,
  // Fundamentals from drop tunings (D2 ~73 Hz) to the 24th fret of the high e (~1319 Hz).
  detector: { minHz: 60, maxHz: 1400, frameSize: 2048 },
  tunings: {
    standard: { label: 'Standard (E A D G B E)', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    drop_d: { label: 'Drop D (D A D G B E)', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    d_standard: { label: 'D Standard (D G C F A D)', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
    open_g: { label: 'Open G (D G D G B D)', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  },
  defaultTuning: 'standard',
});
