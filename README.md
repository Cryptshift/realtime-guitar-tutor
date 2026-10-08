# Realtime Guitar Song Learner

A browser app that listens to your guitar through the microphone and tells you, note by note, whether you're playing the right pitch at the right time. It shows beginner-friendly tabs, has a standalone tuner, and can turn tab pages, pasted ASCII tab, or a guitar recording into a playable exercise.

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
- Analysis runs on the main thread, so the page pauses briefly while it works (roughly 0.3 s per 10 s of audio on a laptop).

## How it works

- **Pitch detection**: McLeod Pitch Method, a normalized square difference function over 2048-sample frames. It covers 60–1400 Hz, chooses the first key maximum within 90% of the highest, and refines it with parabolic interpolation. On synthetic E2–E6 tones it is within 0.2 cents with no octave errors, and it stays silent on white noise.
- **Note onsets**: a frame-level detector fires on a level jump over the recent minimum (a pluck or re-pluck) or on a newly stable pitch (legato or a soft start). Onsets drive the timing score and the fresh-pluck rule.
- **Microphone**: opened with echo cancellation, noise suppression and auto-gain **off**. Those speech filters damp sustained notes.

## Tips and limitations

- Use a quiet room and a clean tone. Heavy reverb, distortion or other instruments confuse single-pitch detection.
- Chord detection (post-beginner step mode) is a heuristic spectral check and can be lenient on low strings.
- Imported and custom pieces live only for the session; reloading the page clears them.
- Detection and audio-to-tab run on the main thread.

## Project layout

```
index.html        UI markup
src/main.js       App logic (audio, detection, scoring, import, rendering)
src/styles.css    Styles
tests/            Vitest unit tests + synthetic signal helpers
```

The unit tests (`npm test`) cover:

- note/MIDI helpers;
- the tuner's octave folding;
- the tempo clock;
- the pitch detector, against synthetic tones and noise;
- the onset detector;
- the ASCII tab parser and the Ultimate Guitar extractor;
- BPM parsing;
- custom-piece parsing.

## License

[MIT](LICENSE) © 2026 Cryptshift
