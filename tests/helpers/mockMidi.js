// A fake Web MIDI implementation for tests and browser checks.
export function createMockMidiAccess(names = ['Mock Keyboard']) {
  const inputs = new Map(names.map((name, i) => [`in-${i}`, {
    id: `in-${i}`,
    name,
    manufacturer: 'Test',
    state: 'connected',
    onmidimessage: null,
  }]));
  const access = {
    inputs,
    outputs: new Map(),
    onstatechange: null,
    // Simulates a key press/release on input `index`.
    send(index, bytes, timeStamp = performance.now()) {
      const input = [...inputs.values()][index];
      input.onmidimessage?.({ data: Uint8Array.from(bytes), timeStamp });
    },
    plugIn(name) {
      const id = `in-${inputs.size}`;
      inputs.set(id, { id, name, manufacturer: 'Test', state: 'connected', onmidimessage: null });
      access.onstatechange?.({ port: inputs.get(id) });
      return id;
    },
  };
  return access;
}

export function mockNavigator(access) {
  return { requestMIDIAccess: async () => access };
}
