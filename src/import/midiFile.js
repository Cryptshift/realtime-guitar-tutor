// Minimal Standard MIDI File (.mid) reader and converter to the app's piece format.
// Handles formats 0 and 1, PPQ and SMPTE time division, running status, tempo changes,
// note-on with velocity 0 as note-off, and sysex/meta events (skipped except tempo, track
// name and time signature).
import { midiToNoteName } from '../music.js';

const DEFAULT_US_PER_QUARTER = 500000; // 120 BPM
const DRUM_CHANNEL = 9; // channel 10 in 1-based numbering

class Reader {
  constructor(bytes, offset = 0, end = bytes.length) {
    this.bytes = bytes;
    this.pos = offset;
    this.end = end;
  }

  eof() { return this.pos >= this.end; }

  u8() {
    if (this.pos >= this.end) throw new Error('Unexpected end of MIDI data');
    return this.bytes[this.pos++];
  }

  u16() { return (this.u8() << 8) | this.u8(); }

  u32() { return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8(); }

  vlq() {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('Invalid variable-length quantity');
  }

  text(length) {
    const slice = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return String.fromCharCode(...slice);
  }

  skip(length) { this.pos += length; }
}

function readTrack(reader, trackEnd) {
  const events = [];
  let tick = 0;
  let runningStatus = null;
  while (reader.pos < trackEnd) {
    tick += reader.vlq();
    let status = reader.u8();
    if (status < 0x80) {
      if (runningStatus === null) throw new Error('Running status without a previous status byte');
      reader.pos -= 1;
      status = runningStatus;
    }
    if (status === 0xff) {
      const type = reader.u8();
      const length = reader.vlq();
      if (type === 0x51 && length === 3) {
        events.push({ tick, type: 'tempo', usPerQuarter: (reader.u8() << 16) | (reader.u8() << 8) | reader.u8() });
      } else if (type === 0x03) {
        events.push({ tick, type: 'name', text: reader.text(length) });
      } else if (type === 0x58 && length >= 2) {
        const numerator = reader.u8();
        const denominator = 2 ** reader.u8();
        reader.skip(length - 2);
        events.push({ tick, type: 'timeSignature', numerator, denominator });
      } else if (type === 0x2f) {
        reader.skip(length);
        break;
      } else {
        reader.skip(length);
      }
      runningStatus = null;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.vlq());
      runningStatus = null;
      continue;
    }
    runningStatus = status;
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    if (kind === 0xc0 || kind === 0xd0) {
      reader.u8();
      continue;
    }
    const data1 = reader.u8();
    const data2 = reader.u8();
    if (kind === 0x90 && data2 > 0) events.push({ tick, type: 'on', channel, midi: data1, velocity: data2 });
    else if (kind === 0x80 || kind === 0x90) events.push({ tick, type: 'off', channel, midi: data1 });
  }
  reader.pos = trackEnd;
  return events;
}

// Converts ticks to seconds through the tempo map.
function createTickClock(tempos, ticksPerQuarter, smpteTicksPerSecond) {
  if (smpteTicksPerSecond) return (tick) => tick / smpteTicksPerSecond;
  const map = [...tempos].sort((a, b) => a.tick - b.tick);
  if (!map.length || map[0].tick > 0) map.unshift({ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  const segments = [];
  let seconds = 0;
  map.forEach((tempo, i) => {
    if (i > 0) {
      const previous = map[i - 1];
      seconds += ((tempo.tick - previous.tick) * previous.usPerQuarter) / 1e6 / ticksPerQuarter;
    }
    segments.push({ tick: tempo.tick, seconds, usPerQuarter: tempo.usPerQuarter });
  });
  return (tick) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.tick <= tick) segment = candidate;
      else break;
    }
    return segment.seconds + ((tick - segment.tick) * segment.usPerQuarter) / 1e6 / ticksPerQuarter;
  };
}

export function parseMidiFile(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const reader = new Reader(bytes);
  if (reader.text(4) !== 'MThd') throw new Error('Not a MIDI file (missing MThd header)');
  const headerLength = reader.u32();
  const headerEnd = reader.pos + headerLength;
  const format = reader.u16();
  const trackCount = reader.u16();
  const division = reader.u16();
  reader.pos = headerEnd;

  let ticksPerQuarter = division;
  let smpteTicksPerSecond = null;
  if (division & 0x8000) {
    const framesPerSecond = 256 - (division >> 8);
    smpteTicksPerSecond = framesPerSecond * (division & 0xff);
    ticksPerQuarter = smpteTicksPerSecond / 2; // nominal: one quarter = 0.5 s
  }

  const rawTracks = [];
  while (!reader.eof() && rawTracks.length < trackCount) {
    const id = reader.text(4);
    const length = reader.u32();
    const end = Math.min(bytes.length, reader.pos + length);
    if (id !== 'MTrk') {
      reader.pos = end;
      continue;
    }
    rawTracks.push(readTrack(reader, end));
  }

  const tempos = rawTracks.flat().filter((e) => e.type === 'tempo');
  const timeSignature = rawTracks.flat().find((e) => e.type === 'timeSignature') || null;
  const toSeconds = createTickClock(tempos, ticksPerQuarter, smpteTicksPerSecond);

  const tracks = rawTracks.map((events, index) => {
    const name = events.find((e) => e.type === 'name')?.text?.trim() || '';
    const open = new Map();
    const notes = [];
    events.forEach((event) => {
      if (event.type === 'on') {
        const key = `${event.channel}:${event.midi}`;
        if (!open.has(key)) open.set(key, []);
        open.get(key).push(event);
      } else if (event.type === 'off') {
        const started = open.get(`${event.channel}:${event.midi}`)?.shift();
        if (started) {
          notes.push({
            midi: started.midi,
            channel: started.channel,
            velocity: started.velocity,
            startTick: started.tick,
            endTick: Math.max(event.tick, started.tick + 1),
          });
        }
      }
    });
    notes.sort((a, b) => a.startTick - b.startTick || b.midi - a.midi);
    notes.forEach((note) => {
      note.start = toSeconds(note.startTick);
      note.duration = toSeconds(note.endTick) - note.start;
    });
    const channels = [...new Set(notes.map((n) => n.channel))];
    return { index, name, notes, channels, isDrums: channels.length > 0 && channels.every((c) => c === DRUM_CHANNEL) };
  });

  const firstTempo = tempos.sort((a, b) => a.tick - b.tick)[0]?.usPerQuarter ?? DEFAULT_US_PER_QUARTER;
  return {
    format,
    ticksPerQuarter,
    tracks,
    bpm: Math.round(60e6 / firstTempo),
    timeSignature: timeSignature ? { numerator: timeSignature.numerator, denominator: timeSignature.denominator } : null,
    toSeconds,
  };
}

// The track a learner most likely wants: the non-drum track with the most notes.
export function defaultMidiTrack(parsed) {
  const candidates = parsed.tracks.filter((t) => t.notes.length && !t.isDrums);
  return (candidates.sort((a, b) => b.notes.length - a.notes.length)[0] || parsed.tracks.find((t) => t.notes.length))?.index ?? null;
}

const QUANTIZE_DIVISIONS = { '1/4': 1, '1/8': 2, '1/16': 4 };

// Converts one track into a raw piece ({ name, bpm, notes: [{ note, start, duration }] }).
// quantize: null | '1/4' | '1/8' | '1/16' snaps starts and lengths to that grid (in ticks,
// so tempo changes are respected).
export function midiTrackToPiece(parsed, { trackIndex = defaultMidiTrack(parsed), quantize = null, name = '', instrument } = {}) {
  const track = parsed.tracks.find((t) => t.index === trackIndex);
  if (!track || !track.notes.length) throw new Error('That track has no notes');
  const division = QUANTIZE_DIVISIONS[quantize];
  const grid = division ? parsed.ticksPerQuarter / division : null;
  const snap = (tick) => (grid ? Math.round(tick / grid) * grid : tick);

  const notes = track.notes.map((note) => {
    const startTick = snap(note.startTick);
    const endTick = Math.max(startTick + (grid || 1), snap(note.endTick));
    const start = parsed.toSeconds(startTick);
    const duration = parsed.toSeconds(endTick) - start;
    return {
      note: midiToNoteName(note.midi),
      start: Number(start.toFixed(4)),
      duration: Number(Math.max(0.05, duration).toFixed(4)),
    };
  });

  return {
    name: name || track.name || 'MIDI import',
    bpm: parsed.bpm,
    ...(instrument ? { instrument } : {}),
    notes,
  };
}
