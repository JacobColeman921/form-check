import { angleFromVertical, mean, threePointAngle } from "./geometry";
import { LM } from "./types";
import type { Baseline, LandmarkFrame, Side, SquatFrameMetrics } from "./types";

const SIDE_JOINTS: Record<Side, number[]> = {
  left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
  right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
};

/** Mean visibility of the hip, knee and ankle on one side. */
export function sideVisibility(frame: LandmarkFrame, side: Side): number {
  const idx = SIDE_JOINTS[side];
  if (frame.points.length <= Math.max(...idx)) return 0;
  return mean(idx.map((i) => frame.points[i].visibility));
}

/** Whichever limb the camera can see best. A sagittal view always favours one. */
export function pickSide(frame: LandmarkFrame): Side {
  return sideVisibility(frame, "left") >= sideVisibility(frame, "right") ? "left" : "right";
}

/** The most common best-side across a run of frames, so the side cannot flicker mid-rep. */
export function dominantSide(frames: LandmarkFrame[]): Side {
  let left = 0;
  for (const f of frames) if (pickSide(f) === "left") left++;
  return left * 2 >= frames.length ? "left" : "right";
}

/**
 * Is the camera actually side-on?
 *
 * Facing the camera puts the two hips far apart horizontally and makes both
 * equally visible. Side-on collapses them toward each other and occludes one.
 * Every angle this app reports is a sagittal angle, so a front-on camera makes
 * all of them wrong, and the honest response is to refuse rather than to grade.
 */
export function isSagittal(frames: LandmarkFrame[]): { ok: boolean; hipSpread: number; reason: string } {
  if (frames.length === 0) return { ok: false, hipSpread: 0, reason: "No pose detected. Check the camera and the lighting." };

  const spreads: number[] = [];
  const shoulderSpans: number[] = [];
  for (const f of frames) {
    if (f.points.length <= LM.RIGHT_HIP) continue;
    spreads.push(Math.abs(f.points[LM.LEFT_HIP].x - f.points[LM.RIGHT_HIP].x));
    shoulderSpans.push(Math.abs(f.points[LM.LEFT_SHOULDER].x - f.points[LM.RIGHT_SHOULDER].x));
  }
  if (spreads.length === 0) return { ok: false, hipSpread: 0, reason: "No pose detected. Check the camera and the lighting." };

  const hipSpread = mean(spreads);
  const shoulderSpan = mean(shoulderSpans);

  // Side-on: hips nearly stacked in x. Front-on: hips clearly apart.
  if (hipSpread > 0.08 || shoulderSpan > 0.14) {
    return {
      ok: false,
      hipSpread,
      reason: "You are facing the camera. Turn side-on so the camera sees your profile, then hold still.",
    };
  }
  return { ok: true, hipSpread, reason: "Camera is side-on." };
}

/** Per-frame squat measurements on one side. */
export function squatFrameMetrics(frame: LandmarkFrame, side: Side): SquatFrameMetrics {
  const p = frame.points;
  const hip = p[side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP];
  const knee = p[side === "left" ? LM.LEFT_KNEE : LM.RIGHT_KNEE];
  const ankle = p[side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
  const heel = p[side === "left" ? LM.LEFT_HEEL : LM.RIGHT_HEEL];
  const foot = p[side === "left" ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX];
  const shoulder = p[side === "left" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];

  return {
    t: frame.t,
    kneeAngle: threePointAngle(hip, knee, ankle),
    trunkLean: angleFromVertical(shoulder, hip),
    hipY: hip.y,
    kneeY: knee.y,
    heelY: heel.y,
    footY: foot.y,
    visibility: sideVisibility(frame, side),
  };
}

export function squatSeries(frames: LandmarkFrame[], side: Side): SquatFrameMetrics[] {
  return frames.map((f) => squatFrameMetrics(f, side));
}

/** Average the standing hold into a baseline the grader compares against. */
export function buildBaseline(frames: LandmarkFrame[]): Baseline {
  const side = dominantSide(frames);
  const m = squatSeries(frames, side);
  return {
    standingKneeAngle: mean(m.map((x) => x.kneeAngle)),
    standingHeelY: mean(m.map((x) => x.heelY)),
    standingTrunkLean: mean(m.map((x) => x.trunkLean)),
    side,
    visibility: mean(m.map((x) => x.visibility)),
    frameCount: frames.length,
  };
}
