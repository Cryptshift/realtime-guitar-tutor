// Guitar strings, playable fret range and string/fret positions for a pitch.
export const MAX_FRET_FOR_BEGINNER_TAB = 15;

export const GUITAR_STRINGS = [
  { string: 1, label: 'e', display: 'High e (1st)', openMidi: 64 },
  { string: 2, label: 'B', display: 'B (2nd)', openMidi: 59 },
  { string: 3, label: 'G', display: 'G (3rd)', openMidi: 55 },
  { string: 4, label: 'D', display: 'D (4th)', openMidi: 50 },
  { string: 5, label: 'A', display: 'A (5th)', openMidi: 45 },
  { string: 6, label: 'E', display: 'Low E (6th)', openMidi: 40 },
];

export const DEFAULT_OPEN_MIDI_BY_STRING = GUITAR_STRINGS.reduce((acc, guitarString) => {
  acc[guitarString.string] = guitarString.openMidi;
  return acc;
}, {});

export function isValidTab(tab) {
  return (
    tab
    && Number.isInteger(tab.string)
    && Number.isInteger(tab.fret)
    && tab.string >= 1
    && tab.string <= 6
    && tab.fret >= 0
    && tab.fret <= 24
  );
}

export function tabPositionsForMidi(midi, maxFret = MAX_FRET_FOR_BEGINNER_TAB) {
  const absoluteMaxFret = 24;
  const allPositions = GUITAR_STRINGS.map((guitarString) => {
    const fret = midi - guitarString.openMidi;
    if (fret < 0 || fret > absoluteMaxFret) {
      return null;
    }
    return {
      string: guitarString.string,
      fret,
      label: guitarString.label,
      display: guitarString.display,
      isExtended: fret > maxFret,
    };
  })
    .filter(Boolean)
    .sort((a, b) => a.fret - b.fret || b.string - a.string);

  const beginnerPositions = allPositions.filter((position) => !position.isExtended);
  return beginnerPositions.length > 0 ? beginnerPositions : allPositions;
}
