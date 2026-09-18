import { describe, expect, it } from "vitest";
import { DEFAULT_SEGMENT, segmentReps } from "./segment";
import { makeSeries, repCurve } from "../test/factory";

const standing = (n: number) => Array(n).fill(175);

describe("segmentReps", () => {
  it("returns nothing for an empty series", () => {
    expect(segmentReps([])).toEqual([]);
  });

  it("returns nothing when the athlete just stands there", () => {
    expect(segmentReps(makeSeries(standing(120)))).toEqual([]);
  });

  it("counts one clean rep", () => {
    const angles = [...standing(10), ...repCurve(175, 80, 40), ...standing(10)];
    const reps = segmentReps(makeSeries(angles));
    expect(reps).toHaveLength(1);
    expect(reps[0].minKneeAngle).toBeLessThan(100);
  });

  it("counts five reps in a set of five", () => {
    const angles = [...standing(10)];
    for (let i = 0; i < 5; i++) angles.push(...repCurve(175, 85, 40), ...standing(8));
    expect(segmentReps(makeSeries(angles))).toHaveLength(5);
  });

  it("indexes reps sequentially from zero", () => {
    const angles = [...standing(10)];
    for (let i = 0; i < 3; i++) angles.push(...repCurve(175, 85, 40), ...standing(8));
    expect(segmentReps(makeSeries(angles)).map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("does not chatter when the angle dithers across a single threshold", () => {
    // Oscillate tightly around the descend threshold. A naive single-threshold
    // detector produces a rep per oscillation. Hysteresis must produce none.
    const dither: number[] = [];
    for (let i = 0; i < 200; i++) dither.push(i % 2 === 0 ? 152 : 148);
    expect(segmentReps(makeSeries(dither))).toHaveLength(0);
  });

  it("rejects a dip that is too shallow to be a rep", () => {
    // bottoms out at 145, above maxAcceptedMinAngle of 140
    const angles = [...standing(10), ...repCurve(175, 145, 40), ...standing(10)];
    expect(segmentReps(makeSeries(angles))).toHaveLength(0);
  });

  it("rejects a rep that is too fast to be real", () => {
    // 6 frames at 30fps is 200ms, under the 400ms floor
    const angles = [...standing(10), ...repCurve(175, 80, 6), ...standing(10)];
    expect(segmentReps(makeSeries(angles))).toHaveLength(0);
  });

  it("treats a sink at the bottom as one rep, not two", () => {
    // A real bounce lasts several frames. One or two frames would be erased by
    // the smoother, which is the smoother doing its job.
    const angles = [
      ...standing(10),
      ...repCurve(175, 95, 24).slice(0, 12),          // descend to about 95
      100, 103, 105, 105, 103, 100,                   // bounce back up
      95, 90, 86, 82, 80, 80, 80, 82, 86, 90,         // then sink clearly deeper
      ...repCurve(90, 175, 24).slice(12),             // stand up
      ...standing(10),
    ];
    const reps = segmentReps(makeSeries(angles));
    expect(reps).toHaveLength(1);
    expect(reps[0].minKneeAngle).toBeLessThan(90);
  });

  it("uses timestamps rather than frame counts for phase durations", () => {
    const angles = [...standing(10), ...repCurve(175, 80, 40), ...standing(10)];
    const at30 = segmentReps(makeSeries(angles, { fps: 30 }))[0];
    const at60 = segmentReps(makeSeries(angles, { fps: 60 }))[0];
    // Same frames, half the wall time at 60fps.
    expect(at60.eccentricMs).toBeCloseTo(at30.eccentricMs / 2, 5);
  });

  it("ignores an unfinished rep at the end of the series", () => {
    const angles = [...standing(10), ...repCurve(175, 80, 40).slice(0, 20)];
    expect(segmentReps(makeSeries(angles))).toHaveLength(0);
  });

  it("records depth margin from the bottom frame", () => {
    const angles = [...standing(10), ...repCurve(175, 80, 40), ...standing(10)];
    const series = makeSeries(angles, {
      hipY: (a) => (a < 100 ? 0.62 : 0.4),
      kneeY: () => 0.6,
    });
    const rep = segmentReps(series)[0];
    expect(rep.depthMargin).toBeCloseTo(0.02, 6);
  });

  it("records peak trunk lean across the rep", () => {
    const angles = [...standing(10), ...repCurve(175, 80, 40), ...standing(10)];
    const series = makeSeries(angles, { trunkLean: (a) => (180 - a) / 3 });
    const rep = segmentReps(series)[0];
    expect(rep.peakTrunkLean).toBeGreaterThan(30);
  });

  it("carries mean visibility onto the rep", () => {
    const angles = [...standing(10), ...repCurve(175, 80, 40), ...standing(10)];
    const rep = segmentReps(makeSeries(angles, { visibility: 0.55 }))[0];
    expect(rep.visibility).toBeCloseTo(0.55, 6);
  });

  it("respects a custom config", () => {
    const angles = [...standing(10), ...repCurve(175, 145, 40), ...standing(10)];
    const loose = { ...DEFAULT_SEGMENT, maxAcceptedMinAngle: 160 };
    expect(segmentReps(makeSeries(angles), loose)).toHaveLength(1);
  });
});
