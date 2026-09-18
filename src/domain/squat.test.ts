import { describe, expect, it } from "vitest";
import { buildBaseline, dominantSide, isSagittal, pickSide, sideVisibility, squatFrameMetrics, squatSeries } from "./squat";
import { segmentReps } from "./segment";
import { gradeSession } from "./grade";
import { makeFrame, repCurve } from "../test/factory";
import { LM } from "./types";
import type { LandmarkFrame } from "./types";

const standingFrame = (t: number, vis = 1) => makeFrame({ kneeAngle: 175, t, visibility: vis });

describe("side selection", () => {
  it("reads mean visibility of hip, knee and ankle", () => {
    const f = makeFrame({ kneeAngle: 175, t: 0, visibility: 0.6 });
    expect(sideVisibility(f, "left")).toBeCloseTo(0.6, 6);
  });

  it("returns 0 when the landmark array is short", () => {
    expect(sideVisibility({ t: 0, points: [] }, "left")).toBe(0);
  });

  it("picks the more visible side", () => {
    const f = makeFrame({ kneeAngle: 175, t: 0 });
    f.points[LM.RIGHT_HIP].visibility = 0.2;
    f.points[LM.RIGHT_KNEE].visibility = 0.2;
    f.points[LM.RIGHT_ANKLE].visibility = 0.2;
    expect(pickSide(f)).toBe("left");
  });

  it("holds the dominant side across a run so it cannot flicker mid-rep", () => {
    const frames: LandmarkFrame[] = [];
    for (let i = 0; i < 10; i++) {
      const f = makeFrame({ kneeAngle: 175, t: i * 33 });
      // make right marginally better on two frames only
      if (i === 3 || i === 7) {
        f.points[LM.LEFT_HIP].visibility = 0.4;
        f.points[LM.LEFT_KNEE].visibility = 0.4;
        f.points[LM.LEFT_ANKLE].visibility = 0.4;
      }
      frames.push(f);
    }
    expect(dominantSide(frames)).toBe("left");
  });
});

describe("isSagittal", () => {
  it("accepts a side-on stance", () => {
    const frames = Array.from({ length: 30 }, (_, i) => makeFrame({ kneeAngle: 175, t: i * 33, hipSpread: 0.01 }));
    expect(isSagittal(frames).ok).toBe(true);
  });

  it("refuses a front-on stance and says what to do", () => {
    const frames = Array.from({ length: 30 }, (_, i) => makeFrame({ kneeAngle: 175, t: i * 33, hipSpread: 0.2 }));
    const r = isSagittal(frames);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Turn side-on");
  });

  it("refuses when there is no pose at all", () => {
    expect(isSagittal([]).ok).toBe(false);
    expect(isSagittal([{ t: 0, points: [] }]).ok).toBe(false);
  });
});

describe("squatFrameMetrics", () => {
  it("recovers the knee angle the frame was built with", () => {
    for (const target of [180, 160, 120, 90, 60]) {
      const m = squatFrameMetrics(makeFrame({ kneeAngle: target, t: 0 }), "left");
      expect(m.kneeAngle).toBeCloseTo(target, 4);
    }
  });

  it("recovers the trunk lean the frame was built with", () => {
    for (const target of [0, 15, 30, 45]) {
      const m = squatFrameMetrics(makeFrame({ kneeAngle: 120, trunkLean: target, t: 0 }), "left");
      expect(m.trunkLean).toBeCloseTo(target, 4);
    }
  });

  it("puts the hip above the knee when standing, in screen coordinates", () => {
    const m = squatFrameMetrics(standingFrame(0), "left");
    // y grows downward, so a higher hip has the smaller y
    expect(m.hipY).toBeLessThan(m.kneeY);
  });

  it("puts the hip below the knee once hipDrop pushes it there", () => {
    const m = squatFrameMetrics(makeFrame({ kneeAngle: 80, hipDrop: 0.25, t: 0 }), "left");
    expect(m.hipY).toBeGreaterThan(m.kneeY);
  });

  it("carries the frame timestamp through", () => {
    expect(squatFrameMetrics(standingFrame(1234), "left").t).toBe(1234);
  });
});

describe("buildBaseline", () => {
  it("averages a standing hold", () => {
    const frames = Array.from({ length: 90 }, (_, i) => standingFrame(i * 33));
    const b = buildBaseline(frames);
    expect(b.standingKneeAngle).toBeCloseTo(175, 3);
    expect(b.frameCount).toBe(90);
    expect(b.visibility).toBeCloseTo(1, 6);
    expect(b.side).toBe("left");
  });
});

describe("end to end over synthetic landmarks", () => {
  it("counts reps and grades a clean deep set", () => {
    const frames: LandmarkFrame[] = [];
    let t = 0;
    const push = (kneeAngle: number, hipDrop: number) => {
      frames.push(makeFrame({ kneeAngle, hipDrop, trunkLean: (180 - kneeAngle) / 6, t }));
      t += 33;
    };
    for (let i = 0; i < 15; i++) push(175, 0);
    for (let r = 0; r < 5; r++) {
      for (const a of repCurve(175, 75, 40)) push(a, a < 110 ? 0.26 : 0);
      for (let i = 0; i < 10; i++) push(175, 0);
    }

    const baseline = buildBaseline(frames.slice(0, 15));
    const series = squatSeries(frames, baseline.side);
    const reps = segmentReps(series);

    expect(reps).toHaveLength(5);

    const session = gradeSession(reps, baseline);
    expect(session.repCount).toBe(5);
    expect(session.letter).not.toBe("NOT_GRADED");
    expect(reps.every((r) => r.depthMargin > 0)).toBe(true);
  });

  it("still grades an unambiguously deep set even when visibility is poor", () => {
    // Wide bands do not make a clear measurement unclear. A hip 0.14 below the
    // knee is below the knee even at a 0.058 band. This is correct behaviour
    // and worth pinning down.
    const frames: LandmarkFrame[] = [];
    let t = 0;
    const push = (kneeAngle: number, hipDrop: number) => {
      frames.push(makeFrame({ kneeAngle, hipDrop, t, visibility: 0.05 }));
      t += 33;
    };
    for (let i = 0; i < 15; i++) push(175, 0);
    for (let r = 0; r < 5; r++) {
      for (const a of repCurve(175, 75, 40)) push(a, a < 110 ? 0.26 : 0);
      for (let i = 0; i < 10; i++) push(175, 0);
    }
    const baseline = buildBaseline(frames.slice(0, 15));
    const reps = segmentReps(squatSeries(frames, baseline.side));
    expect(reps).toHaveLength(5);
    expect(gradeSession(reps, baseline).letter).not.toBe("NOT_GRADED");
  });

  it("refuses to grade a set of borderline reps shot at poor visibility", () => {
    // Marginal depth plus a wide band is the case the refusal exists for.
    const frames: LandmarkFrame[] = [];
    let t = 0;
    const push = (kneeAngle: number, hipDrop: number) => {
      frames.push(makeFrame({ kneeAngle, hipDrop, t, visibility: 0.05 }));
      t += 33;
    };
    for (let i = 0; i < 15; i++) push(175, 0);
    for (let r = 0; r < 5; r++) {
      // hipDrop tuned so the hip lands almost exactly level with the knee
      for (const a of repCurve(175, 100, 40)) push(a, a < 130 ? 0.128 : 0);
      for (let i = 0; i < 10; i++) push(175, 0);
    }
    const baseline = buildBaseline(frames.slice(0, 15));
    const reps = segmentReps(squatSeries(frames, baseline.side));
    expect(reps.length).toBeGreaterThan(0);
    const session = gradeSession(reps, baseline);
    expect(session.letter).toBe("NOT_GRADED");
    expect(session.headline).toContain("Move the camera");
  });

  it("widening the band moves judgements from callable to uncallable", () => {
    const build = (visibility: number) => {
      const frames: LandmarkFrame[] = [];
      let t = 0;
      const push = (kneeAngle: number, hipDrop: number) => {
        frames.push(makeFrame({ kneeAngle, hipDrop, t, visibility }));
        t += 33;
      };
      for (let i = 0; i < 15; i++) push(175, 0);
      for (const a of repCurve(175, 100, 40)) push(a, a < 130 ? 0.128 : 0);
      for (let i = 0; i < 10; i++) push(175, 0);
      const baseline = buildBaseline(frames.slice(0, 15));
      return gradeSession(segmentReps(squatSeries(frames, baseline.side)), baseline);
    };
    expect(build(0.05).uncallable).toBeGreaterThan(build(1).uncallable);
  });

});
