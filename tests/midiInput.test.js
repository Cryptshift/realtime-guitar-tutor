import { describe, expect, it } from 'vitest';
import {
  connectMidiInput,
  isWebMidiSupported,
  listMidiInputs,
  parseMidiMessage,
  requestMidiAccess,
} from '../src/input/midi.js';
import { createMockMidiAccess, mockNavigator } from './helpers/mockMidi.js';

describe('Web MIDI input', () => {
  it('feature-detects Web MIDI', () => {
    expect(isWebMidiSupported({})).toBe(false);
    expect(isWebMidiSupported(mockNavigator(createMockMidiAccess()))).toBe(true);
  });

  it('parses note on/off, treating velocity 0 as off', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'on', midi: 60, velocity: 100, channel: 0 });
    expect(parseMidiMessage([0x93, 60, 0])).toMatchObject({ type: 'off', channel: 3 });
    expect(parseMidiMessage([0x80, 60, 64])).toMatchObject({ type: 'off' });
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull();
  });

  it('lists devices and delivers notes with their timestamps, including hot-plugged ones', async () => {
    const access = await requestMidiAccess(mockNavigator(createMockMidiAccess(['Keys A', 'Pads'])));
    expect(listMidiInputs(access).map((d) => d.name)).toEqual(['Keys A', 'Pads']);

    const events = [];
    const connection = connectMidiInput(access, {
      onNoteOn: (e) => events.push(['on', e.midi, e.timeMs]),
      onNoteOff: (e) => events.push(['off', e.midi, e.timeMs]),
    });
    access.send(0, [0x90, 64, 90], 1000);
    access.send(1, [0x90, 36, 90], 1001);
    access.send(0, [0x90, 64, 0], 1500);
    access.plugIn('Late Keys');
    access.send(2, [0x90, 67, 50], 2000);
    expect(events).toEqual([['on', 64, 1000], ['on', 36, 1001], ['off', 64, 1500], ['on', 67, 2000]]);

    connection.stop();
    access.send(0, [0x90, 65, 90], 3000);
    expect(events).toHaveLength(4);
  });

  it('can listen to a single device', async () => {
    const access = await requestMidiAccess(mockNavigator(createMockMidiAccess(['Keys A', 'Pads'])));
    const notes = [];
    connectMidiInput(access, { deviceId: 'in-1', onNoteOn: (e) => notes.push(e.midi) });
    access.send(0, [0x90, 60, 90]);
    access.send(1, [0x90, 40, 90]);
    expect(notes).toEqual([40]);
  });
});
