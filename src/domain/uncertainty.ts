import { clamp } from "./geometry";

/**
 * The error model.
 *
 * Published concurrent-validity work on markerless motion capture during the
 * squat reports RMSE around 7.0 degrees against marker-based 3D, range 2.9 to
 * 13.6 depending on the joint. A single camera in a bedroom is very unlikely to
 * beat the middle of that range, so 7 degrees is the floor, not the ceiling.
 *
 * The band then widens as landmark visibility falls, because an occluded joint
 * is an interpolated joint.
 *
 * Source: concurrent validity and test reliability of markerless motion capture
 * during the overhead squat, Scientific Reports 2024.
 */
export const ANGLE_RMSE_FLOOR_DEG = 7.0;

/**
 * Positional floor for comparisons done in normalised image units rather than
 * degrees, such as hip height against knee height. 0.02 is two percent of frame
 * height, roughly a landmark's own jitter at 720p.
 */
export const POSITION_FLOOR_NORM = 0.02;

/** How much poor visibility inflates the band. */
const VISIBILITY_PENALTY = 2.0;

/** Bands wider than this mean the measurement is not worth reporting at all. */
export const ANGLE_BAND_MAX_DEG = 30;

function widen(floor: number, visibility: number): number {
  const v = clamp(visibility, 0, 1);
  return floor * (1 + (1 - v) * VISIBILITY_PENALTY);
}

/** Half-width of the uncertainty band for an angular measurement, in degrees. */
export function angleBand(visibility: number): number {
  return Math.min(widen(ANGLE_RMSE_FLOOR_DEG, visibility), ANGLE_BAND_MAX_DEG);
}

/** Half-width of the uncertainty band for a normalised positional measurement. */
export function positionBand(visibility: number): number {
  return widen(POSITION_FLOOR_NORM, visibility);
}

/** True when the band is so wide the measurement should not be reported. */
export function isUnusable(band: number): boolean {
  return band >= ANGLE_BAND_MAX_DEG;
}

export type Comparison = "above" | "below";

/**
 * Resolve a measurement against a threshold, given the band.
 *
 * `direction` says which side of the threshold counts as meeting the criterion.
 * A value inside the band resolves to UNCALLABLE, which is the point of the
 * whole exercise: the grader declines to distinguish 88 degrees from 92 when it
 * cannot.
 */
export function resolve(
  value: number,
  threshold: number,
  band: number,
  direction: Comparison,
): "MET" | "NOT_MET" | "UNCALLABLE" {
  const diff = value - threshold;
  if (Math.abs(diff) <= band) return "UNCALLABLE";
  if (direction === "above") return diff > 0 ? "MET" : "NOT_MET";
  return diff < 0 ? "MET" : "NOT_MET";
}
