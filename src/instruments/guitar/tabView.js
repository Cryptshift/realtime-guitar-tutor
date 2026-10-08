// Guitar tab text for the previous/current/next slots and timeline labels.
import { GUITAR_STRINGS, MAX_FRET_FOR_BEGINNER_TAB } from './strings.js';

export function tabbedNotesFromGroup(groupNotes) {
  return groupNotes
    .filter((note) => note?.tab)
    .sort((a, b) => b.tab.string - a.tab.string || a.tab.fret - b.tab.fret);
}

export function formatGroupTargets(groupNotes) {
  const tabbed = tabbedNotesFromGroup(groupNotes);
  if (!tabbed.length) return '--';
  return tabbed.map((note) => `S${note.tab.string} F${note.tab.fret}`).join(' + ');
}

export function buildTabDiagram(groupNotes) {
  const markerByString = new Map();
  tabbedNotesFromGroup(groupNotes).forEach((note) => {
    const key = note.tab.string;
    const marker = String(note.tab.fret);
    if (markerByString.has(key)) {
      markerByString.set(key, `${markerByString.get(key)}/${marker}`);
    } else {
      markerByString.set(key, marker);
    }
  });

  const diagramRows = GUITAR_STRINGS.map((guitarString) => {
    const marker = markerByString.get(guitarString.string) || '-';
    const padded = marker.length >= 2 ? marker : marker.padStart(2, '-').padEnd(2, '-');
    return `${guitarString.label}|--${padded}--|`;
  });

  return diagramRows.join('\n');
}

export function tabSummary(note, group = [note]) {
  if (!note) return '--';
  const tabbed = tabbedNotesFromGroup(group);
  if (!tabbed.length) {
    return note.note || '--';
  }
  if (tabbed.length === 1) {
    const one = tabbed[0];
    return `${one.note} · S${one.tab.string} F${one.tab.fret}`;
  }
  return `${tabbed.length}-string shape · ${formatGroupTargets(tabbed)}`;
}

export function planStepLabel(note, group = [note]) {
  if (!note) return '--';
  const tabbed = tabbedNotesFromGroup(group);
  if (!tabbed.length) return note.note || '--';
  if (tabbed.length === 1) {
    const one = tabbed[0];
    return `S${one.tab.string} F${one.tab.fret} (${one.note})`;
  }
  return `Press together: ${formatGroupTargets(tabbed)}`;
}

export function tabHintText(note, group, emptyMessage) {
  if (!note) return emptyMessage;
  const tabbed = tabbedNotesFromGroup(group);
  if (!tabbed.length) return 'No mapped fret position for this note.';

  if (tabbed.length > 1) {
    return `Press together: ${formatGroupTargets(tabbed)}`;
  }

  const primary = tabbed[0];
  const tabString = GUITAR_STRINGS.find((guitarString) => guitarString.string === primary.tab.string);
  const alternate = primary.tabAlternatives.filter(
    (position) => position.string !== primary.tab.string || position.fret !== primary.tab.fret,
  );
  const rangePrefix = primary.tab.isExtended ? `Above beginner range (>${MAX_FRET_FOR_BEGINNER_TAB} frets). ` : '';
  const chordPrefix = primary.tab.isChordTone ? `Chord tone ${primary.tab.chordIndex + 1}/${primary.tab.chordSize}. ` : '';

  return alternate.length
    ? `${rangePrefix}${chordPrefix}${tabString.display}. Alt: S${alternate[0].string} F${alternate[0].fret}`
    : `${rangePrefix}${chordPrefix}${tabString.display}.`;
}
