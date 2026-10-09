# my-songs

Put your own MIDI files (`.mid` or `.midi`) in this folder, then run the app locally:

```bash
npm run dev
```

Each file shows up in the library under **My songs**, tagged **Local file**, as a piano piece with both hands assigned automatically. The title comes from the file name (`wet-hands.mid` becomes "Wet Hands"). Your best scores and history are kept like any other song's.

- **Files here stay on your machine.** Everything in this folder except this README is git-ignored, so it is never committed, and the GitHub Pages build (made from a fresh checkout) never includes it.
- A local `npm run build` *does* bundle these files into `dist/`, so don't publish a build you made with files in here.
- Only use files you have the rights to use.

To choose the hands yourself (or import for guitar, bass or ukulele), use **Add a song → MIDI file** in the app instead. Songs added that way are saved in your browser only.
