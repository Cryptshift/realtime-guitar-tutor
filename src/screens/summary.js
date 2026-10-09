// End-of-run summary: how it went, what was tricky, and one suggested next step.
import { app } from '../app/context.js';
import { HAND_NAMES } from '../piece.js';
import { h, iconEl } from '../ui/dom.js';

const percent = (value) => `${Math.round(value * 100)}%`;

export const summaryScreen = {
  mount(container) {
    const run = app.lastRun;
    const song = run ? app.library.get(run.songId) : null;
    if (!run || !song) {
      app.go('library');
      return null;
    }
    const { summary } = run;
    const practiceHref = `#/practice/${encodeURIComponent(song.id)}`;

    const stars = h('span', { class: 'stars', role: 'img', 'aria-label': `${summary.stars} of 3 stars` });
    for (let i = 0; i < 3; i += 1) stars.append(iconEl(i < summary.stars ? 'star' : 'starOutline', i < summary.stars ? '' : 'is-empty'));

    const headline = summary.accuracy >= 0.9 ? 'Excellent' : summary.accuracy >= 0.75 ? 'Good run' : summary.accuracy >= 0.5 ? 'Getting there' : 'Keep practising';
    const hero = h('div', { class: 'score-hero' },
      h('p', { class: 'muted' }, song.title, run.loop ? ' · loop' : '', run.hands && run.hands !== 'both' ? ` · ${HAND_NAMES[run.hands].toLowerCase()} only` : ''),
      h('h1', {}, headline),
      stars,
      h('div', { class: 'big-number', 'aria-label': `${percent(summary.accuracy)} of notes correct` }, percent(summary.accuracy)),
      h('p', { class: 'muted' }, `${summary.hits} of ${summary.notes} notes correct`),
      run.isNewBest ? h('p', { class: 'badge' }, iconEl('star'), 'New personal best') : null);

    // Both hands: accuracy per hand, the weaker one marked with a shape as well as words.
    const byHand = summary.byHand;
    const weaker = byHand && byHand.L.accuracy !== byHand.R.accuracy ? (byHand.L.accuracy < byHand.R.accuracy ? 'L' : 'R') : null;
    const handStats = byHand
      ? h('div', { class: 'stat-row hand-stats', role: 'group', 'aria-label': 'Accuracy per hand' }, ...['R', 'L'].map((hand) => h('div', { class: `stat${hand === weaker ? ' is-weaker' : ''}` },
        h('span', { class: 'label' }, HAND_NAMES[hand]),
        h('span', { class: 'value' }, percent(byHand[hand].accuracy)),
        h('span', { class: 'muted' }, `${byHand[hand].hits} of ${byHand[hand].notes} notes`, hand === weaker ? ' · needs work' : ''))))
      : null;

    const stats = h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Mode'), h('span', { class: 'value' }, run.mode === 'play' ? 'Play along' : 'Wait for me')),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Tempo'), h('span', { class: 'value' }, `${run.tempoPercent}%`)),
      summary.timing !== null
        ? h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Timing'), h('span', { class: 'value' }, percent(summary.timing)), summary.tendency ? h('span', { class: 'muted' }, summary.tendency) : null)
        : null,
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Best streak'), h('span', { class: 'value' }, String(run.bestStreak || 0))));

    const tricky = summary.trickyNotes.length
      ? h('section', { class: 'card', 'aria-labelledby': 'trickyTitle' },
        h('h2', { id: 'trickyTitle' }, 'Trickiest notes'),
        h('ul', { class: 'tricky-list' }, ...summary.trickyNotes.map((item) => h('li', { class: 'badge' },
          iconEl('cross'), `${item.label} · ${item.count} ${item.count === 1 ? 'mistake' : 'mistakes'}`))))
      : h('section', { class: 'card' }, h('p', {}, iconEl('check'), ' No mistakes.'));

    const actions = h('div', { class: 'summary-actions' });
    if (summary.trickyBar) {
      actions.append(h('button', {
        class: 'btn btn-primary btn-lg',
        type: 'button',
        onclick: () => {
          app.pendingPractice = {
            songId: song.id, loop: summary.trickyBar.loop, tempoPercent: summary.trickyBar.tempoPercent, mode: 'wait', hands: run.hands || null,
          };
          app.go(`practice/${encodeURIComponent(song.id)}`);
        },
      }, iconEl('loop'), `Practice the tricky part (bar ${summary.trickyBar.bar}, ${summary.trickyBar.tempoPercent}%)`));
    }
    const suggestion = summary.suggestion;
    actions.append(h('button', {
      class: summary.trickyBar ? 'btn btn-lg' : 'btn btn-primary btn-lg',
      type: 'button',
      onclick: () => {
        app.pendingPractice = {
          songId: song.id,
          mode: suggestion.mode || run.mode,
          tempoPercent: suggestion.tempoPercent || run.tempoPercent,
          loop: suggestion.loop || null,
          hands: suggestion.hands || run.hands || null,
        };
        app.go(`practice/${encodeURIComponent(song.id)}`);
      },
    }, iconEl('play'), suggestion.hands && suggestion.hands !== 'both' ? `Practise the ${HAND_NAMES[suggestion.hands].toLowerCase()}` : 'Next step'));
    actions.append(h('a', { class: 'btn btn-lg', href: practiceHref }, iconEl('restart'), 'Play again'));
    actions.append(h('a', { class: 'btn btn-ghost btn-lg', href: '#/library' }, iconEl('library'), 'Library'));

    container.append(h('section', { class: 'summary', 'aria-labelledby': 'summaryTitle' },
      hero,
      h('section', { class: 'card', 'aria-label': 'Suggested next step' },
        h('h2', {}, 'Next step'),
        h('p', { style: { fontSize: '20px', marginTop: '8px' } }, suggestion.text)),
      handStats,
      stats,
      tricky,
      actions));
    hero.querySelector('h1').id = 'summaryTitle';
    return null;
  },
};
