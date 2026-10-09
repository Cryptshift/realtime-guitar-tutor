// Your own MIDI files, kept on your machine: any .mid / .midi file in my-songs/ (at the
// project root) shows up in the library when the app runs locally (npm run dev). The folder
// is git-ignored, so the files are never committed, and the GitHub Pages build (made from a
// fresh checkout) never sees them. A local `npm run build` would bundle them.
//
// Each file goes through the MIDI importer as a piano piece with both hands assigned
// automatically (tracks by pitch, or a one-track file split by pitch).
import { parseMidiFile } from '../import/midiFile.js';
import { midiToHandsPiece, planHands } from '../import/midiHands.js';

// Lazy URL loaders, keyed by path ('/my-songs/moonlight-sonata.mid'). A missing or empty folder
// gives an empty object.
const FILES = import.meta.glob('/my-songs/*.{mid,midi,MID,MIDI}', { query: '?url', import: 'default' });

const fileName = (path) => path.split('/').pop();

// "moonlight-sonata.mid" -> "Moonlight Sonata".
export function titleFromFileName(path) {
  const words = fileName(path).replace(/\.midi?$/i, '').split(/[-_\s.]+/).filter(Boolean);
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ') || 'Untitled';
}

export function localSongId(path) {
  const slug = fileName(path).replace(/\.midi?$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `local-${slug || 'song'}`;
}

// A library song from a MIDI file's bytes.
export function songFromMidi(bytes, path) {
  const parsed = parseMidiFile(bytes);
  const plan = planHands(parsed);
  const title = titleFromFileName(path);
  return {
    id: localSongId(path),
    title,
    instrument: 'piano',
    difficulty: 'custom',
    source: 'local-file',
    local: true,
    file: fileName(path),
    piece: midiToHandsPiece(parsed, { assignments: plan.assignments, quantize: '1/16', name: title }),
  };
}

// Loads every file in my-songs/. A file that can't be read is skipped (with a console note).
export async function loadLocalSongs({ files = FILES, fetchFile = (url) => fetch(url) } = {}) {
  const songs = [];
  for (const [path, loadUrl] of Object.entries(files)) {
    try {
      const url = await loadUrl();
      const response = await fetchFile(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const song = songFromMidi(new Uint8Array(await response.arrayBuffer()), path);
      // "song.mid" and "song.midi" would share an id: keep both.
      while (songs.some((other) => other.id === song.id)) song.id = `${song.id}-2`;
      songs.push(song);
    } catch (error) {
      console.warn(`my-songs: skipped ${fileName(path)} (${error.message})`);
    }
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title));
}
