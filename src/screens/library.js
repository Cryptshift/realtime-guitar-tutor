// Library: continue where you left off, filter by instrument/difficulty, pick a song,
// or add one (one dialog for every import path).
import { app } from '../app/context.js';
import { getInstrument, listInstruments } from '../instruments/index.js';
import { DIFFICULTY_LABELS } from '../songs/catalog.js';
import { formatDuration, h, iconEl } from '../ui/dom.js';
import { INSTRUMENT_ICONS } from '../ui/icons.js';
import { openAddSongDialog } from './addSong.js';

const MODE_LABELS = { wait: 'Wait for me', play: 'Play along' };

function starsEl(count, label) {
  const stars = h('span', { class: 'stars', role: 'img', 'aria-label': label });
  for (let i = 0; i < 3; i += 1) stars.append(iconEl(i < count ? 'star' : 'starOutline', i < count ? '' : 'is-empty'));
  return stars;
}

export const libraryScreen = {
  mount(container) {
    const filter = {
      instrument: app.library.all().some((song) => song.instrument === app.settings.instrument) ? app.settings.instrument : 'all',
      difficulty: 'all',
    };

    const heading = h('h1', {}, 'Your songs');
    const addBtn = h('button', { class: 'btn', type: 'button', onclick: () => openAddSongDialog({ onAdded: render }) }, iconEl('plus'), 'Add a song');
    const head = h('div', { class: 'screen-head' }, heading, addBtn);

    const continueSlot = h('div');
    const instrumentChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Instrument' });
    const difficultySelect = h('select', { id: 'difficultyFilter', 'aria-label': 'Difficulty' },
      h('option', { value: 'all' }, 'Any level'),
      ...Object.entries({ ...DIFFICULTY_LABELS, custom: 'My songs' }).map(([value, label]) => h('option', { value }, label)));
    difficultySelect.addEventListener('change', () => {
      filter.difficulty = difficultySelect.value;
      renderGrid();
    });
    const filters = h('div', { class: 'filters' }, instrumentChips, difficultySelect);
    const grid = h('ul', { class: 'song-grid', 'aria-label': 'Songs' });
    container.append(h('section', { 'aria-labelledby': 'libraryTitle' }, head, continueSlot, filters, grid));
    heading.id = 'libraryTitle';

    function renderChips() {
      const options = [{ id: 'all', name: 'All' }, ...listInstruments()];
      instrumentChips.replaceChildren(...options.map((option) => h('button', {
        class: 'chip',
        type: 'button',
        role: 'radio',
        'aria-checked': String(filter.instrument === option.id),
        onclick: () => {
          filter.instrument = option.id;
          renderChips();
          renderGrid();
        },
      }, option.id !== 'all' ? iconEl(INSTRUMENT_ICONS[option.id]) : null, option.name)));
    }

    function renderContinue() {
      const progress = app.store.loadProgress();
      const last = progress.lastPlayed;
      const song = last ? app.library.get(last.songId) : null;
      continueSlot.replaceChildren();
      if (!song) return;
      const instrument = getInstrument(song.instrument);
      continueSlot.append(h('div', { class: 'card continue-card' },
        h('div', {},
          h('p', { class: 'muted' }, 'Continue where you left off'),
          h('h2', {}, song.title),
          h('p', { class: 'song-meta' }, iconEl(INSTRUMENT_ICONS[instrument.id]),
            h('span', {}, [instrument.name, MODE_LABELS[last.mode] || 'Wait for me', `${last.tempoPercent || 70}% tempo`].join(' · ')))),
        h('a', { class: 'btn btn-primary btn-lg', href: `#/practice/${encodeURIComponent(song.id)}` }, iconEl('play'), 'Resume')));
    }

    function renderGrid() {
      const progress = app.store.loadProgress();
      const songs = app.library.all().filter((song) => (filter.instrument === 'all' || song.instrument === filter.instrument)
        && (filter.difficulty === 'all' || song.difficulty === filter.difficulty));
      grid.replaceChildren();
      if (!songs.length) {
        grid.append(h('li', { class: 'empty-state' },
          iconEl('library'),
          h('p', {}, 'No songs match these filters yet.'),
          h('button', { class: 'btn', type: 'button', onclick: () => openAddSongDialog({ onAdded: render }) }, iconEl('plus'), 'Add a song')));
        return;
      }
      songs.forEach((song) => {
        const instrument = getInstrument(song.instrument);
        const piece = app.library.piece(song);
        const best = progress.songs[song.id]?.best;
        const stars = best ? best.stars : 0;
        const titleId = `song-${song.id}`;
        const card = h('li', { class: 'song-card' },
          h('h3', { id: titleId }, h('a', { href: `#/practice/${encodeURIComponent(song.id)}` }, song.title)),
          h('p', { class: 'song-meta' },
            h('span', { class: 'badge' }, iconEl(INSTRUMENT_ICONS[instrument.id]), instrument.name),
            h('span', {}, DIFFICULTY_LABELS[song.difficulty] || 'My song'),
            h('span', {}, formatDuration(piece.totalDuration))),
          h('p', { class: 'song-meta' },
            starsEl(stars, best ? `Best: ${stars} of 3 stars, ${Math.round(best.accuracy * 100)}%` : 'Not played yet'),
            h('span', {}, best ? `Best ${Math.round(best.accuracy * 100)}%` : 'New')));
        if (!song.builtIn) {
          card.append(h('div', { class: 'card-actions' }, h('button', {
            class: 'btn btn-ghost btn-danger',
            type: 'button',
            'aria-label': `Remove ${song.title}`,
            onclick: () => {
              if (window.confirm(`Remove "${song.title}" from your library?`)) {
                app.library.remove(song.id);
                app.toast(`Removed ${song.title}`);
                render();
              }
            },
          }, iconEl('trash'), 'Remove')));
        }
        grid.append(card);
      });
    }

    function render() {
      renderChips();
      renderContinue();
      renderGrid();
    }
    render();
    return null;
  },
};
