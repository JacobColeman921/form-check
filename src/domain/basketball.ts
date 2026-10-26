import { mean, threePointAngle } from "./geometry";
import { LM } from "./types";
import type { Landmark, LandmarkFrame, Side } from "./types";

export interface ShotFrame {
  t: number;
  elbowAngle: number;
  wristLift: number;
  kneeAngle: number | null;
  visibility: number;
}

export interface ShotMotion {
  index: number;
  setT: number;
  extensionT: number;
  setToExtensionMs: number;
  elbowAtSet: number;
  elbowAtExtension: number;
  wristLift: number;
  kneeBend: number | null;
  cue: { id: string; text: string; level: "info" | "focus" | "setup"; metric?: string };
}

export interface BasketballAnalysis {
  quality: "usable" | "limited" | "unusable";
  qualityMessage: string;
  shots: ShotMotion[];
  focusCue: ShotMotion["cue"];
  measurements: { label: string; value: string }[];
  validFrames: number;
}

const seen = (point: Landmark | undefined) => Boolean(point && point.visibility >= 0.5 && Number.isFinite(point.x) && Number.isFinite(point.y));
const sideIndex = (side: Side, left: number, right: number) => side === "left" ? left : right;

/** Upper-body pose only: the whole person and the basketball need not fit in one frame. */
export function basketballFrame(frame: LandmarkFrame, side: Side): ShotFrame | null {
  const points = frame.points;
  const shoulder = points[sideIndex(side, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)];
  const elbow = points[sideIndex(side, LM.LEFT_ELBOW, LM.RIGHT_ELBOW)];
  const wrist = points[sideIndex(side, LM.LEFT_WRIST, LM.RIGHT_WRIST)];
  if (![shoulder, elbow, wrist].every(seen)) return null;
  const hip = points[sideIndex(side, LM.LEFT_HIP, LM.RIGHT_HIP)];
  const knee = points[sideIndex(side, LM.LEFT_KNEE, LM.RIGHT_KNEE)];
  const ankle = points[sideIndex(side, LM.LEFT_ANKLE, LM.RIGHT_ANKLE)];
  const upperArmLength = Math.hypot(shoulder.x - elbow.x, shoulder.y - elbow.y);
  if (upperArmLength < 0.025) return null;
  const scale = seen(hip) ? Math.max(0.08, Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y)) : Math.max(0.08, upperArmLength * 1.5);
  const kneeAngle = seen(hip) && seen(knee) && seen(ankle) ? threePointAngle(hip, knee, ankle) : null;
  return {
    t: frame.t,
    elbowAngle: threePointAngle(shoulder, elbow, wrist),
    wristLift: (shoulder.y - wrist.y) / scale,
    kneeAngle,
    visibility: mean([shoulder, elbow, wrist].map((point) => point.visibility)),
  };
}

export function basketballCalibration(frames: LandmarkFrame[], side: Side): { ok: boolean; message: string } {
  const usable = frames.filter((frame) => basketballFrame(frame, side));
  if (usable.length < 10 || usable.length < frames.length * 0.55) {
    return { ok: false, message: `Keep your ${side} shoulder, elbow and wrist in frame while you stand still.` };
  }
  return { ok: true, message: "Shooting-arm view calibrated. The ball and rim are not tracked." };
}

/** Counts visible set-to-extension motions; it cannot infer that a ball was released. */
export function analyzeBasketball(frames: LandmarkFrame[], side: Side): BasketballAnalysis {
  const values = frames.map((frame) => basketballFrame(frame, side));
  const valid = values.filter((value): value is ShotFrame => value !== null);
  const share = frames.length ? valid.length / frames.length : 0;
  const quality = valid.length < 10 || share < 0.5 ? "unusable" : share < 0.8 ? "limited" : "usable";
  const qualityMessage = quality === "unusable"
    ? "The shooting arm was hidden too often to review. Keep shoulder, elbow and wrist in view."
    : quality === "limited" ? "The shooting arm was partly hidden. Treat these measurements as tentative."
      : "Shooting-arm tracking was available for most of this session.";
  const shots: ShotMotion[] = [];
  let set: ShotFrame | null = null;
  let minElbow = 180;
  let minKnee = 180;
  let kneeSeen = false;
  let extended = false;
  let resetFrames = 0;
  let lastExtension = -Infinity;

  for (const frame of values) {
    if (!frame) { set = null; extended = false; resetFrames = 0; continue; }
    const inSet = frame.elbowAngle < 130 && frame.wristLift > -0.3;
    if (extended) {
      resetFrames = frame.elbowAngle < 125 || frame.wristLift < 0.1 ? resetFrames + 1 : 0;
      if (resetFrames >= 3) { extended = false; resetFrames = 0; }
      continue;
    }
    if (!set) {
      if (inSet && frame.t - lastExtension > 700) {
        set = frame;
        minElbow = frame.elbowAngle;
        minKnee = frame.kneeAngle ?? 180;
        kneeSeen = frame.kneeAngle !== null;
      }
      continue;
    }
    if (frame.t - set.t > 4000) { set = null; continue; }
    minElbow = Math.min(minElbow, frame.elbowAngle);
    if (frame.kneeAngle !== null) { minKnee = Math.min(minKnee, frame.kneeAngle); kneeSeen = true; }
    if (frame.elbowAngle < 152 || frame.wristLift < 0.35 || frame.t - set.t < 180) continue;
    const elapsed = Math.round(frame.t - set.t);
    const cue: ShotMotion["cue"] = frame.visibility < 0.65
      ? { id: "arm-visibility", text: "The shooting arm was partly hidden. Move the camera so the elbow and wrist stay visible.", level: "setup" }
      : elapsed > 850
        ? { id: "set-pause", text: `About ${Math.round(elapsed / 100) / 10} seconds passed from the visible set position to arm extension. Compare the rhythm across shots.`, level: "focus", metric: "set-to-extension time" }
        : { id: "extension-seen", text: "Arm extension tracked. Ball release and shot outcome are not measured.", level: "info" };
    shots.push({ index: shots.length + 1, setT: set.t, extensionT: frame.t, setToExtensionMs: elapsed, elbowAtSet: Math.round(minElbow), elbowAtExtension: Math.round(frame.elbowAngle), wristLift: Math.round(frame.wristLift * 100) / 100, kneeBend: kneeSeen ? Math.round(180 - minKnee) : null, cue });
    lastExtension = frame.t;
    set = null;
    extended = true;
  }

  if (quality === "unusable") shots.length = 0;
  const focusCue: ShotMotion["cue"] = quality === "unusable"
    ? { id: "arm-hidden", text: qualityMessage, level: "setup" }
    : shots.find((shot) => shot.cue.level === "focus")?.cue ?? shots.at(-1)?.cue
      ?? { id: "no-shot-motion", text: "No complete set-to-extension motion was detected. Keep your shooting arm in view.", level: "setup" };
  const avg = (numbers: number[]) => numbers.length ? String(Math.round(mean(numbers))) : "Not measured";
  return {
    quality, qualityMessage, shots, focusCue, validFrames: valid.length,
    measurements: [
      { label: "Shot motions", value: String(shots.length) },
      { label: "Average set to extension", value: shots.length ? `${avg(shots.map((shot) => shot.setToExtensionMs))} ms` : "Not measured" },
      { label: "Average elbow at extension", value: shots.length ? `${avg(shots.map((shot) => shot.elbowAtExtension))}°` : "Not measured" },
      { label: "Knee bend when visible", value: shots.some((shot) => shot.kneeBend !== null) ? `${avg(shots.flatMap((shot) => shot.kneeBend === null ? [] : [shot.kneeBend]))}°` : "Not measured" },
    ],
  };
}
