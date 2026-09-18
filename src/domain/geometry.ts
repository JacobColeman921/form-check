import type { Landmark } from "./types";

/** Radians to degrees. */
const DEG = 180 / Math.PI;

/**
 * Interior angle at `b` formed by a-b-c, in degrees, 0 to 180.
 *
 * Uses atan2 on each arm rather than the dot-product formula, because the dot
 * product loses precision as the angle approaches 0 or 180, which is exactly
 * where a standing leg sits.
 */
export function threePointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const a1 = Math.atan2(a.y - b.y, a.x - b.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(a1 - a2) * DEG;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Angle of the segment `from` -> `to` away from the vertical axis, in degrees.
 * 0 means perfectly vertical, 90 means horizontal. Sign is discarded because a
 * sagittal view cannot tell lean direction from lean magnitude reliably.
 */
export function angleFromVertical(from: Landmark, to: Landmark): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.abs(Math.atan2(dx, dy) * DEG) > 90
    ? 180 - Math.abs(Math.atan2(dx, dy) * DEG)
    : Math.abs(Math.atan2(dx, dy) * DEG);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / (values.length - 1));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Centred moving average. `window` is forced odd so the output stays aligned
 * with the input and no phase shift is introduced into the rep timings.
 */
export function smooth(values: number[], window = 5): number[] {
  if (window <= 1 || values.length === 0) return [...values];
  const w = window % 2 === 0 ? window + 1 : window;
  const half = (w - 1) / 2;
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += values[j];
    out[i] = s / (hi - lo + 1);
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
