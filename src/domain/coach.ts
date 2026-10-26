import { angleFromVertical, mean, threePointAngle } from "./geometry";
import { checkFraming } from "./framing";
import { dominantSide, isSagittal } from "./squat";
import { LM } from "./types";
import type { Landmark, LandmarkFrame, Side } from "./types";
import { analyzeBasketball, basketballCalibration, basketballFrame } from "./basketball";
import type { ShotMotion } from "./basketball";

export type MovementId = "posture" | "squat" | "deadlift" | "swing" | "goblet" | "basketball";

export interface Movement {
  id: MovementId;
  name: string;
  category: "Posture" | "Bodyweight" | "Kettlebell" | "Basketball";
  description: string;
  setup: string;
  focus: string;
}

export const MOVEMENTS: Movement[] = [
  { id: "posture", name: "Standing posture", category: "Posture", description: "See how your head, shoulder, hip and ankle line up in a side view.", setup: "Stand side-on and hold still for 10 to 20 seconds.", focus: "Alignment changes, not a medical posture diagnosis." },
  { id: "squat", name: "Bodyweight squat", category: "Bodyweight", description: "Count complete reps and review depth, heel movement and trunk angle.", setup: "Stand side-on with your full body in frame, then squat at your normal pace.", focus: "Compare repeatable measurements across your own sessions." },
  { id: "deadlift", name: "Kettlebell deadlift", category: "Kettlebell", description: "Track the hinge and return to standing without pretending to see spinal shape.", setup: "Stand side-on with the kettlebell near your feet and keep it visible if possible.", focus: "Hip hinge and knee movement from body landmarks." },
  { id: "swing", name: "Two-hand swing", category: "Kettlebell", description: "Count arm-rise cycles and check the timing of hip extension.", setup: "Stand side-on. Give yourself room around the bell and keep wrists in frame.", focus: "Hip and wrist timing; the bell itself is not tracked." },
  { id: "goblet", name: "Goblet squat", category: "Kettlebell", description: "Track loaded-squat depth and whether hands stay near the chest.", setup: "Stand side-on and hold the kettlebell close to your chest.", focus: "Squat movement and visible hand position." },
  { id: "basketball", name: "Basketball shot", category: "Basketball", description: "Review shooting-arm motion and timing, with an optional knee reading when legs fit in frame.", setup: "Keep your shooting shoulder, elbow and wrist visible. The hoop can stay outside the frame.", focus: "Counts shot motions, not makes or misses; the ball and rim are not tracked yet." },
];

export interface CoachFrame {
  t: number;
  side: Side;
  kneeAngle: number;
  hipAngle: number;
  trunkLean: number;
  heelY: number;
  wristY: number;
  shoulderY: number;
  hipY: number;
  kneeY: number;
  headOffset: number;
  visibility: number;
  bodyHeight: number;
}

export interface CoachBaseline {
  side: Side;
  kneeAngle: number;
  hipAngle: number;
  trunkLean: number;
  heelY: number;
  headOffset: number;
  visibility: number;
}

export interface CoachCue {
  id: string;
  text: string;
  level: "info" | "focus" | "setup";
  metric?: string;
}

export interface CoachRep {
  index: number;
  startT: number;
  endT: number;
  peakKneeFlexion: number;
  peakHipFlexion: number;
  peakTrunkLean: number;
  heelRise: number;
  minHipBelowKnee: number;
  peakWristLift: number;
  minVisibility: number;
  cue: CoachCue;
}

export interface CoachResult {
  movement: MovementId;
  side: Side;
  quality: "usable" | "limited" | "unusable";
  qualityMessage: string;
  durationMs: number;
  reps: CoachRep[];
  shots?: ShotMotion[];
  focusCue: CoachCue;
  measurements: { label: string; value: string }[];
  validFrames: number;
  totalFrames: number;
}

const sideIndex = (side: Side, left: number, right: number) => side === "left" ? left : right;
const present = (p: Landmark | undefined) => Boolean(p && p.visibility >= 0.5 && Number.isFinite(p.x) && Number.isFinite(p.y));

export function coachFrame(frame: LandmarkFrame, side: Side): CoachFrame | null {
  if (!checkFraming(frame, side).ok) return null;
  const p = frame.points;
  const shoulder = p[sideIndex(side, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)];
  const hip = p[sideIndex(side, LM.LEFT_HIP, LM.RIGHT_HIP)];
  const knee = p[sideIndex(side, LM.LEFT_KNEE, LM.RIGHT_KNEE)];
  const ankle = p[sideIndex(side, LM.LEFT_ANKLE, LM.RIGHT_ANKLE)];
  const heel = p[sideIndex(side, LM.LEFT_HEEL, LM.RIGHT_HEEL)];
  const wrist = p[sideIndex(side, LM.LEFT_WRIST, LM.RIGHT_WRIST)];
  const ear = p[sideIndex(side, 7, 8)];
  if (![shoulder, hip, knee, ankle, heel].every(present)) return null;
  const height = Math.max(0.15, Math.abs(ankle.y - (p[LM.NOSE]?.y ?? shoulder.y)));
  return {
    t: frame.t,
    side,
    kneeAngle: threePointAngle(hip, knee, ankle),
    hipAngle: threePointAngle(shoulder, hip, knee),
    trunkLean: angleFromVertical(shoulder, hip),
    heelY: heel.y,
    wristY: present(wrist) ? wrist.y : Number.NaN,
    shoulderY: shoulder.y,
    hipY: hip.y,
    kneeY: knee.y,
    headOffset: present(ear) ? Math.abs(ear.x - shoulder.x) / Math.max(0.08, Math.abs(hip.y - shoulder.y)) : Number.NaN,
    visibility: mean([shoulder, hip, knee, ankle, heel].map((point) => point.visibility)),
    bodyHeight: height,
  };
}

export function buildCoachBaseline(frames: LandmarkFrame[], movement: MovementId = "squat", shootingSide: Side = "right"): { baseline: CoachBaseline | null; message: string } {
  if (frames.length < 10) return { baseline: null, message: movement === "basketball" ? `Hold still with your ${shootingSide} shoulder, elbow and wrist in frame.` : "Hold still for a few seconds with your full body in frame." };
  if (movement === "basketball") {
    const check = basketballCalibration(frames, shootingSide);
    if (!check.ok) return { baseline: null, message: check.message };
    return { baseline: { side: shootingSide, kneeAngle: 0, hipAngle: 0, trunkLean: 0, heelY: 0, headOffset: 0, visibility: 1 }, message: check.message };
  }
  const view = isSagittal(frames);
  if (!view.ok) return { baseline: null, message: view.reason };
  const side = dominantSide(frames);
  const values = frames.map((f) => coachFrame(f, side)).filter((f): f is CoachFrame => f !== null);
  if (values.length < Math.max(10, frames.length * 0.65)) {
    return { baseline: null, message: "The camera lost your joints. Move back, add light, and keep your full body visible." };
  }
  const avg = (pick: (f: CoachFrame) => number) => mean(values.map(pick).filter(Number.isFinite));
  return { baseline: { side, kneeAngle: avg((f) => f.kneeAngle), hipAngle: avg((f) => f.hipAngle), trunkLean: avg((f) => f.trunkLean), heelY: avg((f) => f.heelY), headOffset: avg((f) => f.headOffset), visibility: avg((f) => f.visibility) }, message: "Camera position saved for this session." };
}

function signal(f: CoachFrame, baseline: CoachBaseline, movement: MovementId): number {
  if (movement === "swing") return Number.isFinite(f.wristY) ? (f.hipY - f.wristY) / f.bodyHeight : 0;
  if (movement === "deadlift") return baseline.hipAngle - f.hipAngle;
  return baseline.kneeAngle - f.kneeAngle;
}

function repCue(movement: MovementId, rep: Omit<CoachRep, "cue">): CoachCue {
  if (rep.minVisibility < 0.58) return { id: "visibility", text: "This rep was partly hidden. Move the camera back or add light.", level: "setup" };
  if (movement === "squat" || movement === "goblet") {
    if (rep.heelRise > 0.025) return { id: "heel", text: "Your heel appears to rise. Check your foot contact on the next rep.", level: "focus", metric: "heel movement" };
    if (rep.minHipBelowKnee < -0.025) return { id: "depth", text: "Your hip stayed above knee height in this view. Try a depth you can control.", level: "focus", metric: "hip-to-knee height" };
    if (movement === "goblet" && rep.peakWristLift < 0.03) return { id: "hands", text: "Your hands dropped below the hip in this view. Keep the load close to your torso.", level: "focus", metric: "hand position" };
    return { id: "repeat", text: "Rep tracked. Keep the same camera angle for a useful comparison.", level: "info" };
  }
  if (movement === "deadlift") {
    if (rep.peakKneeFlexion > rep.peakHipFlexion + 25) return { id: "hinge", text: "Your knees bent more than your hips in this view. Try sending the hips back as you hinge.", level: "focus", metric: "hip and knee angles" };
    return { id: "hinge-ok", text: "Hinge tracked. The camera cannot judge spinal rounding or load position.", level: "info" };
  }
  if (rep.peakWristLift < 0.2) return { id: "swing-height", text: "Your wrists stayed low in this view. Check the camera framing before changing the swing.", level: "setup", metric: "wrist height" };
  return { id: "swing-ok", text: "Swing cycle tracked. The bell path itself is not measured.", level: "info" };
}

function segment(values: CoachFrame[], baseline: CoachBaseline, movement: MovementId): CoachRep[] {
  const enter = movement === "swing" ? 0.22 : movement === "deadlift" ? 42 : 35;
  const exit = movement === "swing" ? 0.07 : movement === "deadlift" ? 18 : 14;
  const reps: CoachRep[] = [];
  let start = -1;
  let above = 0;
  let below = 0;
  for (let i = 0; i < values.length; i++) {
    const v = signal(values[i], baseline, movement);
    if (start < 0) {
      above = v >= enter ? above + 1 : 0;
      if (above >= 3) { start = Math.max(0, i - 2); below = 0; }
      continue;
    }
    below = v <= exit ? below + 1 : 0;
    if (below < 3) continue;
    const end = i;
    const slice = values.slice(start, end + 1);
    const elapsed = values[end].t - values[start].t;
    if (elapsed >= 300 && elapsed <= 12000 && slice.length >= 7) {
      const summary = {
        index: reps.length + 1,
        startT: values[start].t,
        endT: values[end].t,
        peakKneeFlexion: Math.max(...slice.map((f) => baseline.kneeAngle - f.kneeAngle)),
        peakHipFlexion: Math.max(...slice.map((f) => baseline.hipAngle - f.hipAngle)),
        peakTrunkLean: Math.max(...slice.map((f) => f.trunkLean - baseline.trunkLean)),
        heelRise: Math.max(...slice.map((f) => baseline.heelY - f.heelY)),
        minHipBelowKnee: Math.max(...slice.map((f) => f.hipY - f.kneeY)),
        peakWristLift: Math.max(...slice.map((f) => Number.isFinite(f.wristY) ? (f.hipY - f.wristY) / f.bodyHeight : 0)),
        minVisibility: Math.min(...slice.map((f) => f.visibility)),
      };
      reps.push({ ...summary, cue: repCue(movement, summary) });
    }
    start = -1;
    above = 0;
    below = 0;
  }
  return reps;
}

export function analyzeSession(frames: LandmarkFrame[], movement: MovementId, baseline: CoachBaseline): CoachResult {
  if (movement === "basketball") {
    const analysis = analyzeBasketball(frames, baseline.side);
    return { movement, side: baseline.side, quality: analysis.quality, qualityMessage: analysis.qualityMessage, durationMs: frames.length > 1 ? frames.at(-1)!.t - frames[0].t : 0, reps: [], shots: analysis.shots, focusCue: analysis.focusCue, measurements: analysis.measurements, validFrames: analysis.validFrames, totalFrames: frames.length };
  }
  const values = frames.map((f) => coachFrame(f, baseline.side)).filter((f): f is CoachFrame => f !== null && (movement !== "swing" || Number.isFinite(f.wristY)));
  const validShare = frames.length ? values.length / frames.length : 0;
  const quality = values.length < 10 || validShare < 0.5 ? "unusable" : validShare < 0.8 ? "limited" : "usable";
  const qualityMessage = quality === "unusable" ? "Too few full-body frames for a reliable review. Move back and try again." : quality === "limited" ? "Some frames were hidden. Treat these cues as tentative." : "Full-body tracking was available for most of this session.";
  const reps = movement === "posture" || quality === "unusable" ? [] : segment(values, baseline, movement);
  let focusCue: CoachCue;
  if (quality === "unusable") focusCue = { id: "framing", text: qualityMessage, level: "setup" };
  else if (movement === "posture") {
    const offsets = values.map((f) => f.headOffset).filter(Number.isFinite);
    const meanOffset = mean(offsets);
    focusCue = meanOffset > 0.45
      ? { id: "head-offset", text: "Your head and shoulder are separated horizontally in this view. Try a relaxed stack, then compare again.", level: "focus", metric: "head offset" }
      : { id: "posture-observed", text: "Alignment captured. Compare it with your own later sessions rather than chasing one ideal pose.", level: "info" };
  } else focusCue = reps.find((r) => r.cue.level === "focus")?.cue ?? reps.at(-1)?.cue ?? { id: "no-reps", text: "No complete reps detected. Try a full movement in view, then finish the set.", level: "setup" };

  const durationMs = frames.length > 1 ? frames.at(-1)!.t - frames[0].t : 0;
  const measurements = movement === "posture"
    ? [{ label: "Average head offset", value: quality === "unusable" ? "Not measured" : `${Math.round(mean(values.map((f) => f.headOffset).filter(Number.isFinite)) * 100)}% of torso` }, { label: "Average trunk lean", value: quality === "unusable" ? "Not measured" : `${Math.round(mean(values.map((f) => f.trunkLean)))}°` }]
    : [{ label: "Complete reps", value: String(reps.length) }, { label: "Peak hip bend", value: reps.length ? `${Math.round(Math.max(...reps.map((r) => r.peakHipFlexion)))}° from baseline` : "Not measured" }, { label: "Peak knee bend", value: reps.length ? `${Math.round(Math.max(...reps.map((r) => r.peakKneeFlexion)))}° from baseline` : "Not measured" }];
  return { movement, side: baseline.side, quality, qualityMessage, durationMs, reps, focusCue, measurements, validFrames: values.length, totalFrames: frames.length };
}

export function liveCue(frame: LandmarkFrame | null, movement: MovementId, baseline: CoachBaseline | null): CoachCue {
  if (!frame) return { id: "find-person", text: movement === "basketball" ? "Step into view so the camera can find your shooting arm." : "Step into view so the camera can find your full body.", level: "setup" };
  if (movement === "basketball") {
    const shot = basketballFrame(frame, baseline?.side ?? "right");
    if (!shot) return { id: "arm-hidden", text: "Keep your shooting shoulder, elbow and wrist in view.", level: "setup" };
    if (!baseline) return { id: "calibrate-arm", text: "Shooting arm visible. Calibrate, then start a set of shots.", level: "info" };
    return { id: "shot-tracking", text: "Shooting-arm motion is tracking. Finish the set to review timing and frames.", level: "info" };
  }
  const side = baseline?.side ?? dominantSide([frame]);
  const check = checkFraming(frame, side);
  if (!check.ok) return { id: check.issue, text: check.message, level: "setup" };
  if (!baseline) return { id: "calibrate", text: "Stand side-on and calibrate before the set.", level: "setup" };
  const f = coachFrame(frame, side);
  if (!f) return { id: "visibility", text: "Keep your full body visible and add light if needed.", level: "setup" };
  if (movement === "posture") return f.headOffset > 0.45 ? { id: "head-offset", text: "Head and shoulder appear separated in this side view.", level: "focus" } : { id: "hold", text: "Hold naturally. The app is comparing alignment over time.", level: "info" };
  if (movement === "swing" && !Number.isFinite(f.wristY)) return { id: "wrist-hidden", text: "Keep your hands in view so the swing can be counted.", level: "setup" };
  return { id: "track", text: "Movement tracking. Finish the set to review measured cues.", level: "info" };
}
