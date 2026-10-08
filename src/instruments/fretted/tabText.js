// Short text for fretted notes/shapes: highway labels, tab-style summaries and the
// small ASCII diagram, for any string count.

export function placedNotes(group) {
  return (group || [])
    .filter((note) => note?.tab)
    .sort((a, b) => b.tab.string - a.tab.string || a.tab.fret - b.tab.fret);
}

export function formatGroupTargets(group) {
  const placed = placedNotes(group);
  if (!placed.length) return '--';
  return placed.map((note) => `S${note.tab.string} F${note.tab.fret}`).join(' + ');
}

export function tabSummary(note, group = [note]) {
  if (!note) return '--';
  const placed = placedNotes(group);
  if (!placed.length) return note.note || '--';
  if (placed.length === 1) {
    const one = placed[0];
    return `${one.note} · S${one.tab.string} F${one.tab.fret}`;
  }
  return `${placed.length}-string shape · ${formatGroupTargets(placed)}`;
}

export function groupLabel(note, group = [note]) {
  if (!note) return '--';
  const placed = placedNotes(group);
  if (!placed.length) return note.note || '--';
  if (placed.length === 1) {
    const one = placed[0];
    return `S${one.tab.string} F${one.tab.fret} (${one.note})`;
  }
  return `Press together: ${formatGroupTargets(placed)}`;
}

export function buildTabDiagram(group, strings) {
  const markerByString = new Map();
  placedNotes(group).forEach((note) => {
    const marker = String(note.tab.fret);
    const previous = markerByString.get(note.tab.string);
    markerByString.set(note.tab.string, previous ? `${previous}/${marker}` : marker);
  });
  return strings
    .map((info) => {
      const marker = markerByString.get(info.string) || '-';
      const padded = marker.length >= 2 ? marker : marker.padStart(2, '-').padEnd(2, '-');
      return `${info.label}|--${padded}--|`;
    })
    .join('\n');
}
