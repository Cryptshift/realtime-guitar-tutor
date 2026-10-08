// Piece clock that maps wall time to piece time and survives tempo changes.
// Maps wall-clock time to piece time. Changing the tempo re-anchors the clock at the
// current piece position, so moving the BPM slider mid-play changes the speed from
// here on instead of jumping the playhead (elapsed * newScale).
export function createPieceClock(nowMs = 0, scale = 1) {
  let anchorMs = nowMs;
  let anchorSeconds = 0;
  let currentScale = scale;
  return {
    reset(atMs, nextScale = currentScale) {
      anchorMs = atMs;
      anchorSeconds = 0;
      currentScale = nextScale;
    },
    secondsAt(atMs) {
      return anchorSeconds + ((atMs - anchorMs) / 1000) * currentScale;
    },
    setScale(atMs, nextScale) {
      anchorSeconds = this.secondsAt(atMs);
      anchorMs = atMs;
      currentScale = nextScale;
    },
    // Jump to a piece position (loops, pause/resume, count-in before 0).
    seek(atMs, seconds) {
      anchorMs = atMs;
      anchorSeconds = seconds;
    },
    // Wall-clock time at which the piece reaches `seconds` (for scheduling clicks).
    msAt(seconds) {
      return anchorMs + ((seconds - anchorSeconds) / currentScale) * 1000;
    },
    get scale() {
      return currentScale;
    },
  };
}
