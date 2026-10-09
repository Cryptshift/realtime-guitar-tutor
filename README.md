# Realtime Tutor

Learn songs on **guitar, bass, ukulele or piano**. The app listens through your microphone (or a MIDI keyboard) and tells you note by note whether you played the right pitch, and in Play along whether you played it on time. It is built for a beginner practising alone with a laptop, tablet or phone on a music stand.

**Live demo:** https://cryptshift.github.io/realtime-guitar-tutor/

Everything runs in the browser (Vite + vanilla JS, no backend). The one exception is **tab-link import**, which goes through third-party CORS proxies (see [Adding songs](#adding-songs)).

On piano you can practise **two-handed pieces**, one hand at a time or both together; see [Piano and two hands](#piano-and-two-hands).

## Quick start

```bash
npm install
npm run dev        # open the printed localhost URL
```

The first visit runs a short setup:

1. Pick your instrument.
2. Allow the microphone (or choose a MIDI keyboard).
3. Play any note to check the input.
4. Optionally line up the timing with 4 clicks.
5. Tune up.

You can re-run setup from **Settings**. Microphone access needs a secure context (`https://` or `localhost`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit tests (`npm run test:watch` to watch) |
| `npm run check:contrast` | WCAG contrast check of the colour tokens, plus a check that no colour values exist outside them |

## Using it

### Library

- Continue where you left off.
- Filter by instrument and level.
- Open a song.
- Songs show their length and your best stars.
- Built-in songs are traditional or public domain:
  - Twinkle Twinkle Little Star, Mary Had a Little Lamb, Ode to Joy.
  - Open-string warm-ups.
  - A 12-bar blues bass line.
  - The openings of Für Elise and the Minuet in G (piano, right hand, with fingering).
  - On piano, Twinkle and Ode to Joy have **both hands**: a simple left hand written for this app (the chord root on beats 1 and 3). Their cards say "Both hands".

### Practice

One main button: **Start/Pause** (or **Space**). Two modes:

- **Wait for me** (default): each note, or each chord shape, waits until you play it with a fresh attack. Playing the first note starts the run.
- **Play along**: the song runs at your tempo (50–120%, new songs start at 70%) with an optional count-in and metronome. A note counts if you start it within ±200 ms of its start (narrower in fast passages). Results show how early or late you were.

On screen:

- **The current note** in large type, with where to play it ("String 3 (G), fret 2 · finger 2", or the key and finger on piano).
- **A note highway**: one lane per string, or per pitch on piano. It is labelled with fret numbers or key names.
- **The instrument view**: a fretboard with finger numbers (with a left-handed option), or a keyboard fitted to the song's range.
- **Plain-language feedback**, for example:
  - "You played F, aim for E: one fret lower";
  - "the key just to the left";
  - "A little sharp".
  - An intonation needle (not on piano, which can't be played out of tune) and an "N in a row" counter.
- **Loops**: choose a section on the progress bar, or drag across it to loop bars A–B.

Shortcuts:

| Key | Action |
| --- | --- |
| Space | Start / pause |
| R | Restart |
| W | Switch mode |
| H | Switch hands: right, left, both (two-handed piano pieces) |
| [ ] | Tempo |
| M | Metronome |
| C | Count-in |
| L | Clear loop |
| Esc | Finish |
| ? | Help |

**More** holds the backing track (a local audio file played at your tempo) and the guide tone (use headphones).

### Piano and two hands

Piano notes can belong to the right or the left hand. On a piece with both hands:

- **Hands** (in the practice options, or **H**): Right, Left or Both. The choice is remembered per song.
  - With one hand, only that hand's notes are required and scored. The other hand stays on the highway, faint, so you can see what it does; playing it along isn't counted as a mistake.
  - With Both, notes that start together in either hand are one step in Wait for me (all of them required) and one timing group in Play along.
  - **Play the other hand quietly** (under More, off by default) plays the hand you aren't practising as soft tones in Play along. Use headphones with a microphone.
- **Telling the hands apart**, never by colour alone:
  - The right hand is filled with the accent.
  - The left hand is hatched in pencil with an ink outline on the keys, and hatched or ink-filled on the highway.
  - Keys are labelled with hand and finger: "R2", "L5".
- **The keyboard** fits the hands you're practising: the whole piece when it fits the screen, otherwise the notes coming up, split into a left-hand and a right-hand section when the hands are far apart. Keys stay at least 22 px wide, so it is readable on a phone.
- **Hints name the hand**, for example "Left hand: you played C3, aim for A2: three keys to the left".
- **The results** give the accuracy per hand. If one hand is clearly behind, the next step is to practise it alone.

**Use a MIDI keyboard for two hands.** It reports every key exactly, so each key of a chord is checked with its own timing. A microphone hears one pitch at a time, so chords and two hands are only matched approximately; the app says "Two hands work best with a MIDI keyboard" when you choose Both with the microphone.

### Results

- Accuracy and stars, timing and an early/late tendency, and the trickiest notes.
- With both hands, the accuracy per hand. If one hand is clearly behind, the next step is to practise it alone. Runs with one hand of a two-handed piece are kept in the history but don't count as the song's best.
- **Practice the tricky part**: loops the weakest bar at −20% tempo.
- A suggested next step.
- Best scores and history are saved in the browser.

### Tuner

A large needle with "Too high: loosen the string" / "Too low: tighten the string". String chips (or Auto), and tunings per instrument (guitar: Standard, Drop D, D Standard, Open G). It is hidden for piano.

### Settings

- Instrument.
- Microphone or MIDI device. MIDI is hidden where the browser lacks Web MIDI, e.g. Safari.
- Latency: calibrate or use the slider.
- Guide tone and backing-track volumes.
- Theme: match the device, Paper (light) or Stage (dark).
- Left-handed fretboard and key labels.
- Practice defaults.
- Chord options.

## Adding songs

**Add a song** collects every import path. Added songs are saved in the browser.

- **Tab link**:
  - **Ultimate Guitar**: the tab is read from the page's embedded `.js-store` JSON (tab text, tuning, capo).
  - **Other sites**: the smallest page element that contains the most tab lines.
  - **Privacy**: browsers block cross-origin fetches, so the link is fetched through third-party CORS proxies, [api.allorigins.win](https://allorigins.win) and [r.jina.ai](https://jina.ai/reader). They see the URL; nothing else is sent.
- **Paste tab**: ASCII tab for guitar (6 lines), bass or ukulele (4 lines). It is read by line position, so duplicate `E` labels, drop-D labels, lowercase or missing labels and `| x2` annotations all work.
- **MIDI file**: optionally quantise to 1/4, 1/8 or 1/16.
  - **Guitar, bass, ukulele**: pick a track (the busiest non-drum track is the default).
  - **Piano**: each track goes to a hand.
    - A file with several tracks lists them with their note count and range. The higher track starts as the right hand and the lower one as the left (track names like "RH" or "Left hand" win). You can set each track to Right hand, Left hand or Ignore. Drum tracks start as Ignore.
    - A file with one track that holds both hands is split by pitch, one moment at a time. Each hand's notes stay together and within about an octave and a half (counting keys still held), close to where that hand has been playing, and otherwise near middle C. The dialog shows how many notes each hand gets, and you can keep everything in one hand instead. A single melody stays in one hand.
    - **Practice**: Both hands (default), Right hand or Left hand. This sets the song's Hands choice, which you can change while practising.
- **From a recording**: a clean single-note recording is transcribed in a Web Worker, with progress and Cancel.
- **Advanced (JSON)**: an array of `{ note, start, duration }` (seconds), or `{ name, bpm, notes }`. Each note may also have:
  - `tab: { string, fret }`;
  - `finger`;
  - `hand` (`L`/`R`).

  Pieces also record their `instrument`.

```json
[
  { "note": "E4", "start": 0.0, "duration": 0.5, "tab": { "string": 1, "fret": 0 } },
  { "note": "F4", "start": 0.5, "duration": 0.5, "finger": 2 }
]
```

## Bring your own songs

Import only MIDI files you have the rights to use (your own arrangements, public-domain music, or files whose licence allows it). The app ships no copyrighted music. Imported songs stay in your browser only: they are saved in its local storage and never uploaded.

**Your own folder (local runs only).** Drop `.mid` or `.midi` files into `my-songs/` and run `npm run dev`. Each file shows up in the library under **My songs**, tagged **Local file**, as a piano piece with both hands assigned automatically. The title comes from the file name (`moonlight-sonata.mid` becomes "Moonlight Sonata"), and scores are kept like any other song's.

- `my-songs/` is git-ignored (except its README), so the files are never committed. The GitHub Pages build starts from a fresh checkout and never includes them.
- A local `npm run build` **does** bundle them into `dist/`. Don't publish a build made with files in `my-songs/`.
- To choose the hands yourself, or to import for another instrument, use **Add a song → MIDI file** instead.

## How it works

### Audio pipeline

```
mic -> MediaStreamSource -> capture AudioWorklet --frames--> detector Web Worker --results--> page
MIDI keyboard (Web MIDI) ----------------------------------------- note on/off ------------> page
```

- **Capture worklet** (`src/audio/capture.worklet.js`, audio thread): copies the input. Every 256 samples (~5 ms) it posts the latest analysis frame, timestamped with the AudioContext clock. It does no DSP and never allocates.
- **Detector worker** (`src/audio/detector.worker.js`): runs pitch (McLeod Pitch Method) and onset detection using the instrument's frequency range.
  - Guitar: 60–1400 Hz.
  - Bass: 34–500 Hz.
  - Ukulele: 150–1600 Hz.
  - Piano: 50–2200 Hz.
- **Page**: `src/practice/session.js` scores each result as it arrives. The screen renders once per animation frame.
- **MIDI input**: skips detection entirely, so note-on gives exact pitch and timing, and chords are checked key by key.
- **Microphone settings**: echo cancellation, noise suppression and auto-gain are **off**, because those speech filters damp sustained notes.

### Modules

```
src/main.js                  app shell (header, theme) and router
src/app/                     shared context (settings, storage, library, audio engine), router, my-songs loader
src/screens/                 library, add-song dialog, practice, summary, tuner, settings, setup, calibration
src/practice/                session engine (modes, hits, timing, loops), summary, note highway
src/audio/                   audio engine, capture worklet, detector and audio-to-tab workers
src/input/midi.js            Web MIDI input
src/dsp/                     pitch (MPM), onsets, chord spectrum
src/import/                  CORS-proxy fetch, BPM metadata, MIDI files and hand assignment, recording transcription
src/instruments/             add-on registry: fretted (guitar, bass, ukulele) and piano
src/piece.js, music.js       piece model and note maths
src/songs/catalog.js         built-in songs
src/storage.js               settings, user songs, scores (localStorage, failure-safe)
src/ui/                      DOM helpers and icons
src/styles.css               design tokens and components
```

### Instrument add-ons

`src/instruments/index.js` documents the interface. Each add-on supplies:

- its range and detector hints;
- note placement (strings/frets or keys) and fingering;
- highway lanes;
- its view (fretboard or keyboard);
- hint wording;
- tuner tunings, or none;
- importers.

Guitar, bass and ukulele are configurations of one fretted factory, and the ukulele's re-entrant high G is handled per string. A new instrument is a folder plus one registry entry.

### Design

The "practice room" theme is described in `docs/ux-redesign.md`.

- Manuscript paper and pencil ink, with a single vermilion accent.
- Instrument views in real materials: rosewood, bone, nickel, bronze, ivory and ebony.
- Fraunces for headings and the big note, IBM Plex Mono for tab numbers, and system-ui for text. The fonts are self-hosted via `@fontsource` (OFL-1.1).
- Colours live only in the token blocks at the top of `src/styles.css`. `npm run check:contrast` verifies every text and UI colour pair against WCAG AA in both themes.
- Feedback always pairs a colour with a shape:
  - ✓ correct;
  - ~ close;
  - ✗ or an arrow for wrong.

## Testing

```bash
npm test                 # Vitest: 135 unit tests
npm run check:contrast   # colour-token contrast and stray-colour check
```

The unit tests cover:

- the session engine in both modes, with MIDI and synthetic mic input, including hands selection and chords across the hands;
- MIDI hand assignment (tracks to hands, the one-track split) and the my-songs loader, with synthetic MIDI files;
- the keyboard fit (whole piece, wider with both hands, split sections on a phone);
- the pitch and onset detectors;
- instrument mapping (including the re-entrant ukulele), fingering, highway layouts and hint wording;
- tab parsing for 4 and 6 strings and the Ultimate Guitar extractor;
- MIDI file parsing, with tempo changes, running status and quantising;
- per-hand results and the per-song hands choice;
- Web MIDI input against a mock;
- the summary, storage, the built-in songs and the tempo clock.

End-to-end flows run in a real browser against the dev server, with a synthetic microphone and a mock MIDI keyboard. Start `npm run dev`, open the app, and in the devtools console run:

```js
const e2e = await import('/tests/browser/e2e.js');
await e2e.onboarding();
await e2e.guitarRun();
await e2e.guitarPlayAlong();
await e2e.pianoRun();         // right hand only
await e2e.pianoPlayAlong();   // both hands, Play along
await e2e.pianoBothHands();   // both hands, Wait for me, one wrong left-hand key
```

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages on every push to `main` (`npm ci`, `npm test`, `npm run build`, upload, deploy). `vite.config.js` uses a relative `base`, so the build, its fonts, the worklet and the workers all load from a project sub-path.

## Limitations

- **Microphone input is single-pitch.** Use a quiet room and a clean tone. With a microphone, chords are matched only approximately; a MIDI keyboard checks every key.
- **Two hands need a MIDI keyboard to be judged exactly.** With a microphone, practise one hand at a time, or expect both hands to be matched approximately.
- **The one-track split is a heuristic.** Crossed hands or wide leaps can land in the wrong hand; reassign tracks, or keep a track in one hand, in the import dialog.
- **Your data stays in this browser.** Library, scores and settings live in its local storage.
- **Browser support:** needs AudioWorklet and module Web Workers (current Chrome, Edge, Firefox and Safari). Web MIDI works in Chromium-based browsers and Firefox.

## License

[MIT](LICENSE) © 2026 Cryptshift
