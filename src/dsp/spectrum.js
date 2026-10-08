// Heuristic chord matching against an FFT magnitude spectrum.
export const CHORD_SPECTRAL_MIN_DB = -72;

export const CHORD_SPECTRAL_MATCH_RATIO = 0.42;

export function peakDbNearFrequency(frequencyData, sampleRate, fftSize, frequency, radius = 1) {
  if (!frequencyData || !Number.isFinite(frequency) || frequency <= 0) {
    return -120;
  }
  const center = Math.round((frequency * fftSize) / sampleRate);
  if (!Number.isFinite(center)) return -120;

  let peak = -120;
  const start = Math.max(0, center - radius);
  const end = Math.min(frequencyData.length - 1, center + radius);
  for (let bin = start; bin <= end; bin += 1) {
    peak = Math.max(peak, frequencyData[bin]);
  }
  return peak;
}

export function spectralScoreForNoteFrequency(frequencyData, sampleRate, fftSize, frequency) {
  const harmonicWeights = [1.0, 0.62, 0.34];
  const harmonicMultipliers = [1, 2, 3];

  let score = 0;
  for (let i = 0; i < harmonicWeights.length; i += 1) {
    const harmonic = frequency * harmonicMultipliers[i];
    if (harmonic > sampleRate / 2) continue;
    const peakDb = peakDbNearFrequency(frequencyData, sampleRate, fftSize, harmonic, 1);
    const linear = 10 ** (peakDb / 20);
    score += harmonicWeights[i] * linear;
  }
  return score;
}

export function detectChordMatchesFromSpectrum(candidates, frequencyData, sampleRate, fftSize) {
  if (!Array.isArray(candidates) || !candidates.length || !frequencyData) {
    return { matched: [], scored: [] };
  }

  const scored = candidates.map((candidate) => {
    const fundamentalDb = peakDbNearFrequency(frequencyData, sampleRate, fftSize, candidate.freq, 1);
    const score = spectralScoreForNoteFrequency(frequencyData, sampleRate, fftSize, candidate.freq);
    return {
      candidate,
      fundamentalDb,
      score,
    };
  });

  const maxScore = scored.reduce((max, item) => Math.max(max, item.score), 0);
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { matched: [], scored };
  }

  const minimumScore = maxScore * CHORD_SPECTRAL_MATCH_RATIO;
  const matched = scored
    .filter((item) => item.score >= minimumScore && item.fundamentalDb >= CHORD_SPECTRAL_MIN_DB)
    .map((item) => item.candidate);

  return { matched, scored };
}
