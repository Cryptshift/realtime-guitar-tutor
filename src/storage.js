// Local persistence (settings, user songs, scores, history). Everything is wrapped in
// try/catch: private windows, quota errors or disabled storage just fall back to defaults.

const PREFIX = 'rgt.';
const HISTORY_LIMIT = 20;

export const DEFAULT_SETTINGS = Object.freeze({
  onboarded: false,
  instrument: 'guitar',
  inputSource: 'mic',
  micDeviceId: null,
  midiDeviceId: null,
  latencyMs: 0,
  theme: 'system',
  leftHanded: false,
  showKeyLabels: true,
  guideTone: false,
  guideToneVolume: 30,
  backingVolume: 80,
  metronome: false,
  countIn: true,
  simplifyChords: true,
  requireFullShape: true,
  defaultMode: 'wait',
  defaultTempo: 70,
});

export function createStore(storage = globalThis.localStorage) {
  const read = (key, fallback) => {
    try {
      const raw = storage?.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      storage?.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  return {
    loadSettings: () => ({ ...DEFAULT_SETTINGS, ...read('settings', {}) }),
    saveSettings: (settings) => write('settings', settings),

    loadUserSongs: () => {
      const songs = read('songs', []);
      return Array.isArray(songs) ? songs : [];
    },
    saveUserSong(song) {
      const songs = this.loadUserSongs().filter((existing) => existing.id !== song.id);
      songs.unshift(song);
      return write('songs', songs);
    },
    deleteUserSong(id) {
      const prefs = read('songPrefs', {});
      if (prefs && prefs[id]) {
        delete prefs[id];
        write('songPrefs', prefs);
      }
      return write('songs', this.loadUserSongs().filter((song) => song.id !== id));
    },

    // Per-song practice choices, e.g. { hands: 'R' | 'L' | 'both' } on two-handed pieces.
    loadSongPrefs(songId) {
      const prefs = read('songPrefs', {});
      return (prefs && typeof prefs === 'object' && prefs[songId]) || {};
    },
    saveSongPrefs(songId, patch) {
      const prefs = read('songPrefs', {});
      const all = prefs && typeof prefs === 'object' ? prefs : {};
      all[songId] = { ...(all[songId] || {}), ...patch };
      return write('songPrefs', all);
    },

    loadProgress: () => {
      const progress = read('progress', {});
      return { songs: progress.songs || {}, lastPlayed: progress.lastPlayed || null };
    },
    // Saves one finished run; returns { isNewBest, best }. A run with one hand of a
    // two-handed piece (run.hands 'R' or 'L') goes into the history but can't be the best.
    recordRun(songId, run) {
      const progress = this.loadProgress();
      const entry = progress.songs[songId] || { plays: 0, best: null, history: [] };
      entry.plays += 1;
      entry.history = [{ ...run, at: run.at || Date.now() }, ...entry.history].slice(0, HISTORY_LIMIT);
      const oneHand = run.hands === 'R' || run.hands === 'L';
      const isNewBest = !oneHand && (!entry.best || run.accuracy > entry.best.accuracy
        || (run.accuracy === entry.best.accuracy && (run.tempoPercent || 0) > (entry.best.tempoPercent || 0)));
      if (isNewBest) entry.best = { ...run };
      progress.songs[songId] = entry;
      write('progress', progress);
      return { isNewBest, best: entry.best };
    },
    setLastPlayed(lastPlayed) {
      const progress = this.loadProgress();
      progress.lastPlayed = lastPlayed ? { ...lastPlayed, at: Date.now() } : null;
      return write('progress', progress);
    },
  };
}

export const store = createStore();
