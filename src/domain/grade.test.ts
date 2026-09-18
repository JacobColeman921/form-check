import { describe, expect, it } from "vitest";
import { DEFAULT_GRADE, gradeRep, gradeSession } from "./grade";
import { makeRep } from "../test/factory";
import type { Baseline } from "./types";

const baseline: Baseline = {
  standingKneeAngle: 175,
  standingHeelY: 0.92,
  standingTrunkLean: 5,
  side: "left",
  visibility: 1,
  frameCount: 90,
};

describe("gradeRep", () => {
  it("produces one result per criterion", () => {
    const g = gradeRep(makeRep(), baseline);
    expect(g.criteria.map((c) => c.id)).toEqual(["depth", "kneeAngle", "trunkLean", "heel"]);
  });

  it("passes a clean deep rep on every graded criterion", () => {
    const g = gradeRep(makeRep({ depthMargin: 0.08, peakTrunkLean: 25, peakHeelRise: 0.001 }), baseline);
    const graded = g.criteria.filter((c) => c.id !== "kneeAngle");
    expect(graded.every((c) => c.state === "MET")).toBe(true);
  });

  it("fails depth when the hip clearly stays above the knee", () => {
    const g = gradeRep(makeRep({ depthMargin: -0.1 }), baseline);
    expect(g.criteria.find((c) => c.id === "depth")!.state).toBe("NOT_MET");
  });

  it("refuses to call depth when the hip finishes level with the knee", () => {
    const g = gradeRep(makeRep({ depthMargin: 0.001 }), baseline);
    expect(g.criteria.find((c) => c.id === "depth")!.state).toBe("UNCALLABLE");
  });

  it("never grades the knee angle, only reports it", () => {
    const g = gradeRep(makeRep({ minKneeAngle: 60 }), baseline);
    const knee = g.criteria.find((c) => c.id === "kneeAngle")!;
    expect(knee.state).toBe("UNCALLABLE");
    expect(knee.detail).toContain("Reported, not graded");
  });

  it("measures trunk lean as change from the standing baseline", () => {
    const g = gradeRep(makeRep({ peakTrunkLean: 40 }), baseline);
    // 40 measured minus 5 standing is 35, comfortably under the 45 limit
    expect(g.criteria.find((c) => c.id === "trunkLean")!.value).toBeCloseTo(35, 6);
    expect(g.criteria.find((c) => c.id === "trunkLean")!.state).toBe("MET");
  });

  it("fails trunk lean well past the limit", () => {
    const g = gradeRep(makeRep({ peakTrunkLean: 75 }), baseline);
    expect(g.criteria.find((c) => c.id === "trunkLean")!.state).toBe("NOT_MET");
  });

  it("fails a lifted heel", () => {
    const g = gradeRep(makeRep({ peakHeelRise: 0.2 }), baseline);
    expect(g.criteria.find((c) => c.id === "heel")!.state).toBe("NOT_MET");
  });

  it("widens the bands and stops calling anything when visibility collapses", () => {
    const clean = gradeRep(makeRep({ visibility: 1, depthMargin: 0.03 }), baseline);
    const murky = gradeRep(makeRep({ visibility: 0.1, depthMargin: 0.03 }), baseline);
    expect(murky.uncallable).toBeGreaterThan(clean.uncallable);
  });

  it("every criterion carries a plain-language detail, never colour alone", () => {
    const g = gradeRep(makeRep(), baseline);
    for (const c of g.criteria) {
      expect(c.detail.length).toBeGreaterThan(10);
      expect(c.label.length).toBeGreaterThan(3);
    }
  });

  it("met, notMet and uncallable always sum to the criterion count", () => {
    for (const vis of [1, 0.8, 0.5, 0.2]) {
      const g = gradeRep(makeRep({ visibility: vis }), baseline);
      expect(g.met + g.notMet + g.uncallable).toBe(g.criteria.length);
    }
  });
});

describe("gradeSession", () => {
  it("reports NOT_GRADED with no reps", () => {
    const s = gradeSession([], baseline);
    expect(s.letter).toBe("NOT_GRADED");
    expect(s.repCount).toBe(0);
    expect(s.headline).toContain("No reps detected");
  });

  it("grades a clean set as A", () => {
    const reps = Array.from({ length: 5 }, (_, i) =>
      makeRep({ index: i, depthMargin: 0.08, peakTrunkLean: 25, peakHeelRise: 0.001 }),
    );
    const s = gradeSession(reps, baseline);
    expect(s.letter).toBe("A");
    expect(s.repCount).toBe(5);
    expect(s.score).toBe(1);
  });

  it("grades a set that fails everything as F", () => {
    const reps = Array.from({ length: 5 }, (_, i) =>
      makeRep({ index: i, depthMargin: -0.15, peakTrunkLean: 80, peakHeelRise: 0.25 }),
    );
    const s = gradeSession(reps, baseline);
    expect(s.letter).toBe("F");
    expect(s.score).toBe(0);
  });

  it("excludes the reported-only knee angle from the score denominator", () => {
    const reps = [makeRep({ depthMargin: 0.08, peakTrunkLean: 25, peakHeelRise: 0.001 })];
    const s = gradeSession(reps, baseline);
    // 3 graded criteria, all met. If kneeAngle counted, score would be 0.75 and the letter C.
    expect(s.callable).toBe(3);
    expect(s.score).toBe(1);
    expect(s.letter).toBe("A");
  });

  it("refuses to grade a set where most judgements land inside the error", () => {
    const reps = Array.from({ length: 5 }, (_, i) =>
      makeRep({ index: i, visibility: 0.05, depthMargin: 0.001, peakTrunkLean: 50, peakHeelRise: 0.03 }),
    );
    const s = gradeSession(reps, baseline);
    expect(s.letter).toBe("NOT_GRADED");
    expect(s.headline).toContain("not graded");
    expect(s.headline).toContain("Move the camera");
  });

  it("still reports the rep count when it refuses to grade", () => {
    const reps = Array.from({ length: 7 }, (_, i) =>
      makeRep({ index: i, visibility: 0.05, depthMargin: 0.001, peakTrunkLean: 50, peakHeelRise: 0.03 }),
    );
    expect(gradeSession(reps, baseline).repCount).toBe(7);
  });

  it("leads with the uncallable count, which is the honest headline", () => {
    const reps = [makeRep({ depthMargin: 0.08, peakTrunkLean: 25, peakHeelRise: 0.001 })];
    expect(gradeSession(reps, baseline).headline).toContain("too close to call");
  });

  it("walks the full letter scale", () => {
    const pass = { depthMargin: 0.08, peakTrunkLean: 25, peakHeelRise: 0.001 };
    const fail = { depthMargin: -0.15, peakTrunkLean: 80, peakHeelRise: 0.25 };
    const mix = (nPass: number, nFail: number) =>
      gradeSession(
        [
          ...Array.from({ length: nPass }, (_, i) => makeRep({ index: i, ...pass })),
          ...Array.from({ length: nFail }, (_, i) => makeRep({ index: nPass + i, ...fail })),
        ],
        baseline,
      ).letter;
    expect(mix(10, 0)).toBe("A");
    expect(mix(8, 2)).toBe("B");
    expect(mix(7, 3)).toBe("C");
    expect(mix(6, 4)).toBe("D");
    expect(mix(1, 9)).toBe("F");
  });

  it("honours a custom minCallableShare", () => {
    const reps = Array.from({ length: 4 }, (_, i) =>
      makeRep({ index: i, visibility: 0.05, depthMargin: 0.001, peakTrunkLean: 50, peakHeelRise: 0.03 }),
    );
    const lenient = gradeSession(reps, baseline, { ...DEFAULT_GRADE, minCallableShare: 0 });
    expect(lenient.letter).not.toBe("NOT_GRADED");
  });
});
