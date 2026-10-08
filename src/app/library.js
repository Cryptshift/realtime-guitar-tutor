// The song library: built-in songs plus songs the learner added (stored locally).
import { getInstrument } from '../instruments/index.js';
import { normalizePiece, toPieceSnapshot } from '../piece.js';
import { BUILT_IN_SONGS } from '../songs/catalog.js';

export function createLibrary(store) {
  const cache = new Map();

  const all = () => [...store.loadUserSongs(), ...BUILT_IN_SONGS];

  return {
    all,
    get(id) {
      return all().find((song) => song.id === id) || null;
    },
    // The song's piece normalized for its instrument (cached per song).
    piece(song) {
      const key = `${song.id}:${song.updatedAt || ''}`;
      if (!cache.has(key)) cache.set(key, normalizePiece(song.piece, getInstrument(song.instrument)));
      return cache.get(key);
    },
    add({ title, instrument, piece, source = 'custom' }) {
      const normalized = normalizePiece({ ...piece, name: title }, getInstrument(instrument));
      const song = {
        id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: title || normalized.name,
        instrument,
        difficulty: 'custom',
        source,
        createdAt: Date.now(),
        piece: toPieceSnapshot(normalized, getInstrument(instrument)),
      };
      store.saveUserSong(song);
      return song;
    },
    remove(id) {
      store.deleteUserSong(id);
    },
  };
}
