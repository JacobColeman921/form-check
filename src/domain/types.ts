/**
 * Core types for Form Check.
 *
 * Coordinate convention, and it matters everywhere below:
 * MediaPipe returns normalised image coordinates where x runs 0 (left) to 1
 * (right) and y runs 0 (TOP) to 1 (BOTTOM). y increases downward. So a point
 * that is physically higher in the room has a SMALLER y.
 */

/** BlazePose 33-landmark indices. Only the ones this app reads are named. */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** MediaPipe confidence that this landmark is present and not occluded, 0 to 1. */
  visibility: number;
}

/** One inference result. `t` is a millisecond timestamp from the video clock. */
export interface LandmarkFrame {
  t: number;
  points: Landmark[];
}

export type Side = "left" | "right";

/** Captured during the standing hold before a set. */
export interface Baseline {
  /** Mean knee angle while standing, degrees. */
  standingKneeAngle: number;
  /** Mean heel y while standing, normalised units. */
  standingHeelY: number;
  /** Mean trunk lean from vertical while standing, degrees. */
  standingTrunkLean: number;
  /** Which limb faces the camera. */
  side: Side;
  /** Mean visibility of the measured joints during the hold. */
  visibility: number;
  frameCount: number;
}

export interface SquatFrameMetrics {
  t: number;
  /** Interior angle at the knee, hip-knee-ankle. 180 is straight. */
  kneeAngle: number;
  /** Angle of the shoulder-to-hip segment away from vertical, degrees. */
  trunkLean: number;
  hipY: number;
  kneeY: number;
  heelY: number;
  footY: number;
  /** Mean visibility of hip, knee and ankle on the measured side. */
  visibility: number;
}

export interface Rep {
  index: number;
  startT: number;
  bottomT: number;
  endT: number;
  /** Smallest knee angle reached, degrees. Lower is deeper. */
  minKneeAngle: number;
  /** hipY minus kneeY at the bottom frame. Positive means the hip is BELOW the knee. */
  depthMargin: number;
  /** Largest trunk lean reached, degrees from vertical. */
  peakTrunkLean: number;
  /** Largest heel rise above the standing baseline, normalised units. */
  peakHeelRise: number;
  eccentricMs: number;
  concentricMs: number;
  /** Mean joint visibility across the rep. Drives the uncertainty band. */
  visibility: number;
  frameCount: number;
}

export type CriterionState = "MET" | "NOT_MET" | "UNCALLABLE";

export interface CriterionResult {
  id: string;
  label: string;
  /** Measured value in `unit`. */
  value: number;
  unit: "deg" | "norm" | "ms";
  /** The value this is compared against, in the same unit. */
  threshold: number;
  /** Half-width of the uncertainty band, same unit. */
  band: number;
  state: CriterionState;
  /** Plain sentence for the UI. Never colour alone. */
  detail: string;
}

export interface RepGrade {
  rep: Rep;
  criteria: CriterionResult[];
  met: number;
  notMet: number;
  uncallable: number;
}

export interface SessionGrade {
  reps: RepGrade[];
  repCount: number;
  /** Criterion judgements that resolved either way. */
  callable: number;
  /** Criterion judgements that landed inside the error band. */
  uncallable: number;
  met: number;
  /** met / callable, or null when nothing was callable. */
  score: number | null;
  /** A to F, or NOT_GRADED when too much of the set was uncallable. */
  letter: "A" | "B" | "C" | "D" | "F" | "NOT_GRADED";
  /** The single sentence the report leads with. */
  headline: string;
}
