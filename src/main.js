// Entry point: app shell (header, theme, navigation) and the screen router.
// Self-hosted fonts (bundled by Vite, so they also work offline and on GitHub Pages).
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import { app } from './app/context.js';
import { createRouter } from './app/router.js';
import { h, iconEl } from './ui/dom.js';
import { libraryScreen } from './screens/library.js';
import { onboardingScreen } from './screens/onboarding.js';
import { practiceScreen } from './screens/practice.js';
import { settingsScreen } from './screens/settings.js';
import { summaryScreen } from './screens/summary.js';
import { tunerScreen } from './screens/tuner.js';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// 'system' (default) follows the OS; 'light' / 'dark' are explicit choices.
function effectiveTheme() {
  if (app.settings.theme === 'light' || app.settings.theme === 'dark') return app.settings.theme;
  return darkQuery.matches ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.dataset.theme = effectiveTheme();
}

function renderShell() {
  const brand = document.querySelector('#brandLink');
  brand.replaceChildren(iconEl('guitar'), h('span', { class: 'label' }, 'Realtime Tutor'));
  brand.setAttribute('aria-label', 'Realtime Tutor, go to your songs');

  const nav = document.querySelector('#mainNav');
  const isLight = effectiveTheme() === 'light';
  const themeButton = h('button', {
    class: 'btn btn-ghost btn-icon',
    type: 'button',
    'aria-label': isLight ? 'Switch to dark theme' : 'Switch to light theme',
    title: isLight ? 'Dark theme' : 'Light theme',
    onclick: () => app.updateSettings({ theme: isLight ? 'dark' : 'light' }),
  }, iconEl(isLight ? 'moon' : 'sun'));
  nav.replaceChildren(...[
    h('a', { href: '#/library', 'data-nav': 'library' }, iconEl('library'), h('span', { class: 'label' }, 'Library')),
    // The tuner only exists for instruments the learner tunes (not piano).
    app.instrument().tuner
      ? h('a', { href: '#/tuner', 'data-nav': 'tuner' }, iconEl('tuner'), h('span', { class: 'label' }, 'Tuner'))
      : null,
    h('a', { href: '#/settings', 'data-nav': 'settings' }, iconEl('settings'), h('span', { class: 'label' }, 'Settings')),
    themeButton,
  ].filter(Boolean));
  const current = location.hash.replace(/^#\/?/, '').split('/')[0];
  nav.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === current) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

applyTheme();
renderShell();
darkQuery.addEventListener('change', () => {
  if (app.settings.theme === 'system') {
    applyTheme();
    renderShell();
  }
});
app.onSettingsChange((settings, patch) => {
  if ('theme' in patch) applyTheme();
  if ('theme' in patch || 'instrument' in patch) renderShell();
});

app.router = createRouter({
  library: libraryScreen,
  practice: practiceScreen,
  summary: summaryScreen,
  tuner: tunerScreen,
  settings: settingsScreen,
  setup: onboardingScreen,
}, {
  container: document.querySelector('#main'),
  fallback: 'library',
  beforeEach(route) {
    if (!app.settings.onboarded && route.name !== 'setup') return 'setup';
    return null;
  },
});
app.router.start();

// Unlock audio output (clicks, guide tone) on the first interaction anywhere.
window.addEventListener('pointerdown', () => app.engine.ensureContext(), { once: true });
window.addEventListener('keydown', () => app.engine.ensureContext(), { once: true });

// Development hook for the browser test harnesses in tests/browser/.
if (import.meta.env?.DEV) window.__rtApp = app;
