// AudioWorkletProcessor that turns the microphone into overlapping analysis frames.
// Runs on the audio rendering thread, so it only copies samples: every `hopSize` samples
// it posts the latest `frameSize` samples (plus the context time of the frame's last
// sample) to the detector worker over a MessagePort. Buffers are recycled by the worker,
// and if none are free the frame is skipped instead of allocating on the audio thread.
// Kept dependency-free so it can be loaded as-is with audioWorklet.addModule().

class FrameCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { frameSize = 2048, hopSize = 256, poolSize = 8 } = options?.processorOptions || {};
    this.frameSize = frameSize;
    this.hopSize = hopSize;
    this.ring = new Float32Array(frameSize);
    this.writeIndex = 0;
    this.filled = 0;
    this.sinceLastFrame = 0;
    this.pool = Array.from({ length: poolSize }, () => new Float32Array(frameSize));
    this.out = null;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'connect') {
        this.out = event.data.port;
        this.out.onmessage = (message) => {
          const buffer = message.data?.buffer;
          if (message.data?.type === 'recycle' && buffer?.length === this.frameSize) {
            this.pool.push(buffer);
          }
        };
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    const blockSize = input?.[0]?.length || 128;
    for (let i = 0; i < blockSize; i += 1) {
      let sample = 0;
      for (let channel = 0; channel < input.length; channel += 1) sample += input[channel][i];
      this.ring[this.writeIndex] = input.length ? sample / input.length : 0;
      this.writeIndex = (this.writeIndex + 1) % this.frameSize;
    }
    this.filled = Math.min(this.frameSize, this.filled + blockSize);
    this.sinceLastFrame += blockSize;

    if (this.out && this.filled === this.frameSize && this.sinceLastFrame >= this.hopSize) {
      this.sinceLastFrame = 0;
      const frame = this.pool.pop();
      if (frame) {
        // Oldest sample first.
        const head = this.ring.subarray(this.writeIndex);
        frame.set(head, 0);
        frame.set(this.ring.subarray(0, this.writeIndex), head.length);
        this.out.postMessage(
          { type: 'frame', samples: frame, endTime: currentTime + blockSize / sampleRate },
          [frame.buffer],
        );
      }
    }
    return true;
  }
}

registerProcessor('frame-capture', FrameCaptureProcessor);
