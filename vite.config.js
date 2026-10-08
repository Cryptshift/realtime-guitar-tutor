import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (e.g. GitHub Pages
  // https://<user>.github.io/<repo>/).
  base: './',
  build: {
    // Keep the AudioWorklet module as a real file: audioWorklet.addModule() should load
    // a same-origin script rather than an inlined data: URL.
    assetsInlineLimit: (filePath) => (filePath.endsWith('.worklet.js') ? false : undefined),
  },
});
