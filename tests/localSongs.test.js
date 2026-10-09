// The private my-songs/ folder, with synthetic MIDI files and a fake fetch.
import { describe, expect, it, vi } from 'vitest';
import { createLibrary } from '../src/app/library.js';
import { loadLocalSongs, localSongId, titleFromFileName } from '../src/app/localSongs.js';
import { isTwoHanded } from '../src/piece.js';
import { createStore } from '../src/storage.js';
import { trackFromNotes, writeMidi } from './helpers/midiWriter.js';

const Q = 480;
function twoHandFile() {
  const n = (midi, beat, beats = 1) => ({ midi, start: beat * Q, length: beats * Q });
  return writeMidi({
    ticksPerQuarter: Q,
    tracks: [
      trackFromNotes({ name: 'Upper', tempo: 80, notes: [n(72, 0), n(74, 1), n(76, 2), n(77, 3)] }),
      trackFromNotes({ name: 'Lower', notes: [n(48, 0, 2), n(43, 2, 2)] }),
    ],
  });
}

const files = (paths) => Object.fromEntries(paths.map((path) => [path, async () => `/@fs${path}`]));
const fakeFetch = (bodies) => vi.fn(async (url) => {
  const body = bodies[url.replace('/@fs', '')];
  return body ? { ok: true, arrayBuffer: async () => body.buffer } : { ok: false, status: 404 };
});

describe('my-songs folder', () => {
  it('titles songs from their file names', () => {
    expect(titleFromFileName('/my-songs/wet-hands.mid')).toBe('Wet Hands');
    expect(titleFromFileName('/my-songs/my_song two.MIDI')).toBe('My Song Two');
    expect(localSongId('/my-songs/Wet Hands!.mid')).toBe('local-wet-hands');
  });

  it('turns each file into a two-handed piano song in "My songs"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const songs = await loadLocalSongs({
      files: files(['/my-songs/study-in-c.mid', '/my-songs/broken.mid', '/my-songs/study-in-c.midi']),
      fetchFile: fakeFetch({ '/my-songs/study-in-c.mid': twoHandFile(), '/my-songs/study-in-c.midi': twoHandFile(), '/my-songs/broken.mid': new Uint8Array([1, 2, 3]) }),
    });
    expect(songs.map((s) => s.id)).toEqual(['local-study-in-c', 'local-study-in-c-2']);
    expect(songs[0]).toMatchObject({ title: 'Study In C', instrument: 'piano', difficulty: 'custom', local: true, file: 'study-in-c.mid' });
    expect(songs[0].piece.notes.every((note) => note.hand === 'R' || note.hand === 'L')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken.mid'));
    warn.mockRestore();

    const data = new Map();
    const library = createLibrary(createStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }));
    library.setLocalSongs(songs);
    expect(library.get('local-study-in-c').title).toBe('Study In C');
    const piece = library.piece(library.get('local-study-in-c'));
    expect(isTwoHanded(piece)).toBe(true);
    expect(piece.bpm).toBe(80);
  });

  it('gives nothing for an empty folder', async () => {
    expect(await loadLocalSongs({ files: {} })).toEqual([]);
  });
});
