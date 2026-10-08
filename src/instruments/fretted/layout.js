// String/fret geometry shared by every fretted instrument (guitar, bass, ukulele).
// `strings` lists strings in tab order (string 1 = top tab line), each with its open pitch.
// Re-entrant tunings (ukulele's high G on string 4) work because positions are computed
// per string from its own open pitch, never by assuming pitch falls as the number rises.

export function createFretLayout({ strings, maxFret = 24, beginnerMaxFret = 15 }) {
  const stringCount = strings.length;
  const openMidiByString = Object.fromEntries(strings.map((s) => [s.string, s.openMidi]));
  const byNumber = new Map(strings.map((s) => [s.string, s]));

  function isValidTab(tab) {
    return Boolean(
      tab
      && Number.isInteger(tab.string)
      && Number.isInteger(tab.fret)
      && byNumber.has(tab.string)
      && tab.fret >= 0
      && tab.fret <= maxFret,
    );
  }

  // Every string/fret that sounds `midi`, easiest first: lowest fret, then the string with
  // the higher number (the thicker string on guitar/bass). Positions above the beginner
  // range are only returned when there is nothing lower.
  function positionsFor(midi) {
    const all = strings
      .map((s) => {
        const fret = midi - s.openMidi;
        if (fret < 0 || fret > maxFret) return null;
        return {
          string: s.string,
          fret,
          label: s.label,
          display: s.display,
          isExtended: fret > beginnerMaxFret,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.fret - b.fret || b.string - a.string);
    const comfortable = all.filter((position) => !position.isExtended);
    return comfortable.length ? comfortable : all;
  }

  // Note placement: a valid explicit `tab` from piece JSON wins, otherwise the easiest
  // position. Returns the fields merged into the normalized note.
  function placeNote(rawNote, midi) {
    const alternatives = positionsFor(midi);
    const explicit = rawNote?.tab;
    const tab = isValidTab(explicit)
      ? {
        string: explicit.string,
        fret: explicit.fret,
        isExtended: explicit.fret > beginnerMaxFret,
        chordSize: Number.isFinite(explicit.chordSize) ? explicit.chordSize : 1,
        chordIndex: Number.isFinite(explicit.chordIndex) ? explicit.chordIndex : 0,
        isChordTone: Boolean(explicit.isChordTone) || (Number.isFinite(explicit.chordSize) && explicit.chordSize > 1),
      }
      : alternatives[0] || null;
    return { tab, tabAlternatives: alternatives };
  }

  return {
    strings,
    stringCount,
    maxFret,
    beginnerMaxFret,
    openMidiByString,
    stringInfo: (number) => byNumber.get(number) || null,
    isValidTab,
    positionsFor,
    placeNote,
  };
}

// Suggested fretting-hand fingers (1 = index ... 4 = pinky; 0 = open string) for a whole
// piece. Notes that share a hand position get consecutive fingers: frets 1-4 use first
// position; higher frets use a position anchored at the lowest fret among nearby notes.
// Explicit `finger` values from the piece are kept.
export function assignFretFingers(notes, { window = 4 } = {}) {
  notes.forEach((note, index) => {
    if (!note.tab || Number.isInteger(note.finger)) return;
    const { fret } = note.tab;
    if (fret === 0) {
      note.finger = 0;
      return;
    }
    if (fret <= 4) {
      note.finger = fret;
      return;
    }
    let lowest = fret;
    for (let i = Math.max(0, index - window); i <= Math.min(notes.length - 1, index + window); i += 1) {
      const neighbour = notes[i].tab?.fret;
      if (neighbour > 0 && fret - neighbour < 4 && neighbour < lowest) lowest = neighbour;
    }
    note.finger = Math.max(1, Math.min(4, fret - lowest + 1));
  });
  return notes;
}
