// Inline SVG icons (24x24, 2px strokes, currentColor), drawn for this app.
const PATHS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
  down: '<path d="M12 5v14M5.5 12.5L12 19l6.5-6.5"/>',
  left: '<path d="M19 12H5M11.5 5.5L5 12l6.5 6.5"/>',
  right: '<path d="M5 12h14M12.5 5.5L19 12l-6.5 6.5"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  hold: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
  library: '<rect x="3.5" y="4" width="5" height="16" rx="1"/><rect x="10.5" y="4" width="5" height="16" rx="1"/><path d="M17.5 5.2l3.6 14.1"/>',
  tuner: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/><circle cx="12" cy="17" r="1.4" fill="currentColor"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  midi: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v7M12 6v7M16 6v7"/>',
  metronome: '<path d="M9 3h6l3.5 18h-13z"/><path d="M12 15l5-9"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronDown: '<path d="M5 9l7 7 7-7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.6v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" fill="currentColor"/>',
  starOutline: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  text: '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><circle cx="10" cy="16" r="2"/><path d="M12 16V9.5l3 1"/>',
  wave: '<path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  guitar: '<path d="M19 3l2 2-6.5 6.5"/><circle cx="9" cy="15" r="5.5"/><circle cx="9" cy="15" r="1.4" fill="currentColor"/><path d="M14.5 9.5l-2 2"/>',
  bass: '<path d="M20 2.5l1.5 1.5L14 11.5"/><path d="M14 11.5a5.5 5.5 0 1 1-4-1.8z"/><path d="M8 14l3 3"/>',
  ukulele: '<path d="M18.5 3.5l2 2-5.5 5.5"/><circle cx="10" cy="14" r="4.5"/><circle cx="10" cy="14" r="1.2" fill="currentColor"/>',
  piano: '<rect x="2.5" y="5" width="19" height="14" rx="1.5"/><path d="M7.5 5v14M12 5v14M16.5 5v14"/><rect x="6" y="5" width="3" height="8" fill="currentColor" stroke="none"/><rect x="15" y="5" width="3" height="8" fill="currentColor" stroke="none"/>',
  loop: '<path d="M7 7h10a4 4 0 0 1 0 8h-1"/><path d="M17 17H7a4 4 0 0 1 0-8h1"/><path d="M14 13l2 2-2 2M10 11L8 9l2-2"/>',
  tilde: '<path d="M3.5 13.5c1.6-3 3.6-4 5.5-3s3.4 3 5.5 3 3.4-1.4 6-4"/>',
  upload: '<path d="M12 16V4M6.5 9.5L12 4l5.5 5.5M4 20h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".7" fill="currentColor"/>',
};

export function icon(name) {
  const body = PATHS[name] || PATHS.info;
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;
}

export const INSTRUMENT_ICONS = { guitar: 'guitar', bass: 'bass', ukulele: 'ukulele', piano: 'piano' };
