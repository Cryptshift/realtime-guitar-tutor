// Runs "generate notes from a recording" in a Web Worker so long files never block the UI.
// Returns { promise, cancel }; the promise resolves to a raw piece.

function abortError() {
  const error = new Error('Cancelled');
  error.name = 'AbortError';
  return error;
}

export function startAudioToTab(file, { minNoteMs = 130, detector = {}, onProgress = () => {} } = {}) {
  let worker = null;
  let cancelled = false;
  let rejectJob = () => {};

  const promise = (async () => {
    const DecodeContext = window.AudioContext || window.webkitAudioContext;
    if (!DecodeContext) throw new Error('This browser cannot decode audio');
    const decoder = new DecodeContext();
    let audioBuffer;
    try {
      onProgress(0.05);
      const bytes = await file.arrayBuffer();
      audioBuffer = await decoder.decodeAudioData(bytes.slice(0));
    } finally {
      if (decoder.state !== 'closed') await decoder.close();
    }
    if (cancelled) throw abortError();
    onProgress(0.2);

    const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i).slice());
    worker = new Worker(new URL('../audio/audioToTab.worker.js', import.meta.url), { type: 'module' });
    const result = await new Promise((resolve, reject) => {
      rejectJob = reject;
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'progress') onProgress(0.2 + message.fraction * 0.75);
        else if (message.type === 'done') resolve(message);
        else if (message.type === 'error') reject(new Error(message.message));
      };
      worker.onerror = (event) => reject(new Error(event.message || 'Audio analysis failed'));
      worker.postMessage({
        channels,
        sampleRate: audioBuffer.sampleRate,
        minNoteMs,
        range: { minHz: detector.minHz, maxHz: detector.maxHz },
        frameSize: detector.frameSize,
      }, channels.map((channel) => channel.buffer));
    }).finally(() => worker?.terminate());

    if (!result.notes.length) throw new Error('No clear notes were found in that recording');
    onProgress(1);
    return {
      name: file.name.replace(/\.[a-z0-9]+$/i, '').trim() || 'Recording',
      bpm: result.bpm || 100,
      notes: result.notes,
    };
  })();

  return {
    promise,
    cancel() {
      cancelled = true;
      worker?.terminate();
      rejectJob(abortError());
    },
  };
}
