# Realtime Guitar Song Learner

A browser-based realtime guitar practice app that:

- Listens to your guitar via microphone.
- Detects pitch in realtime.
- Compares your detected note against the expected note of a piece timeline.
- Shows how close you are in cents plus pitch/timing/overall scores while you play.
- Shows beginner tabs in realtime (`string + fret`) so you can play single-note lines without chord knowledge.
- Includes two song-learning modes:
  - `Timed`
  - `Step-by-Step` (advance only after you hit the current note)
- Includes a standalone right-side tuner panel with:
  - Tuning set selection
  - Target-note selection
  - Realtime `% in tune` and `sharp/flat` cents feedback
- Supports importing tab links (Ultimate Guitar and similar) into playable note timelines.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Open the local URL, allow microphone access, and click **Start Listening**.
4. Pick **Detection Mode**:
   - `Timed Playthrough`: normal timeline-based practice.
   - `Step-by-Step Learn`: stays on one note until you play it correctly, then moves to the next.
5. Use the **Standalone Tuner** panel on the right:
   - choose a tuning set
   - choose a target note from that set
   - tune that note until closeness feedback says it is in tune
6. Import tabs from URL:
   - paste a link in the **Custom Piece JSON** section
   - set `ms/column` to control playback speed mapping
   - click **Import From URL**

## Piece Format

You can paste custom piece JSON in the app:

```json
[
  { "note": "E4", "start": 0.0, "duration": 0.5, "tab": { "string": 1, "fret": 0 } },
  { "note": "F#4", "start": 0.5, "duration": 0.5 }
]
```

Or object format:

```json
{
  "name": "My Piece",
  "bpm": 110,
  "notes": [
    { "note": "E4", "start": 0.0, "duration": 0.5 }
  ]
}
```

## Realtime Integrations Included

- Microphone input via `navigator.mediaDevices.getUserMedia`.
- Web Audio API realtime analyzer.
- Live note matching against piece timing.
- Realtime beginner tab guidance (current note + upcoming notes).
- Step-by-step note progression mode for one-by-one learning.
- Standalone tuner with selectable tuning sets and target notes.
- Latency offset slider for device/input sync adjustment.
- URL tab import with HTML extraction (including Ultimate Guitar tab containers like `.k_vI3.WptWb.fGc1h`) and ASCII-tab parsing.

## Notes

- Works best with a clean guitar signal (quiet room, no heavy reverb/noise).
- Autocorrelation pitch detection is lightweight and good for monophonic lines/chords with dominant fundamental.
- Feedback scores are only computed during active note windows, which keeps results stable for beginners.
- URL import may fail when sites block cross-origin fetches; use the fallback by pasting tab text manually if needed.
- For production-grade multi-note/chord detection, add ML/DSP models in a backend or AudioWorklet pipeline.
