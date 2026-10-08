# Learner-focused redesign

**Who it's for:** a beginner practising alone, with a laptop, tablet or phone on a music stand 1–2 m away and both hands on the instrument. During practice everything must read at a glance, and it must work hands-free.

## Principles

1. **One primary action per screen.** Practice shows *Start* / *Pause* and nothing else competes for it. Advanced features stay one level down: chord mode, JSON, backing track, guide tone and audio-to-tab.
2. **Read from 2 m.**
   - The current note is 96–160 px.
   - Feedback words are 28 px or larger.
   - The note highway and the instrument view take most of the screen.
   - The dark theme is the default.
3. **Hands-free.**
   - Space starts and pauses.
   - In *Wait for me*, playing the first note starts the run.
   - All controls have shortcuts. `?` lists them.
4. **Plain language.** Use "Wait for me" and "Play along", not *step* and *timed*. Hints read like "You played F, aim for E: one fret lower", not cents.
5. **Never colour alone.**
   - Hits get a check mark and a filled block.
   - Misses get a cross and a hollow block.
   - "Sharp" and "flat" get arrows.
   - `prefers-reduced-motion` turns off decorative motion. The highway still moves because it is the content.
6. **Instrument add-ons.** Anything instrument-specific comes from `src/instruments/<id>/`: range, positions, fingering, the view, hints, tuner, importers and detector range.

## Screens and flow

```
first visit ──► Onboarding ──► Library ◄──────────────┐
                                  │ pick song          │
                                  ▼                    │
                              Practice ──finish──► Summary
                                  │  "Practice the tricky part" (loop worst bar at -20%)
          header: Library · Tuner (fretted only) · Settings
```

### Onboarding (first run; re-run from Settings)

Each step has Back / Next / Skip and progress dots:

1. **Instrument:** big cards for Guitar, Bass, Ukulele and Piano.
2. **Input:** "We listen to your playing to check notes. Audio never leaves this device." Buttons: *Allow microphone*, and *Use a MIDI keyboard* (only where Web MIDI exists).
3. **Level check:** "Play any note." A live meter and the detected note in large type. Next unlocks once a note is heard.
4. **Latency (optional):** "Play any note on each of the 4 clicks." The measured offset replaces the raw slider, which stays in Settings.
5. **Tune up** (fretted only): opens the Tuner, or *Skip*.

Choices are stored in `localStorage`.

### Library

```
┌──────────────────────────────────────────────────────────────┐
│ Realtime Guitar Tutor   Library  Tuner  Settings      ◐ theme │
├──────────────────────────────────────────────────────────────┤
│ ▶ Continue: Ode to Joy · Piano · Wait for me · 70%  [Resume]  │
│ [All][Guitar][Bass][Ukulele][Piano]   [Any level ▾]  [+ Add a song] │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │Twinkle   │ │Ode to Joy│ │Mary Had… │ │Für Elise │            │
│ │Piano·Beg.│ │Piano·Beg.│ │Piano·Beg.│ │Piano·Easy│            │
│ │0:12 ★★☆  │ │0:16 ☆☆☆  │ │…         │ │…         │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
└──────────────────────────────────────────────────────────────┘
```

**Add a song** is one dialog with five tabs: *Tab link*, *Paste tab*, *MIDI file*, *From a recording*, *Advanced (JSON)*. Imported songs are saved to the library.

### Practice

```
┌──────────────────────────────────────────────────────────────┐
│ ‹ Library   Ode to Joy                    Bar 3 of 8   ? keys │
│ [▮▮▮▮▮▮▮▯▯▯|▯▯▯▯|▯▯▯▯]  ← sections; drag to loop A–B          │
│ Mode (Wait for me | Play along)  Tempo 70% ─●──  Count-in ☑ ♩ │
├──────────────────────────────────────────────────────────────┤
│        NOW                       note highway ──────────►     │
│        E4          │ ■E  ■F  ■G    ■G  ■F                       │
│  ✓ Nice!  streak 7 │                                           │
│  ◄─●─► in tune     │ hit line                                  │
├──────────────────────────────────────────────────────────────┤
│  instrument view: piano keys / fretboard with finger numbers  │
├──────────────────────────────────────────────────────────────┤
│                 [ ▶ Start  (Space) ]                           │
└──────────────────────────────────────────────────────────────┘
```

- **Phone:**
  - Header, progress and the big note sit on top, then the highway, then the instrument view.
  - The controls move into a collapsible "Options" row.
  - The Start button sits in a fixed bottom bar.
- **Shortcuts:**

  | Key | Action |
  | --- | --- |
  | Space | Start / pause |
  | R | Restart |
  | W | Switch mode |
  | [ / ] | Tempo −/+5% |
  | M | Metronome |
  | L | Clear loop |
  | Esc | Finish → summary |
  | ? | Help |

### Summary

- Big accuracy % with stars, timing %, and an "early/late" tendency.
- The three trickiest notes and the trickiest bar.
- **Practice the tricky part** loops the worst bar at −20% tempo.
- **Next step** suggestion, e.g. "Great: try 80%".
- Best score and history are saved locally.

### Tuner

- A big needle (±50 cents) and the note in large type.
- Arrows plus the words "Tighten" or "Loosen".
- String chips with Auto mode on by default.
- Hidden for piano.

### Settings

- **Input:** microphone, or a MIDI device picker.
- **Latency:** Calibrate, plus a fine slider.
- **Volumes and tips:** guide tone and backing track (with a headphones tip).
- **Display:** theme, left-handed and key labels.
- **Advanced:**
  - simplify chords;
  - require the full chord shape;
  - backing-track file.
- **Re-run setup.**

## Design tokens

- **Surfaces (dark):**

  | Token | Value |
  | --- | --- |
  | bg | `#0e1318` |
  | surface | `#161d24` |
  | raised | `#1f2831` |
  | border | `#2c3742` |
  | text | `#eef2f5` |
  | muted | `#a3b1bd` |

- **Surfaces (light):**

  | Token | Value |
  | --- | --- |
  | bg | `#f5f7f9` |
  | surface | `#ffffff` |
  | raised | `#eef2f5` |
  | border | `#d5dde4` |
  | text | `#101820` |
  | muted | `#4a5865` |

- **Accent and state colours.** Each state is always paired with an icon.

  | Role | Dark | Light |
  | --- | --- | --- |
  | Accent | `#3ddc97` (text on it `#04261a`) | `#04704c` |
  | Hit | `#3ddc97` + ✓ | |
  | Close | `#f7c548` + arrows | `#8a5a00` |
  | Miss | `#ff7a7a` + ✕ | `#b42318` |
  | Upcoming | `#6cb4ff` | `#1d5fbf` |

- **Type:** system UI stack (no web-font requests), tabular numbers.
  - Scale: 14 / 16 / 18 / 22 / 28 / 36 / 48 px.
  - The current note uses `clamp(72px, 14vw, 160px)`.
- **Spacing and shape:**
  - Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 px.
  - Radii: 8 / 12 / 16.
  - Touch targets are at least 44 px.
  - The focus ring is a 3 px accent outline.
- **Motion:** 150–250 ms ease-out; none under `prefers-reduced-motion`.
