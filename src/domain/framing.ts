import { mean } from "./geometry";
import { LM } from "./types";
import type { LandmarkFrame, Side } from "./types";

/**
 * Is enough of the body actually in shot to measure anything?
 *
 * MediaPipe will happily return a full 33-point skeleton when only a face is
 * visible, inventing the rest below the frame with near-zero visibility. Every
 * angle derived from those invented points is meaningless, so this gate runs
 * before calibration and before grading. Refusing here is the whole point:
 * a knee angle computed from a forehead is worse than no number at all.
 */

export type FramingIssue =
  | "ok"
  | "no-pose"
  | "legs-missing"
  | "feet-missing"
  | "head-missing"
  | "too-close";

export interface FramingCheck {
  ok: boolean;
  issue: FramingIssue;
  message: string;
  /** Fraction of the frame height spanned from head to ankle. */
  coverage: number;
  /** Mean visibility across the joints this app measures. */
  visibility: number;
}

/** Below this a landmark is treated as not in shot. */
const SEEN = 0.5;

/** A body filling less than this of the frame height is too far to resolve. */
const MIN_COVERAGE = 0.25;

function vis(frame: LandmarkFrame, index: number): number {
  return frame.points[index]?.visibility ?? 0;
}

export function checkFraming(frame: LandmarkFrame | null, side: Side): FramingCheck {
  if (!frame || frame.points.length < 33) {
    return {
      ok: false,
      issue: "no-pose",
      message: "No person detected. Step into frame.",
      coverage: 0,
      visibility: 0,
    };
  }

  const hip = side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP;
  const knee = side === "left" ? LM.LEFT_KNEE : LM.RIGHT_KNEE;
  const ankle = side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE;
  const foot = side === "left" ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX;

  const visibility = mean([vis(frame, hip), vis(frame, knee), vis(frame, ankle)]);
  const headY = frame.points[LM.NOSE]?.y ?? 0;
  const footY = frame.points[ankle]?.y ?? 0;
  const coverage = Math.abs(footY - headY);

  const base = { coverage, visibility };

  if (vis(frame, hip) < SEEN && vis(frame, knee) < SEEN) {
    return {
      ...base,
      ok: false,
      issue: "legs-missing",
      message: "Only your upper body is in frame. Move the camera back until your feet show.",
    };
  }

  if (vis(frame, ankle) < SEEN || vis(frame, foot) < SEEN) {
    return {
      ...base,
      ok: false,
      issue: "feet-missing",
      message: "Your feet are cut off. Move back, or tilt the camera down.",
    };
  }

  if (vis(frame, LM.NOSE) < SEEN) {
    return {
      ...base,
      ok: false,
      issue: "head-missing",
      message: "Your head is out of frame. Move back or tilt the camera up.",
    };
  }

  if (coverage < MIN_COVERAGE) {
    return {
      ...base,
      ok: false,
      issue: "too-close",
      message: "You are too far away to measure reliably. Move closer to the camera.",
    };
  }

  return { ...base, ok: true, issue: "ok", message: "Whole body in frame." };
}
