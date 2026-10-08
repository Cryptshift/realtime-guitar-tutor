// Deterministic synthetic test signals for the pitch/onset tests.

export function createRandom(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// Harmonic tone: amplitudes[k] is the weight of harmonic k+1. Random but seeded phases.
export function tone({
  frequency,
  sampleRate,
  length = 2048,
  amplitudes = [1],
  gain = 0.05,
  noise = 0,
  decayPerSecond = 0,
  seed = 1,
}) {
  const random = createRandom(seed);
  const phases = amplitudes.map(() => random() * 2 * Math.PI);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let value = 0;
    for (let k = 0; k < amplitudes.length; k += 1) {
      value += amplitudes[k] * Math.sin((2 * Math.PI * frequency * (k + 1) * i) / sampleRate + phases[k]);
    }
    out[i] = gain * Math.exp((-decayPerSecond * i) / sampleRate) * value + noise * (random() * 2 - 1);
  }
  return out;
}

export function whiteNoise({ length = 2048, gain = 0.01, seed = 1 }) {
  const random = createRandom(seed);
  return Float32Array.from({ length }, () => gain * (random() * 2 - 1));
}

// Concatenated plucked notes (exponential decay), one per `noteSeconds`.
export function pluckedSequence({ frequencies, sampleRate, noteSeconds = 1, gain = 0.1 }) {
  const perNote = Math.round(noteSeconds * sampleRate);
  const out = new Float32Array(perNote * frequencies.length);
  frequencies.forEach((frequency, n) => {
    for (let i = 0; i < perNote; i += 1) {
      const t = i / sampleRate;
      const phase = (2 * Math.PI * frequency * i) / sampleRate;
      out[n * perNote + i] = gain * Math.exp(-3 * t) * (Math.sin(phase) + 0.6 * Math.sin(2 * phase));
    }
  });
  return out;
}
