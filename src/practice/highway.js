// Note highway: upcoming notes scroll from the right toward a hit line. One lane per
// string (fretted, in tab order) or per pitch (piano); blocks show the fret number or key.
// Hits get a check mark, misses a cross and a hollow outline: never colour alone.
// Two-handed pieces: left-hand blocks are hatched (and the current one is ink, not the
// accent); the hand that isn't being practised is drawn faintly, outline only.

function cssVar(name, element = document.documentElement) {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

export function createHighway(canvas, { piece, instrument }) {
  const ctx = canvas.getContext('2d');
  const layout = instrument.highwayLayout(piece);
  const beatSeconds = 60 / (piece.bpm || 100);
  const beatsPerBar = piece.beatsPerBar || 4;
  let colors = {};
  let width = 0;
  let height = 0;
  let displayPosition = null;
  let lastMs = 0;

  function readColors() {
    colors = {
      bg: cssVar('--sunken'),
      lane: cssVar('--surface'),
      border: cssVar('--border'),
      grid: cssVar('--border-strong'),
      text: cssVar('--text'),
      muted: cssVar('--muted'),
      accent: cssVar('--accent'),
      onAccent: cssVar('--on-accent'),
      hit: cssVar('--hit'),
      miss: cssVar('--miss'),
      onHit: cssVar('--on-hit'),
      close: cssVar('--close'),
      font: cssVar('--font-mono') || 'ui-monospace, monospace',
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawCheck(cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.5, cy);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.38);
    ctx.lineTo(cx + size * 0.55, cy - size * 0.42);
    ctx.stroke();
  }

  // Diagonal pencil hatching inside the current path (a note block).
  function hatch(x, y, w, h, color, alpha) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha *= alpha;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -h; i < w; i += 7) {
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCross(cx, cy, size) {
    ctx.beginPath();
    ctx.moveTo(cx - size / 2, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy + size / 2);
    ctx.moveTo(cx + size / 2, cy - size / 2);
    ctx.lineTo(cx - size / 2, cy + size / 2);
    ctx.stroke();
  }

  readColors();
  resize();

  return {
    resize,
    refreshTheme: readColors,

    draw(view, nowMs, { reducedMotion = false } = {}) {
      if (!width || !height) resize();
      // Smoothly glide to the new position in "Wait for me" (jump when motion is reduced).
      const dt = lastMs ? Math.min(0.1, (nowMs - lastMs) / 1000) : 0;
      lastMs = nowMs;
      if (displayPosition === null || reducedMotion || view.mode === 'play') {
        displayPosition = view.position;
      } else {
        displayPosition += (view.position - displayPosition) * (1 - Math.exp(-dt * 12));
        if (Math.abs(view.position - displayPosition) < 0.002) displayPosition = view.position;
      }
      const position = displayPosition;

      const labelWidth = width < 480 ? 34 : 46;
      const hitX = labelWidth + Math.max(70, (width - labelWidth) * 0.2);
      const aheadBeats = width < 480 ? 6 : 9;
      const pxPerSecond = (width - hitX) / (aheadBeats * beatSeconds);
      const top = 10;
      const laneCount = Math.max(1, layout.lanes.length);
      const laneHeight = (height - top * 2) / laneCount;
      const xAt = (seconds) => hitX + (seconds - position) * pxPerSecond;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);

      // Lanes and labels.
      ctx.font = `600 ${Math.min(20, Math.max(13, laneHeight * 0.42))}px ${colors.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      layout.lanes.forEach((lane, i) => {
        const y = top + i * laneHeight;
        if (i % 2 === 0) {
          ctx.fillStyle = colors.lane;
          ctx.globalAlpha = 0.45;
          ctx.fillRect(labelWidth, y, width - labelWidth, laneHeight);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = colors.muted;
        ctx.fillText(lane.label, labelWidth / 2, y + laneHeight / 2);
      });

      // Loop region.
      if (view.loop) {
        const x0 = xAt(view.loop.start);
        const x1 = xAt(view.loop.end);
        ctx.fillStyle = colors.close;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(Math.max(labelWidth, x0), 0, Math.max(0, x1 - Math.max(labelWidth, x0)), height);
        ctx.globalAlpha = 1;
      }

      // Beat grid (bar lines stronger).
      const firstBeat = Math.floor((position - (hitX - labelWidth) / pxPerSecond) / beatSeconds);
      const lastBeat = Math.ceil((position + (width - hitX) / pxPerSecond) / beatSeconds);
      for (let beat = Math.max(0, firstBeat); beat <= lastBeat; beat += 1) {
        const x = xAt(beat * beatSeconds);
        if (x < labelWidth) continue;
        const isBar = Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) < 1e-6;
        ctx.strokeStyle = colors.grid;
        ctx.globalAlpha = isBar ? 0.7 : 0.25;
        ctx.lineWidth = isBar ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, height - top);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Notes.
      const currentIndexes = new Set(view.current.map((note) => note.index));
      const pad = Math.max(3, laneHeight * 0.12);
      const fontSize = Math.min(24, Math.max(13, laneHeight * 0.55));
      const isActive = view.isActive || (() => true);
      const twoHanded = Boolean(view.twoHanded);
      piece.notes.forEach((note) => {
        if (note.playable === false) return;
        const lane = layout.laneOf(note);
        if (lane < 0) return;
        const x0 = xAt(note.start);
        const x1 = Math.max(x0 + Math.max(28, fontSize * 1.6), xAt(note.end) - 2);
        if (x1 < labelWidth || x0 > width) return;
        const y = top + lane * laneHeight + pad;
        const h = laneHeight - pad * 2;
        const left = twoHanded && note.hand === 'L';
        const bx = Math.max(labelWidth, x0);
        const bw = x1 - bx;
        roundRect(bx, y, bw, h, 4);

        // The hand that isn't being practised: faint outline, not scored.
        if (!isActive(note)) {
          ctx.globalAlpha = 0.32;
          ctx.strokeStyle = colors.text;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (left) hatch(bx, y, bw, h, colors.text, 0.8);
          const labelX = Math.max(labelWidth + fontSize, x0 + fontSize * 0.9);
          if (labelX < x1) {
            ctx.fillStyle = colors.text;
            ctx.font = `600 ${fontSize}px ${colors.font}`;
            ctx.fillText(layout.labelOf(note), labelX, y + h / 2 + 1);
          }
          ctx.globalAlpha = 1;
          return;
        }

        const result = view.results[note.index] || {};
        const isCurrent = currentIndexes.has(note.index) && !result.hit;
        let labelColor = colors.text;
        if (result.hit) {
          ctx.fillStyle = colors.hit;
          ctx.fill();
          labelColor = colors.onHit;
        } else if (result.missed) {
          ctx.strokeStyle = colors.miss;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          labelColor = colors.miss;
        } else if (isCurrent && left) {
          // Current left-hand note: ink (or cream) block with an accent edge.
          ctx.fillStyle = colors.text;
          ctx.fill();
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 3;
          ctx.stroke();
          labelColor = colors.lane;
        } else if (isCurrent) {
          ctx.fillStyle = colors.accent;
          ctx.fill();
          ctx.strokeStyle = colors.text;
          ctx.lineWidth = 3;
          ctx.stroke();
          labelColor = colors.onAccent;
        } else {
          // Upcoming: ink (or cream) outline on the paper; hatched for the left hand.
          ctx.fillStyle = colors.lane;
          ctx.fill();
          if (left) {
            hatch(bx, y, bw, h, colors.text, 0.35);
            roundRect(bx, y, bw, h, 4);
          }
          ctx.strokeStyle = colors.text;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        const labelX = Math.max(labelWidth + fontSize, x0 + fontSize * 0.9);
        if (labelX < x1) {
          ctx.fillStyle = labelColor;
          ctx.font = `600 ${fontSize}px ${colors.font}`;
          ctx.fillText(layout.labelOf(note), labelX, y + h / 2 + 1);
        }
        const markX = Math.min(x1 - fontSize * 0.7, labelX + fontSize * 1.3);
        if ((result.hit || result.missed) && markX > labelX + fontSize * 0.8) {
          ctx.strokeStyle = result.hit ? colors.onHit : colors.miss;
          ctx.lineWidth = 3;
          if (result.hit) drawCheck(markX, y + h / 2, fontSize * 0.6);
          else drawCross(markX, y + h / 2, fontSize * 0.5);
        }
      });

      // Hit line.
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hitX, 4);
      ctx.lineTo(hitX, height - 4);
      ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.moveTo(hitX - 9, 0);
      ctx.lineTo(hitX + 9, 0);
      ctx.lineTo(hitX, 10);
      ctx.closePath();
      ctx.fill();
    },
  };
}
