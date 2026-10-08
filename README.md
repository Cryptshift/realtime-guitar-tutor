# Realtime Guitar Song Learner

A browser app that listens to your guitar through the microphone and tells you, note by note, whether you're playing the right pitch at the right time. It shows beginner-friendly tabs, has a standalone tuner, and can turn tab pages, pasted ASCII tab, or a guitar recording into a playable exercise.

**Live demo:** https://cryptshift.github.io/realtime-guitar-tutor/

Everything runs locally in the browser (Vite + vanilla JS, no backend). The one exception is **URL import**, which goes through third-party CORS proxies (see [Importing tabs](#importing-tabs)).

## Quick start

```bash
npm install
npm run dev        # open the printed localhost URL
```

Allow microphone access, pick a piece, and click **Start Listening**. Microphone access needs a secure context (`https://` or `localhost`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit tests (`npm run test:watch` to watch) |

## Features

### Practice modes

- **Timed Playthrough**: the piece plays on a clock. A note counts when you play the right pitch (within 35 cents) **and** your pluck starts within ±200 ms of the note's start. The window narrows to half the gap between neighbouring notes in fast passages, with a 60 ms minimum. **Timing accuracy** scores how close each note start was, and hits show "N ms early/late".
  - **BPM** slider: changes the tempo from the current position (it no longer jumps the playhead).
  - **Timing Offset** slider: compensates for your audio input latency. If hits keep reading "late", move it negative.
  - **Guide Tone**: plays a quiet sine at the target pitch. Use headphones, because the microphone is opened without echo cancellation and would otherwise hear it.
- **Step-by-Step Learn**: no clock. The piece waits on each note until you play it, and every step needs a fresh pluck (or a hammer-on/slide to the new pitch). A ringing note can't clear the next identical note.
- **Space** restarts the piece (when focus isn't in a form field).

### Tabs and fingering

- **Beginner simplify** (default) turns chords into a fast arpeggio of single notes.
- Unchecking it keeps chords (*post-beginner* mode). In step mode you can then require the **full shape** before advancing; this uses a heuristic spectral match.
- The tab panel shows a fret-change timeline plus previous / current / next tab diagrams. **Show Finger Placement** swaps the right panel to a fretboard with suggested fingers.

### Standalone tuner

- Tuning sets: Standard, Drop D, D Standard, Open G.
- Shows cents sharp/flat and **IN TUNE** within ±5 cents. If the detector locks onto a harmonic an octave away, the reading is folded back onto the target.

### Backing track

Load a local audio file, set its volume, and optionally start it together with **Start Listening**. The file never leaves the browser.

### Custom pieces

The **Custom Piece** box accepts JSON or plain ASCII tab.

```json
[
  { "note": "E4", "start": 0.0, "duration": 0.5, "tab": { "string": 1, "fret": 0 } },
  { "note": "F#4", "start": 0.5, "duration": 0.5 }
]
```

Other accepted forms:

- An object: `{ "name": "My Piece", "bpm": 110, "notes": [ ... ] }`.
- A ```` ```json ```` fenced block.
- `{ "piece": { "notes": [...] } }`.

`tab` is optional; without it the easiest string/fret position is inferred. Notes outside the guitar's range are skipped and listed as "unplayable".

Pasted **ASCII tab** is converted using the *ms per tab column* value. If that field is left at its default, a BPM found in the text is used instead.

### Importing tabs

Paste a tab URL and click **Import From URL**.

- **Ultimate Guitar**: the tab is read from the page's embedded `.js-store` JSON (tab text, tuning, capo).
- **Other sites**: the app uses the smallest page element that contains the most tab lines.
- **Tab parser**: reads 6-line systems by position (top line = high e). It handles duplicate `E` labels, alternate-tuning labels (e.g. drop D's low `D`), lowercase or missing labels, `D#|`/`Eb|` labels and `| x2` annotations. If the labels spell a non-standard tuning and the page gives none, the labels set the tuning.

**Privacy note:** browsers block cross-origin page fetches, so the URL you paste is fetched through third-party CORS proxies, [api.allorigins.win](https://allorigins.win) and [r.jina.ai](https://jina.ai/reader). They see the URL you import. Order:

- Ultimate Guitar URLs (which send no CORS headers): allorigins first, then jina.
- Other URLs: a direct fetch first, then allorigins, then jina.

Nothing else is sent anywhere. If the proxies fail, copy the tab text and paste it into the Custom Piece box.

### Generate tabs from audio

Upload a clean, **monophonic** guitar recording to get a single-note exercise with an estimated BPM.

- Re-plucked repeated notes are kept as separate notes.
- Analysis runs in a Web Worker, so the page stays responsive. A progress bar tracks it and **Cancel audio analysis** stops it. A 3-minute song takes a few seconds.

## How it works

### Audio pipeline

```
mic -> MediaStreamSource -> capture AudioWorklet --frames--> detector Web Worker --results--> main thread
                         \-> AnalyserNode (spectrum, chord mode only)
```

- **`src/audio/capture.worklet.js`** (audio thread). Copies the input into a ring buffer and, every 256 samples (~5 ms), posts the latest 2048-sample frame with its AudioContext time. It does no DSP. Frame buffers are recycled, so it never allocates on the audio thread.
- **`src/audio/detector.worker.js`** (worker). Runs pitch and onset detection for each frame and posts a small result: level, frequency, clarity and onset time. The worklet and the worker talk over a `MessageChannel`, so audio frames never reach the page.
- **Main thread** (`src/loop.js`):
  - Scores each result as it arrives, using audio-clock timestamps.
  - Renders once per animation frame.
  - Only writes DOM text and values that changed.
  - While listening it uses about 6 ms of main-thread time per second, down from about 100 ms when detection ran there.
- **Pitch detection** (`src/dsp/pitch.js`): McLeod Pitch Method, a normalized square difference function. It searches the instrument's frequency range (guitar: 60–1400 Hz), takes the first key maximum within 90% of the highest, and refines it with parabolic interpolation. On synthetic E2–E6 tones it is within 0.2 cents with no octave errors, and it stays silent on white noise.
- **Note onsets** (`src/dsp/onset.js`): a detector fires on a level jump over the recent minimum (a pluck or re-pluck) or on a newly stable pitch (legato or a soft start). Onsets drive the timing score and the fresh-pluck rule.
- **Microphone**: opened with echo cancellation, noise suppression and auto-gain **off**. Those speech filters damp sustained notes.
- **Audio-to-tab** (`src/audio/audioToTab.worker.js`): the same detectors run offline over a decoded file in a worker.

### Modules

```
src/main.js                 entry: DOM events, init
src/state.js                shared state + DOM element registry
src/loop.js                 analysis-result handling and render loop
src/audioEngine.js          mic start/stop (worklet + worker), guide tone, backing track
src/audio/                  capture worklet, detector worker, audio-to-tab worker
src/dsp/                    pitch (MPM), onset, chord spectrum
src/scoring.js              targets, onsets, hit/step logic, feedback
src/clock.js                tempo-aware piece clock
src/piece.js                piece model, normalization, custom JSON/text input
src/music.js                note names, MIDI, cents, pitch classes
src/render/                 status, tab slots, timeline, instrument panel
src/controls.js             control-panel actions (modes, BPM, tuner selects, restart)
src/importPanel.js          URL import, audio-to-tab, custom piece loading
src/import/                 page fetching via CORS proxies, BPM metadata
src/instruments/index.js    instrument registry and interface
src/instruments/guitar/     strings/frets, tunings, tab parser, page import, tab text, fretboard view
```

**Instruments.** Generic code reaches anything guitar-specific only through the interface in `src/instruments/index.js`, which covers:

- range and detector hints;
- note placement and playability;
- slot and timeline text;
- the instrument view;
- tuner sets;
- text and page importers.

A new instrument is a folder under `src/instruments/` plus one registry entry.

## Testing

```bash
npm test             # Vitest: 62 unit tests
```

The unit tests cover:

- note/MIDI helpers and the tuner's octave folding;
- the tempo clock;
- the pitch detector, against synthetic tones and noise;
- the onset detector, the audio-to-tab transcription and its progress reporting;
- the ASCII tab parser and the Ultimate Guitar extractor;
- BPM and custom-piece parsing;
- the instrument registry, including a stand-in keyboard instrument.

End-to-end checks run in a real browser with a synthetic microphone. Start `npm run dev`, open the app, then in the devtools console:

```js
await (await import('/tests/browser/fakeMicSuite.js')).runFakeMicSuite();
await (await import('/tests/browser/measure.js')).measureLatency();
await (await import('/tests/browser/audioToTabCheck.js')).checkAudioToTab({ seconds: 180 });
```

Together they cover:

- timed and step scoring;
- the tuner and the BPM slider;
- the start guard and failure cleanup;
- latency and main-thread cost;
- audio-to-tab responsiveness and cancel.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`: `npm ci`, `npm test`, `npm run build`, then upload and deploy. `vite.config.js` uses a relative `base`, so the build works under a project sub-path.

## Tips and limitations

- Use a quiet room and a clean tone. Heavy reverb, distortion or other instruments confuse single-pitch detection.
- Chord detection (post-beginner step mode) is a heuristic spectral check and can be lenient on low strings.
- Imported and custom pieces live only for the session; reloading the page clears them.
- Needs a browser with AudioWorklet and module Web Workers (current Chrome, Edge, Firefox and Safari).

## License

[MIT](LICENSE) © 2026 Cryptshift
