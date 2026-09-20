/**
 * Strictly increasing integer milliseconds.
 *
 * MediaPipe's VIDEO mode rejects a frame whose timestamp is not strictly
 * greater than the last one it saw, with "Packet timestamp mismatch on a
 * calculator receiving from stream norm_rect". A live camera's mediaTime is a
 * float that repeats and stalls, so two frames can land on the same integer
 * millisecond and the second is refused.
 *
 * performance.now() is real elapsed time, which the rep segmenter also needs
 * for phase durations, so one source serves both.
 */
export function monotonicClock(now: () => number = () => performance.now()) {
  let last = -1;
  return function next(): number {
    const t = Math.round(now());
    last = t > last ? t : last + 1;
    return last;
  };
}
