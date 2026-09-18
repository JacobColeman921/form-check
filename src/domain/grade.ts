import { angleBand, positionBand, resolve } from "./uncertainty";
import type { Baseline, CriterionResult, Rep, RepGrade, SessionGrade } from "./types";

export interface GradeConfig {
  /** Hip must clear the knee by more than the band to count as below parallel. */
  depthTargetNorm: number;
  /** Trunk lean above the standing baseline that counts as excessive, degrees. */
  maxTrunkLeanDeg: number;
  /** Heel rise above the standing baseline that counts as a lifted heel, normalised. */
  maxHeelRiseNorm: number;
  /** Below this share of callable judgements, the set is not graded at all. */
  minCallableShare: number;
}

export const DEFAULT_GRADE: GradeConfig = {
  depthTargetNorm: 0,
  maxTrunkLeanDeg: 45,
  maxHeelRiseNorm: 0.03,
  minCallableShare: 0.5,
};

function fmt(n: number, dp = 1): string {
  return n.toFixed(dp);
}

export function gradeRep(rep: Rep, baseline: Baseline, config: GradeConfig = DEFAULT_GRADE): RepGrade {
  const aBand = angleBand(rep.visibility);
  const pBand = positionBand(rep.visibility);

  const criteria: CriterionResult[] = [];

  // 1. Depth relative to parallel. Positive depthMargin means hip below knee.
  {
    const state = resolve(rep.depthMargin, config.depthTargetNorm, pBand, "above");
    criteria.push({
      id: "depth",
      label: "Depth at or below parallel",
      value: rep.depthMargin,
      unit: "norm",
      threshold: config.depthTargetNorm,
      band: pBand,
      state,
      detail:
        state === "UNCALLABLE"
          ? `Hip finished within ${fmt(pBand, 3)} of knee height. Too close to call.`
          : state === "MET"
            ? "Hip passed below the knee."
            : "Hip stayed above the knee.",
    });
  }

  // 2. Knee flexion at the bottom. Descriptive only, never pass or fail.
  criteria.push({
    id: "kneeAngle",
    label: "Knee angle at the bottom",
    value: rep.minKneeAngle,
    unit: "deg",
    threshold: rep.minKneeAngle,
    band: aBand,
    state: "UNCALLABLE",
    detail: `${fmt(rep.minKneeAngle)} degrees, give or take ${fmt(aBand)}. Reported, not graded.`,
  });

  // 3. Trunk lean, measured as change from the standing baseline.
  {
    const delta = rep.peakTrunkLean - baseline.standingTrunkLean;
    const state = resolve(delta, config.maxTrunkLeanDeg, aBand, "below");
    criteria.push({
      id: "trunkLean",
      label: "Trunk stays upright enough",
      value: delta,
      unit: "deg",
      threshold: config.maxTrunkLeanDeg,
      band: aBand,
      state,
      detail:
        state === "UNCALLABLE"
          ? `Leaned ${fmt(delta)} degrees more than standing, within ${fmt(aBand)} of the limit. Too close to call.`
          : state === "MET"
            ? `Leaned ${fmt(delta)} degrees more than standing.`
            : `Leaned ${fmt(delta)} degrees more than standing, past the ${config.maxTrunkLeanDeg} degree limit.`,
    });
  }

  // 4. Heels stay down.
  {
    const state = resolve(rep.peakHeelRise, config.maxHeelRiseNorm, pBand, "below");
    criteria.push({
      id: "heel",
      label: "Heels stay down",
      value: rep.peakHeelRise,
      unit: "norm",
      threshold: config.maxHeelRiseNorm,
      band: pBand,
      state,
      detail:
        state === "UNCALLABLE"
          ? "Heel movement is inside the measurement error. Too close to call."
          : state === "MET"
            ? "Heels stayed down."
            : "Heel lifted during the rep.",
    });
  }

  const met = criteria.filter((c) => c.state === "MET").length;
  const notMet = criteria.filter((c) => c.state === "NOT_MET").length;
  const uncallable = criteria.filter((c) => c.state === "UNCALLABLE").length;

  return { rep, criteria, met, notMet, uncallable };
}

function letterFor(score: number): SessionGrade["letter"] {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export function gradeSession(
  reps: Rep[],
  baseline: Baseline,
  config: GradeConfig = DEFAULT_GRADE,
): SessionGrade {
  const graded = reps.map((r) => gradeRep(r, baseline, config));

  // The knee-angle criterion is reported, never graded, so it is excluded from
  // the callable denominator. Counting it would drag every score down.
  const judged = graded.flatMap((g) => g.criteria.filter((c) => c.id !== "kneeAngle"));
  const callable = judged.filter((c) => c.state !== "UNCALLABLE").length;
  const uncallable = judged.filter((c) => c.state === "UNCALLABLE").length;
  const met = judged.filter((c) => c.state === "MET").length;

  const total = callable + uncallable;
  const score = callable > 0 ? met / callable : null;

  if (reps.length === 0) {
    return {
      reps: graded, repCount: 0, callable, uncallable, met, score: null,
      letter: "NOT_GRADED",
      headline: "No reps detected. Check that the whole body is in frame.",
    };
  }

  if (total === 0 || callable / total < config.minCallableShare) {
    return {
      reps: graded, repCount: reps.length, callable, uncallable, met, score,
      letter: "NOT_GRADED",
      headline: `${uncallable} of ${total} judgements landed inside the measurement error, so this set is not graded. Move the camera further back, get your whole body in frame, and add light.`,
    };
  }

  const letter = letterFor(score as number);
  return {
    reps: graded, repCount: reps.length, callable, uncallable, met, score,
    letter,
    headline: `${reps.length} reps. ${met} of ${callable} judgements met, ${uncallable} too close to call.`,
  };
}
