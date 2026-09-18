import { LM } from "../domain/types";
import type { Landmark, LandmarkFrame, Rep, SquatFrameMetrics } from "../domain/types";

/** A landmark array of 33 points, all at the origin with full visibility. */
export function blankPoints(visibility = 1): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
}

export interface PoseSpec {
  /** Interior knee angle wanted, degrees. Achieved with equal segment angles. */
  kneeAngle: number;
  /** Extra downward offset applied to the hip only, to push it below the knee. */
  hipDrop?: number;
  /** Trunk lean from vertical, degrees. */
  trunkLean?: number;
  /** Heel y offset added to the standing heel position. Positive is lower. */
  heelRise?: number;
  visibility?: number;
  /** Horizontal gap between the two hips. Small means side-on. */
  hipSpread?: number;
  t: number;
}

const ANKLE_Y = 0.9;
const SEG = 0.2;

/**
 * Build a side-on stick figure with a known knee angle.
 *
 * With both the shank and the thigh tilted by phi from vertical, the interior
 * knee angle is exactly 180 - 2*phi, so the inverse is phi = (180 - K) / 2.
 */
export function makeFrame(spec: PoseSpec): LandmarkFrame {
  const vis = spec.visibility ?? 1;
  const spread = spec.hipSpread ?? 0.01;
  const phi = ((180 - spec.kneeAngle) / 2) * (Math.PI / 180);
  const p = blankPoints(vis);

  const ax = 0.5;
  const ay = ANKLE_Y;
  const kx = ax + Math.sin(phi) * SEG;
  const ky = ay - Math.cos(phi) * SEG;
  const hx = kx - Math.sin(phi) * SEG;
  const hy = ky - Math.cos(phi) * SEG + (spec.hipDrop ?? 0);

  const set = (i: number, x: number, y: number) => {
    p[i] = { x, y, z: 0, visibility: vis };
  };

  set(LM.LEFT_ANKLE, ax, ay);
  set(LM.RIGHT_ANKLE, ax + spread, ay);
  set(LM.LEFT_KNEE, kx, ky);
  set(LM.RIGHT_KNEE, kx + spread, ky);
  set(LM.LEFT_HIP, hx, hy);
  set(LM.RIGHT_HIP, hx + spread, hy);

  // Heel sits behind and slightly below the ankle. heelRise lowers y (lifts it).
  set(LM.LEFT_HEEL, ax - 0.04, ay + 0.02 - (spec.heelRise ?? 0));
  set(LM.RIGHT_HEEL, ax - 0.04 + spread, ay + 0.02 - (spec.heelRise ?? 0));
  set(LM.LEFT_FOOT_INDEX, ax + 0.08, ay + 0.02);
  set(LM.RIGHT_FOOT_INDEX, ax + 0.08 + spread, ay + 0.02);

  // Shoulder placed so the shoulder-to-hip segment leans by trunkLean degrees.
  const lean = ((spec.trunkLean ?? 0) * Math.PI) / 180;
  const torso = 0.25;
  set(LM.LEFT_SHOULDER, hx + Math.sin(lean) * torso, hy - Math.cos(lean) * torso);
  set(LM.RIGHT_SHOULDER, hx + Math.sin(lean) * torso + spread, hy - Math.cos(lean) * torso);

  return { t: spec.t, points: p };
}

/** Build a SquatFrameMetrics series straight from a knee-angle curve. */
export function makeSeries(
  angles: number[],
  opts: {
    fps?: number;
    hipY?: (a: number, i: number) => number;
    kneeY?: (a: number, i: number) => number;
    trunkLean?: (a: number, i: number) => number;
    heelY?: (a: number, i: number) => number;
    visibility?: number;
  } = {},
): SquatFrameMetrics[] {
  const fps = opts.fps ?? 30;
  const step = 1000 / fps;
  return angles.map((a, i) => ({
    t: i * step,
    kneeAngle: a,
    trunkLean: opts.trunkLean ? opts.trunkLean(a, i) : 0,
    hipY: opts.hipY ? opts.hipY(a, i) : 0.4,
    kneeY: opts.kneeY ? opts.kneeY(a, i) : 0.6,
    heelY: opts.heelY ? opts.heelY(a, i) : 0.92,
    footY: 0.92,
    visibility: opts.visibility ?? 1,
  }));
}

/** A smooth descend-and-stand knee-angle curve. */
export function repCurve(top = 175, bottom = 80, frames = 30): number[] {
  const half = Math.floor(frames / 2);
  const down = Array.from({ length: half }, (_, i) => top - ((top - bottom) * i) / (half - 1));
  const up = Array.from({ length: frames - half }, (_, i) => bottom + ((top - bottom) * i) / (frames - half - 1));
  return [...down, ...up];
}

export function makeRep(over: Partial<Rep> = {}): Rep {
  return {
    index: 0,
    startT: 0,
    bottomT: 500,
    endT: 1000,
    minKneeAngle: 85,
    depthMargin: 0.05,
    peakTrunkLean: 30,
    peakHeelRise: 0.005,
    eccentricMs: 500,
    concentricMs: 500,
    visibility: 1,
    frameCount: 30,
    ...over,
  };
}
