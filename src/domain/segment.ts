import { mean, smooth } from "./geometry";
import type { Rep, SquatFrameMetrics } from "./types";

export interface SegmentConfig {
  /** Above this knee angle the athlete counts as standing. */
  standAngle: number;
  /** Below this knee angle a descent has begun. Gap to standAngle is the hysteresis. */
  descendAngle: number;
  /** Knee angle must rise this far above the minimum before the ascent is believed. */
  riseDelta: number;
  /** Reps shorter than this are noise, not reps. */
  minRepMs: number;
  /** A rep that never bends past this was not a rep. */
  maxAcceptedMinAngle: number;
  /** Centred moving-average window applied to the knee angle before segmenting. */
  smoothWindow: number;
}

export const DEFAULT_SEGMENT: SegmentConfig = {
  standAngle: 160,
  descendAngle: 150,
  riseDelta: 15,
  minRepMs: 400,
  maxAcceptedMinAngle: 140,
  smoothWindow: 5,
};

type State = "STANDING" | "DESCENDING" | "ASCENDING";

/**
 * Split a metric series into reps with a hysteresis state machine.
 *
 * Hysteresis is the whole point: a single threshold makes the rep counter
 * chatter every time the smoothed angle dithers across it. Entering a descent
 * and returning to standing use different thresholds, so noise at the boundary
 * cannot produce a rep.
 *
 * Timing comes from frame timestamps, never frame counts, so a dropped frame
 * does not shorten a phase.
 */
export function segmentReps(series: SquatFrameMetrics[], config: SegmentConfig = DEFAULT_SEGMENT): Rep[] {
  if (series.length === 0) return [];

  const angles = smooth(series.map((s) => s.kneeAngle), config.smoothWindow);
  const reps: Rep[] = [];

  let state: State = "STANDING";
  let startIdx = 0;
  let bottomIdx = 0;
  let minAngle = Infinity;

  const emit = (endIdx: number) => {
    const startT = series[startIdx].t;
    const bottomT = series[bottomIdx].t;
    const endT = series[endIdx].t;
    const slice = series.slice(startIdx, endIdx + 1);

    if (endT - startT < config.minRepMs) return;
    if (minAngle > config.maxAcceptedMinAngle) return;

    const bottom = series[bottomIdx];
    reps.push({
      index: reps.length,
      startT,
      bottomT,
      endT,
      minKneeAngle: minAngle,
      depthMargin: bottom.hipY - bottom.kneeY,
      peakTrunkLean: Math.max(...slice.map((s) => s.trunkLean)),
      peakHeelRise: Math.max(...slice.map((s) => s.heelY)) - Math.min(...slice.map((s) => s.heelY)),
      eccentricMs: bottomT - startT,
      concentricMs: endT - bottomT,
      visibility: mean(slice.map((s) => s.visibility)),
      frameCount: slice.length,
    });
  };

  for (let i = 0; i < series.length; i++) {
    const a = angles[i];

    if (state === "STANDING") {
      if (a < config.descendAngle) {
        state = "DESCENDING";
        startIdx = i;
        bottomIdx = i;
        minAngle = a;
      }
      continue;
    }

    if (state === "DESCENDING") {
      if (a < minAngle) {
        minAngle = a;
        bottomIdx = i;
      } else if (a > minAngle + config.riseDelta) {
        state = "ASCENDING";
      }
      continue;
    }

    // ASCENDING
    if (a >= config.standAngle) {
      emit(i);
      state = "STANDING";
      minAngle = Infinity;
    } else if (a < minAngle) {
      // sank again before standing up: treat as a deeper bottom of the same rep
      minAngle = a;
      bottomIdx = i;
      state = "DESCENDING";
    }
  }

  return reps;
}
