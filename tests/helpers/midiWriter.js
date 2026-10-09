// Tiny Standard MIDI File writer for tests. Events: { delta, bytes: [...] }.
const vlq = (value) => {
  const out = [value & 0x7f];
  let rest = value >> 7;
  while (rest) {
    out.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return out;
};

const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

export const meta = {
  tempo: (bpm) => {
    const us = Math.round(60e6 / bpm);
    return [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
  },
  name: (text) => [0xff, 0x03, ...vlq(text.length), ...ascii(text)],
  end: () => [0xff, 0x2f, 0x00],
};

export function writeMidi({ format = 1, ticksPerQuarter = 480, tracks }) {
  const bytes = [...ascii('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(ticksPerQuarter)];
  tracks.forEach((events) => {
    const body = events.flatMap((event) => [...vlq(event.delta), ...event.bytes]);
    bytes.push(...ascii('MTrk'), ...u32(body.length), ...body);
  });
  return new Uint8Array(bytes);
}

// A track from a note list: [{ midi, start, length, velocity? }] in ticks, on `channel`
// (0-based). Note-offs come before note-ons at the same tick.
export function trackFromNotes({ name = '', channel = 0, notes, tempo = null }) {
  const events = [];
  notes.forEach((note) => {
    events.push({ tick: note.start, order: 1, bytes: [0x90 | channel, note.midi, note.velocity ?? 80] });
    events.push({ tick: note.start + note.length, order: 0, bytes: [0x80 | channel, note.midi, 0] });
  });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = [];
  if (name) out.push({ delta: 0, bytes: meta.name(name) });
  if (tempo) out.push({ delta: 0, bytes: meta.tempo(tempo) });
  let tick = 0;
  events.forEach((event) => {
    out.push({ delta: event.tick - tick, bytes: event.bytes });
    tick = event.tick;
  });
  out.push({ delta: 0, bytes: meta.end() });
  return out;
}
