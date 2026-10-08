// Import UI: URL import, audio-to-tab generation, custom piece loading.
import {
  resetTaskProgress,
  restartPiece,
  setActivePieceAsImported,
  setTaskProgress,
  syncBpmSliderWithPiece,
  syncPieceEditor,
} from './controls.js';
import { fetchTabPage, guessPieceNameFromUrl } from './import/fetch.js';
import { normalizePiece, parseCustomPieceInput } from './piece.js';
import { dom, state } from './state.js';

export function setImportStatus(message, isError = false) {
  dom.importStatus.textContent = message;
  dom.importStatus.style.color = isError ? 'var(--accent-2)' : 'var(--muted)';
}

export function setAudioTabStatus(message, isError = false) {
  dom.audioTabStatus.textContent = message;
  dom.audioTabStatus.style.color = isError ? 'var(--accent-2)' : 'var(--muted)';
}

export async function importTabFromUrl() {
  resetTaskProgress(dom.importProgress);
  const url = dom.tabUrlInput.value.trim();
  if (!url) {
    setImportStatus('Paste a tab URL first', true);
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    setImportStatus('That URL is invalid', true);
    return;
  }

  const pageImporter = state.instrument.importers?.page;
  if (!pageImporter) {
    setImportStatus(`URL import is not available for ${state.instrument.name}`, true);
    return;
  }

  const msPerColumn = Number(dom.msPerColumnInput.value || pageImporter.defaultMsPerColumn);
  if (!Number.isFinite(msPerColumn) || msPerColumn < 40 || msPerColumn > 500) {
    setImportStatus('ms/column must be between 40 and 500', true);
    return;
  }

  dom.importTabBtn.disabled = true;
  setImportStatus('Fetching and converting tabs...');
  setTaskProgress(dom.importProgress, 8);

  try {
    const { htmlOrText, via } = await fetchTabPage(parsedUrl.toString());
    setTaskProgress(dom.importProgress, 35);
    const imported = pageImporter.parse(htmlOrText, {
      pieceName: guessPieceNameFromUrl(parsedUrl.toString()),
      msPerColumn,
      simplifyToSingleNotes: state.simplifyTabs,
    });
    if (imported.msPerColumn) {
      dom.msPerColumnInput.value = String(imported.msPerColumn);
    }
    setTaskProgress(dom.importProgress, 75);
    const normalized = normalizePiece(imported.piece, state.instrument);
    setTaskProgress(dom.importProgress, 90);

    setActivePieceAsImported(normalized);
    dom.customLoadStatus.textContent = `Imported piece loaded (${normalized.notes.length} notes)`;
    setTaskProgress(dom.importProgress, 100);

    const detailBits = [...imported.details];
    detailBits.push(state.simplifyTabs ? 'Mode: beginner simplify' : 'Mode: chord-preserving');

    setImportStatus(
      `Imported ${normalized.notes.length} notes via ${via}${detailBits.length ? `. ${detailBits.join(' · ')}.` : '.'}`,
    );
  } catch (error) {
    setTaskProgress(dom.importProgress, 100);
    setImportStatus(
      `Import failed: ${error.message}. If the site or proxies block it, copy the tab text and paste it into the Custom Piece box below.`,
      true,
    );
  } finally {
    dom.importTabBtn.disabled = false;
  }
}

// The running audio-to-tab job, so it can be cancelled.
let audioTabJob = null;

function runAudioToTabWorker(payload, transfer, onProgress) {
  const worker = new Worker(new URL('./audio/audioToTab.worker.js', import.meta.url), { type: 'module' });
  let rejectJob;
  const promise = new Promise((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress(message.fraction);
      } else if (message.type === 'done') {
        worker.terminate();
        resolve(message);
      } else if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Audio analysis worker failed'));
    };
  });
  worker.postMessage(payload, transfer);
  return {
    promise,
    cancel() {
      worker.terminate();
      const error = new Error('Cancelled');
      error.name = 'AbortError';
      rejectJob(error);
    },
  };
}

export async function generatePieceFromAudio(file, minNoteMs, onProgress = () => {}) {
  const DecodeContext = window.AudioContext || window.webkitAudioContext;
  if (!DecodeContext) {
    throw new Error('Browser audio decoding is not supported');
  }
  const decodeContext = new DecodeContext();
  let audioBuffer;
  try {
    onProgress(10);
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    if (decodeContext.state !== 'closed') {
      await decodeContext.close();
    }
  }
  onProgress(20);
  if (audioTabJob === null) {
    // Cancelled while decoding.
    const error = new Error('Cancelled');
    error.name = 'AbortError';
    throw error;
  }

  // Copy the channels out of the AudioBuffer so they can be transferred to the worker.
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => audioBuffer.getChannelData(i).slice());
  const job = runAudioToTabWorker(
    {
      channels,
      sampleRate: audioBuffer.sampleRate,
      minNoteMs,
      range: { minHz: state.instrument.detector?.minHz, maxHz: state.instrument.detector?.maxHz },
      frameSize: state.instrument.detector?.frameSize,
    },
    channels.map((channel) => channel.buffer),
    (fraction) => onProgress(20 + fraction * 75),
  );
  audioTabJob = job;
  const { notes: detectedNotes, bpm: bpmGuess } = await job.promise;
  if (!detectedNotes.length) {
    throw new Error('No stable notes detected');
  }

  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '').trim() || 'Audio Import';
  return {
    name: `${baseName} (Audio Tabs)`,
    bpm: bpmGuess || 100,
    notes: detectedNotes,
  };
}

export function cancelAudioTabGeneration() {
  const job = audioTabJob;
  audioTabJob = null;
  if (job && typeof job.cancel === 'function') {
    job.cancel();
  }
}

export async function generateTabsFromAudio() {
  resetTaskProgress(dom.audioTabProgress);
  const file = dom.audioTabInput.files?.[0];
  if (!file) {
    setAudioTabStatus('Select an audio file first', true);
    return;
  }

  const minNoteMs = Number(dom.audioTabMinMs.value || 130);
  if (!Number.isFinite(minNoteMs) || minNoteMs < 80 || minNoteMs > 800) {
    setAudioTabStatus('Minimum note length must be between 80ms and 800ms', true);
    return;
  }

  dom.generateAudioTabBtn.disabled = true;
  dom.cancelAudioTabBtn.hidden = false;
  audioTabJob = { pending: true };
  setAudioTabStatus('Analyzing audio and generating tabs... (the page stays usable; Cancel stops it)');
  setTaskProgress(dom.audioTabProgress, 5);

  try {
    const piece = await generatePieceFromAudio(file, minNoteMs, (progress) => {
      setTaskProgress(dom.audioTabProgress, progress);
    });
    const normalized = normalizePiece(piece, state.instrument);
    setTaskProgress(dom.audioTabProgress, 97);
    setActivePieceAsImported(normalized);
    setTaskProgress(dom.audioTabProgress, 100);
    dom.customLoadStatus.textContent = `Audio tabs generated (${normalized.notes.length} notes)`;
    setAudioTabStatus(
      `Generated ${normalized.notes.length} notes. BPM guess: ${piece.bpm || 'n/a'}. Best with a clean single-note recording.`,
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      resetTaskProgress(dom.audioTabProgress);
      setAudioTabStatus('Audio tab generation cancelled.');
    } else {
      setTaskProgress(dom.audioTabProgress, 100);
      setAudioTabStatus(`Audio tab generation failed: ${error.message}`, true);
    }
  } finally {
    audioTabJob = null;
    dom.generateAudioTabBtn.disabled = false;
    dom.cancelAudioTabBtn.hidden = true;
  }
}

export function loadCustomPiece() {
  const raw = dom.customPiece.value.trim();
  if (!raw) {
    dom.customLoadStatus.textContent = 'Custom piece is empty';
    return;
  }

  try {
    const defaultMsPerColumn = state.instrument.importers?.page?.defaultMsPerColumn;
    const msPerColumn = Number(dom.msPerColumnInput.value || defaultMsPerColumn);
    const pieceLike = parseCustomPieceInput(raw, {
      msPerColumn: Number.isFinite(msPerColumn) ? msPerColumn : defaultMsPerColumn,
      simplifyToSingleNotes: state.simplifyTabs,
    }, state.instrument);
    const normalized = normalizePiece(pieceLike, state.instrument);

    state.activePiece = normalized;
    syncBpmSliderWithPiece(normalized);
    dom.customLoadStatus.textContent = pieceLike.importedFrom === 'ascii-tab'
      ? `Converted pasted tab to ${normalized.notes.length} notes (editor now shows the JSON)`
      : `Custom piece loaded (${normalized.notes.length} notes)`;
    syncPieceEditor(normalized);
    dom.songSelect.selectedIndex = -1;
    restartPiece();
  } catch (error) {
    dom.customLoadStatus.textContent = `Invalid custom piece: ${error.message}`;
  }
}
