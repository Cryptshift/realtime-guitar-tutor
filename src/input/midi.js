// Web MIDI input: any MIDI keyboard or controller, with exact note-on/off timing and no
// pitch-detection latency. Feature-detected; Safari has no Web MIDI, so the UI hides it.

export function isWebMidiSupported(nav = globalThis.navigator) {
  return Boolean(nav && typeof nav.requestMIDIAccess === 'function');
}

export async function requestMidiAccess(nav = globalThis.navigator) {
  if (!isWebMidiSupported(nav)) throw new Error('This browser has no Web MIDI support');
  return nav.requestMIDIAccess({ sysex: false });
}

export function listMidiInputs(access) {
  if (!access?.inputs) return [];
  return [...access.inputs.values()].map((input) => ({
    id: input.id,
    name: input.name || 'MIDI input',
    manufacturer: input.manufacturer || '',
    connected: input.state !== 'disconnected',
  }));
}

// Decodes one MIDI message. Note-on with velocity 0 is a note-off.
export function parseMidiMessage(data) {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  const midi = data[1];
  const velocity = data[2];
  if (status === 0x90 && velocity > 0) return { type: 'on', midi, velocity, channel };
  if (status === 0x80 || status === 0x90) return { type: 'off', midi, velocity: 0, channel };
  return null;
}

// Listens to one input (deviceId) or every input (deviceId null/'all'), including devices
// plugged in later. Handlers receive { midi, velocity, channel, timeMs } where timeMs is the
// event timestamp on the performance.now() clock.
export function connectMidiInput(access, { deviceId = null, onNoteOn, onNoteOff, onDevicesChanged } = {}) {
  const attached = new Set();
  const handleMessage = (event) => {
    const message = parseMidiMessage(event.data);
    if (!message) return;
    const timeMs = Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : performance.now();
    const payload = { midi: message.midi, velocity: message.velocity, channel: message.channel, timeMs };
    if (message.type === 'on') onNoteOn?.(payload);
    else onNoteOff?.(payload);
  };
  const wanted = (input) => !deviceId || deviceId === 'all' || input.id === deviceId;
  const attachAll = () => {
    for (const input of access.inputs.values()) {
      if (wanted(input) && !attached.has(input)) {
        input.onmidimessage = handleMessage;
        attached.add(input);
      }
    }
  };
  attachAll();
  const previousStateChange = access.onstatechange;
  access.onstatechange = (event) => {
    attachAll();
    onDevicesChanged?.(listMidiInputs(access));
    previousStateChange?.(event);
  };
  return {
    stop() {
      attached.forEach((input) => {
        if (input.onmidimessage === handleMessage) input.onmidimessage = null;
      });
      attached.clear();
      access.onstatechange = previousStateChange || null;
    },
  };
}
