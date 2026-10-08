// Hash router: #/library, #/practice/<songId>, #/summary, #/tuner, #/settings, #/setup.
export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1) };
}

export function createRouter(routes, { container, fallback = 'library', beforeEach = null }) {
  let current = null;

  async function render() {
    let route = parseRoute();
    if (beforeEach) {
      const redirect = beforeEach(route);
      if (redirect) {
        location.replace(`#/${redirect}`);
        return;
      }
    }
    if (!routes[route.name]) {
      location.replace(`#/${fallback}`);
      return;
    }
    current?.unmount?.();
    current = null;
    container.replaceChildren();
    const screen = routes[route.name];
    current = await screen.mount(container, route.params);
    document.querySelectorAll('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === route.name;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    // Move focus to the new screen's heading for keyboard and screen-reader users.
    const heading = container.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  return {
    start: render,
    go(path) {
      const target = `#/${path}`;
      if (location.hash === target) render();
      else location.hash = target;
    },
  };
}
