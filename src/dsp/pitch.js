// Monophonic pitch detection (McLeod Pitch Method / NSDF) and RMS.
export const FFT_SIZE = 2048;

export const MIN_PITCH_CLARITY = 0.7;

export const MPM_PEAK_THRESHOLD = 0.9;

export const PITCH_MIN_HZ = 60;

export const PITCH_MAX_HZ = 1400;

export const MIN_SIGNAL_RMS = 0.0025;

export function computeRms(buf) {
  let rms = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const val = buf[i];
    rms += val * val;
  }
  return Math.sqrt(rms / buf.length);
}

// McLeod Pitch Method (normalized square difference function, NSDF).
// Unlike raw autocorrelation, the NSDF is normalized per lag, so it has no bias toward
// short lags (raw ACF read low strings 5-12 cents sharp) and its peaks are directly
// comparable: we take the first key maximum within MPM_PEAK_THRESHOLD of the highest one,
// which avoids both harmonic (octave-up) and sub-harmonic (octave-down) errors.
// Only lags for PITCH_MIN_HZ..PITCH_MAX_HZ (the guitar range) are evaluated.
export const pitchScratch = { x: new Float32Array(0), nsdf: new Float64Array(0) };

export function detectPitch(buf, sampleRate) {
  const size = buf.length;
  if (size < 4 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  if (pitchScratch.x.length < size) pitchScratch.x = new Float32Array(size);
  const x = pitchScratch.x;

  let mean = 0;
  for (let i = 0; i < size; i += 1) mean += buf[i];
  mean /= size;

  let energy = 0;
  for (let i = 0; i < size; i += 1) {
    const value = buf[i] - mean;
    x[i] = value;
    energy += value * value;
  }
  if (Math.sqrt(energy / size) < MIN_SIGNAL_RMS) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
  const maxLag = Math.min(size - 2, Math.ceil(sampleRate / PITCH_MIN_HZ));
  if (maxLag <= minLag) return null;
  const lagCount = maxLag + 2;
  if (pitchScratch.nsdf.length < lagCount) pitchScratch.nsdf = new Float64Array(lagCount);
  const nsdf = pitchScratch.nsdf;

  // m(tau) = sum(x[j]^2 + x[j+tau]^2) over the overlap, updated incrementally.
  let m = 2 * energy;
  for (let tau = 0; tau < lagCount; tau += 1) {
    if (tau > 0) {
      const head = x[tau - 1];
      const tail = x[size - tau];
      m -= head * head + tail * tail;
    }
    let acf = 0;
    const overlap = size - tau;
    for (let j = 0; j < overlap; j += 1) acf += x[j] * x[j + tau];
    nsdf[tau] = m > 1e-12 ? (2 * acf) / m : 0;
  }

  // Key maxima: the highest point of each positive lobe after the lobe around lag 0.
  let tau = 1;
  while (tau < lagCount && nsdf[tau] > 0) tau += 1;
  let highest = 0;
  let lobeMax = -1;
  const keyMaxima = [];
  const pushKeyMax = (lag) => {
    if (lag < minLag || lag > maxLag) return;
    keyMaxima.push(lag);
    if (nsdf[lag] > highest) highest = nsdf[lag];
  };
  for (; tau < lagCount - 1; tau += 1) {
    if (nsdf[tau] > 0) {
      if (lobeMax < 0 || nsdf[tau] > nsdf[lobeMax]) lobeMax = tau;
    } else if (lobeMax >= 0) {
      pushKeyMax(lobeMax);
      lobeMax = -1;
    }
  }
  if (lobeMax >= 0) pushKeyMax(lobeMax);
  if (!keyMaxima.length || highest <= 0) return null;

  const chosen = keyMaxima.find((lag) => nsdf[lag] >= MPM_PEAK_THRESHOLD * highest);
  const x1 = nsdf[chosen - 1];
  const x2 = nsdf[chosen];
  const x3 = nsdf[chosen + 1];
  const denominator = x1 - 2 * x2 + x3;
  const shift = denominator !== 0 ? (x1 - x3) / (2 * denominator) : 0;
  const period = chosen + shift;
  const clarity = x2 - ((x1 - x3) * shift) / 4;
  if (!Number.isFinite(period) || period <= 0 || clarity < MIN_PITCH_CLARITY) return null;

  const frequency = sampleRate / period;
  if (!Number.isFinite(frequency) || frequency < PITCH_MIN_HZ || frequency > PITCH_MAX_HZ) return null;

  return { frequency, confidence: clarity };
}
