// Shared app services: settings, storage, library, audio engine, navigation and toasts.
import { createAudioEngine } from '../audio/engine.js';
import { getInstrument } from '../instruments/index.js';
import { store } from '../storage.js';
import { createLibrary } from './library.js';

const settings = store.loadSettings();
const listeners = new Set();

export const app = {
  store,
  settings,
  library: createLibrary(store),
  engine: createAudioEngine(),
  lastRun: null,
  router: null,

  instrument() {
    return getInstrument(settings.instrument);
  },

  updateSettings(patch) {
    Object.assign(settings, patch);
    store.saveSettings(settings);
    listeners.forEach((fn) => fn(settings, patch));
  },

  onSettingsChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  go(path) {
    app.router?.go(path);
  },

  toast(message) {
    const element = document.querySelector('#toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('is-visible');
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => element.classList.remove('is-visible'), 3500);
  },

  // Starts the configured input if nothing is listening yet. Returns the input info.
  async ensureInput({ instrument = app.instrument(), source = settings.inputSource } = {}) {
    const wanted = source === 'midi' && app.engine.isMidiSupported() ? 'midi' : 'mic';
    if (app.engine.inputKind === wanted && app.inputInfo?.instrumentId === instrument.id) return app.inputInfo;
    const deviceId = wanted === 'midi' ? settings.midiDeviceId : settings.micDeviceId;
    const info = await app.engine.start({ source: wanted, deviceId, detector: instrument.detector });
    app.inputInfo = { ...info, instrumentId: instrument.id };
    return app.inputInfo;
  },

  stopInput() {
    app.engine.stop();
    app.inputInfo = null;
  },
};
