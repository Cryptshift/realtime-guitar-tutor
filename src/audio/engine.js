// Audio I/O for the app, independent of any screen.
//  - Input: the microphone (AudioWorklet capture -> detector Web Worker) or a Web MIDI
//    device. Consumers subscribe to 'analysis' (mic frames), 'noteon'/'noteoff' (MIDI) and
//    'level' events.
//  - Output: metronome clicks, a guide tone, and the shared AudioContext clock.
import { detectChordMatchesFromSpectrum } from '../dsp/spectrum.js';
import { FFT_SIZE } from '../dsp/pitch.js';
import { frequencyToFractionalMidi } from '../music.js';
import { connectMidiInput, isWebMidiSupported, listMidiInputs, requestMidiAccess } from '../input/midi.js';

// Analysis frames: a frameSize window every 256 samples (~5.3 ms at 48 kHz).
const ANALYSIS_HOP_SIZE = 256;
const FRAME_POOL_SIZE = 8;

export function createAudioEngine() {
  let ctx = null;
  let input = null; // { kind: 'mic'|'midi', ... }
  let midiAccess = null;
  let guide = null;
  const listeners = new Map();

  const emit = (type, payload) => listeners.get(type)?.forEach((fn) => fn(payload));

  async function ensureContext() {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Resumed later on the next user gesture.
      }
    }
    return ctx;
  }

  const contextTimeToPerfMs = (contextTime) => performance.now() - (ctx.currentTime - contextTime) * 1000;
  const perfMsToContextTime = (ms) => ctx.currentTime + (ms - performance.now()) / 1000;

  async function startMic({ deviceId = null, detector = {} } = {}) {
    let stream = null;
    let worker = null;
    let captureNode = null;
    let sink = null;
    let source = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone');
      // Raw signal: speech processing damps sustained notes and pumps the level.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
          channelCount: 1,
        },
        video: false,
      });
      const audioCtx = await ensureContext();
      if (!audioCtx.audioWorklet || typeof Worker === 'undefined') {
        throw new Error('This browser lacks AudioWorklet or Web Worker support');
      }
      await audioCtx.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url));

      const frameSize = detector.frameSize || FFT_SIZE;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = frameSize;
      analyser.smoothingTimeConstant = 0.8;
      const spectrum = new Float32Array(analyser.frequencyBinCount);

      worker = new Worker(new URL('./detector.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const result = event.data;
        if (result?.type !== 'analysis' || !ctx) return;
        const payload = {
          timeMs: contextTimeToPerfMs(result.endTime),
          frequency: result.frequency,
          midi: result.frequency ? frequencyToFractionalMidi(result.frequency) : null,
          clarity: result.clarity,
          rms: result.rms,
          onsetTimeMs: result.onsetTime === null ? null : contextTimeToPerfMs(result.onsetTime),
        };
        emit('analysis', payload);
        emit('level', { rms: result.rms, timeMs: payload.timeMs });
      };
      const channel = new MessageChannel();
      worker.postMessage({
        type: 'init',
        port: channel.port2,
        sampleRate: audioCtx.sampleRate,
        hopSize: ANALYSIS_HOP_SIZE,
        range: { minHz: detector.minHz, maxHz: detector.maxHz },
      }, [channel.port2]);

      captureNode = new AudioWorkletNode(audioCtx, 'frame-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { frameSize, hopSize: ANALYSIS_HOP_SIZE, poolSize: FRAME_POOL_SIZE },
      });
      captureNode.port.postMessage({ type: 'connect', port: channel.port1 }, [channel.port1]);
      // A muted path to the destination keeps the worklet in the rendered graph.
      sink = audioCtx.createGain();
      sink.gain.value = 0;
      captureNode.connect(sink);
      sink.connect(audioCtx.destination);

      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      source.connect(captureNode);

      input = { kind: 'mic', stream, worker, captureNode, sink, source, analyser, spectrum };
      const label = stream.getAudioTracks()[0]?.label || 'Microphone';
      emit('input', { kind: 'mic', label });
      return { kind: 'mic', label };
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      worker?.terminate();
      captureNode?.disconnect();
      sink?.disconnect();
      source?.disconnect();
      throw error;
    }
  }

  async function startMidi({ deviceId = null } = {}) {
    midiAccess = midiAccess || await requestMidiAccess();
    await ensureContext();
    const connection = connectMidiInput(midiAccess, {
      deviceId,
      onNoteOn: (event) => {
        emit('noteon', event);
        emit('level', { rms: event.velocity / 127 / 8, timeMs: event.timeMs });
      },
      onNoteOff: (event) => emit('noteoff', event),
      onDevicesChanged: (devices) => emit('devices', devices),
    });
    const devices = listMidiInputs(midiAccess);
    const label = deviceId ? devices.find((d) => d.id === deviceId)?.name : devices.map((d) => d.name).join(', ');
    input = { kind: 'midi', connection, devices };
    emit('input', { kind: 'midi', label: label || 'MIDI', devices });
    return { kind: 'midi', label: label || 'MIDI', devices };
  }

  function stopInput() {
    if (!input) return;
    if (input.kind === 'mic') {
      input.source?.disconnect();
      input.captureNode?.disconnect();
      input.sink?.disconnect();
      input.worker?.terminate();
      input.stream?.getTracks().forEach((track) => track.stop());
    } else if (input.kind === 'midi') {
      input.connection?.stop();
    }
    input = null;
  }

  return {
    get context() { return ctx; },
    get inputKind() { return input?.kind || null; },
    isMidiSupported: () => isWebMidiSupported(),
    ensureContext,
    contextTimeToPerfMs,
    perfMsToContextTime,

    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },

    // source: 'mic' | 'midi'. Replaces any running input.
    async start({ source = 'mic', deviceId = null, detector = {} } = {}) {
      stopInput();
      return source === 'midi' ? startMidi({ deviceId }) : startMic({ deviceId, detector });
    },

    stop: stopInput,

    async listDevices() {
      const result = { mic: [], midi: [] };
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.() || [];
        result.mic = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({ id: d.deviceId, name: d.label || `Microphone ${i + 1}` }));
      } catch {
        // Device labels need permission; keep the list empty.
      }
      if (isWebMidiSupported()) {
        try {
          midiAccess = midiAccess || await requestMidiAccess();
          result.midi = listMidiInputs(midiAccess);
        } catch {
          result.midi = [];
        }
      }
      return result;
    },

    // Chord matching from the microphone spectrum (heuristic; "require full shape").
    matchChord(candidates) {
      if (input?.kind !== 'mic' || !ctx) return [];
      input.analyser.getFloatFrequencyData(input.spectrum);
      return detectChordMatchesFromSpectrum(candidates, input.spectrum, ctx.sampleRate, input.analyser.fftSize).matched;
    },

    // A short click at performance time `atMs` (accent = downbeat).
    click(atMs, { accent = false, volume = 0.5 } = {}) {
      if (!ctx || ctx.state !== 'running') return;
      const when = Math.max(ctx.currentTime, perfMsToContextTime(atMs));
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = accent ? 1760 : 1175;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * (accent ? 0.5 : 0.32)), when + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.06);
    },

    // Guide tone at `frequency` Hz (null = silent). volume 0..1.
    setGuideTone(frequency, volume = 0.3) {
      if (!ctx || ctx.state !== 'running') return;
      if (!guide) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.connect(gain);
        osc.start();
        guide = { osc, gain };
      }
      const now = ctx.currentTime;
      guide.gain.gain.cancelScheduledValues(now);
      if (frequency) {
        guide.osc.frequency.setTargetAtTime(frequency, now, 0.012);
        guide.gain.gain.setTargetAtTime(0.12 * volume, now, 0.02);
      } else {
        guide.gain.gain.setTargetAtTime(0, now, 0.02);
      }
    },

    async close() {
      stopInput();
      if (guide) {
        guide.osc.stop();
        guide.osc.disconnect();
        guide.gain.disconnect();
        guide = null;
      }
      if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
