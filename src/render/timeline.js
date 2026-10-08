// Builds and renders the position-change timeline.
import { chordGroupBoundsAtIndex } from '../piece.js';
import { chordGroupForNote } from '../scoring.js';
import { dom, state } from '../state.js';
import { clamp01, formatClock, setText } from '../util.js';

export function resetTimelineCaches() {
  state.timelineCache = null;
  state.timelineDomCache = null;
  state.timelineVisualTime = null;
  state.timelineVisualLastMs = 0;
  state.fingerboardSignature = '';
}

function groupLabel(note) {
  return note ? state.instrument.describeGroup(note, chordGroupForNote(note)) : '--';
}

export function buildTimelineSegments(notes) {
  const anchors = [];
  let cursor = 0;
  while (cursor < notes.length) {
    if (state.simplifyTabs) {
      anchors.push(cursor);
      cursor += 1;
      continue;
    }

    const { startIndex, endIndex } = chordGroupBoundsAtIndex(notes, cursor);
    if (startIndex < 0 || endIndex < startIndex) {
      cursor += 1;
      continue;
    }
    anchors.push(startIndex);
    cursor = endIndex + 1;
  }

  const totalDuration = Math.max(0.1, state.activePiece?.totalDuration || notes.at(-1)?.end || 0.1);
  const segments = [];

  anchors.forEach((anchorIndex, idx) => {
    const anchorNote = notes[anchorIndex];
    if (!anchorNote) return;
    const nextAnchor = anchors[idx + 1];
    const nextStart = Number.isInteger(nextAnchor)
      ? notes[nextAnchor]?.start
      : totalDuration;
    const start = Math.max(0, anchorNote.start);
    const end = Math.max(start + 0.06, Number.isFinite(nextStart) ? nextStart : totalDuration);
    const label = groupLabel(anchorNote);

    if (segments.length > 0 && segments.at(-1).label === label) {
      segments.at(-1).end = end;
      segments.at(-1).anchorIndex = anchorIndex;
      return;
    }

    segments.push({
      start,
      end,
      label,
      anchorIndex,
    });
  });

  if (!segments.length && notes.length) {
    segments.push({
      start: 0,
      end: totalDuration,
      label: groupLabel(notes[0]),
      anchorIndex: 0,
    });
  }

  return {
    segments,
    totalDuration,
  };
}

export function timelineModelForCurrentPiece(notes) {
  const headStart = notes[0]?.start || 0;
  const tailStart = notes.at(-1)?.start || 0;
  const cacheKey = `${state.activePiece?.name || 'piece'}|${notes.length}|${headStart}|${tailStart}|${state.simplifyTabs ? 'simp' : 'multi'}`;
  if (state.timelineCache && state.timelineCache.key === cacheKey) {
    return state.timelineCache;
  }

  const built = buildTimelineSegments(notes);
  const model = {
    key: cacheKey,
    ...built,
  };
  state.timelineCache = model;
  return model;
}

export function resolveTimelineTime(notes, shiftedElapsedSeconds) {
  if (state.practiceMode === 'step') {
    if (!notes.length) return 0;
    if (state.stepIndex >= notes.length) {
      return state.activePiece?.totalDuration || notes.at(-1)?.end || 0;
    }
    return notes[state.stepIndex]?.start || 0;
  }
  return Math.max(0, shiftedElapsedSeconds);
}

export function renderedTimelineTime(targetTimelineTime, totalDuration) {
  const clampedTarget = Math.max(0, Math.min(totalDuration, targetTimelineTime));
  if (state.practiceMode !== 'step') {
    state.timelineVisualTime = clampedTarget;
    state.timelineVisualLastMs = performance.now();
    return clampedTarget;
  }

  const now = performance.now();
  if (!Number.isFinite(state.timelineVisualTime)) {
    state.timelineVisualTime = clampedTarget;
    state.timelineVisualLastMs = now;
    return clampedTarget;
  }

  const dtSeconds = Math.max(0, Math.min(0.08, (now - state.timelineVisualLastMs) / 1000));
  state.timelineVisualLastMs = now;

  // Smooth jump for step mode: fast enough to feel responsive, slow enough to visualize the change.
  const alpha = 1 - Math.exp(-16 * dtSeconds);
  state.timelineVisualTime += (clampedTarget - state.timelineVisualTime) * alpha;

  if (Math.abs(clampedTarget - state.timelineVisualTime) < 0.003) {
    state.timelineVisualTime = clampedTarget;
  }

  return Math.max(0, Math.min(totalDuration, state.timelineVisualTime));
}

export function timelineActiveSegmentIndex(segments, timelineTime) {
  if (!segments.length) return -1;
  if (timelineTime < segments[0].start) return -1;

  for (let i = 0; i < segments.length; i += 1) {
    if (timelineTime >= segments[i].start && timelineTime < segments[i].end) {
      return i;
    }
  }

  return segments.length - 1;
}

export function renderTimelineTrack(segments, totalDuration, activeSegmentIndex, timelineTime) {
  if (!dom.fretTimeline) return;

  const signature = `${state.timelineCache?.key || 'none'}|${segments.length}`;
  if (!state.timelineDomCache || state.timelineDomCache.signature !== signature) {
    dom.fretTimeline.replaceChildren();
    const track = document.createElement('div');
    track.className = 'fret-timeline-track';

    const markerEls = [];
    segments.forEach((segment) => {
      const marker = document.createElement('span');
      marker.className = 'fret-marker';
      marker.style.left = `${(clamp01(segment.start / totalDuration) * 100).toFixed(3)}%`;
      marker.title = `${formatClock(segment.start)} · ${segment.label}`;
      track.append(marker);
      markerEls.push(marker);
    });

    const playhead = document.createElement('span');
    playhead.className = 'fret-playhead';
    track.append(playhead);

    dom.fretTimeline.append(track);
    state.timelineDomCache = {
      signature,
      markerEls,
      playhead,
      activeSegmentIndex: -2,
    };
  }

  const domCache = state.timelineDomCache;
  if (!domCache?.playhead) return;
  domCache.playhead.style.left = `${(clamp01(timelineTime / totalDuration) * 100).toFixed(3)}%`;

  if (domCache.activeSegmentIndex !== activeSegmentIndex) {
    domCache.markerEls.forEach((marker, index) => {
      marker.classList.toggle('is-active', index === activeSegmentIndex);
    });
    domCache.activeSegmentIndex = activeSegmentIndex;
  }
}

export function renderFretPlan(notes, currentIndex, nextIndex, shiftedElapsedSeconds) {
  if (!notes.length) {
    setText(dom.fretPlanNow, '--');
    setText(dom.fretPlanHint, 'No playable note map');
    if (dom.fretTimelineMeta) dom.fretTimelineMeta.textContent = 'No timeline available';
    if (dom.fretTimeline) dom.fretTimeline.replaceChildren();
    return;
  }

  const model = timelineModelForCurrentPiece(notes);
  const targetTimelineTime = resolveTimelineTime(notes, shiftedElapsedSeconds);
  const timelineTime = renderedTimelineTime(targetTimelineTime, model.totalDuration);
  const activeSegmentIndex = timelineActiveSegmentIndex(model.segments, timelineTime);
  const activeSegment = activeSegmentIndex >= 0 ? model.segments[activeSegmentIndex] : null;
  const nextSegment = activeSegmentIndex >= 0
    ? model.segments[activeSegmentIndex + 1] || null
    : model.segments[0] || null;

  if (activeSegment) {
    setText(dom.fretPlanNow, activeSegment.label);
    setText(dom.fretPlanHint, nextSegment
      ? `Next change at ${formatClock(nextSegment.start)}`
      : 'Last fret position of the piece');
  } else {
    setText(dom.fretPlanNow, '--');
    setText(dom.fretPlanHint, `First change at ${formatClock(model.segments[0].start)}`);
  }

  const stepInfo = Number.isInteger(currentIndex) && currentIndex >= 0
    ? `Current note ${currentIndex + 1}/${notes.length}`
    : (
      Number.isInteger(nextIndex) && nextIndex >= 0
        ? `Upcoming note ${nextIndex + 1}/${notes.length}`
        : 'Piece complete'
    );
  if (dom.fretTimelineMeta) {
    setText(dom.fretTimelineMeta, `${stepInfo} · ${formatClock(timelineTime)} / ${formatClock(model.totalDuration)}`);
  }

  renderTimelineTrack(model.segments, model.totalDuration, activeSegmentIndex, timelineTime);
}
