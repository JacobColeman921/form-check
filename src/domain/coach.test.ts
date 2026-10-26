import { describe, expect, it } from "vitest";
import { analyzeSession, buildCoachBaseline } from "./coach";
import { makeFrame, repCurve } from "../test/factory";
import { LM } from "./types";

const standing = Array.from({ length: 15 }, (_, i) => makeFrame({ kneeAngle: 175, t: i * 33 }));
const baseline = buildCoachBaseline(standing).baseline!;

describe("movement coach", () => {
  it("calibrates only from a visible side view", () => {
    expect(baseline.side).toBe("left");
    const front = standing.map((frame) => ({ ...frame, points: frame.points.map((point, index) => index === LM.RIGHT_HIP ? { ...point, x: point.x + 0.2 } : point) }));
    expect(buildCoachBaseline(front).baseline).toBeNull();
  });

  it("counts complete squat cycles and ignores an unfinished one", () => {
    const angles = [...Array(10).fill(175), ...repCurve(175, 85, 40), ...Array(10).fill(175), ...repCurve(175, 95, 20).slice(0, 10)];
    const frames = angles.map((kneeAngle, i) => makeFrame({ kneeAngle, t: i * 33 }));
    const result = analyzeSession(frames, "squat", baseline);
    expect(result.quality).toBe("usable");
    expect(result.reps).toHaveLength(1);
    expect(result.reps[0].peakKneeFlexion).toBeGreaterThan(70);
  });

  it("counts a hinge as a deadlift cycle", () => {
    const lean = [...Array(10).fill(0), ...Array.from({ length: 15 }, (_, i) => i * 5), ...Array.from({ length: 15 }, (_, i) => 70 - i * 5), ...Array(10).fill(0)];
    const frames = lean.map((trunkLean, i) => makeFrame({ kneeAngle: 175, trunkLean, t: i * 33 }));
    expect(analyzeSession(frames, "deadlift", baseline).reps).toHaveLength(1);
  });

  it("counts a wrist-rise swing cycle without claiming to track the bell", () => {
    const heights = [...Array(10).fill(0.65), ...Array.from({ length: 15 }, (_, i) => 0.65 - i * 0.025), ...Array.from({ length: 15 }, (_, i) => 0.30 + i * 0.025), ...Array(10).fill(0.65)];
    const frames = heights.map((wristY, i) => {
      const frame = makeFrame({ kneeAngle: 175, t: i * 33 });
      frame.points[LM.LEFT_WRIST].y = wristY;
      return frame;
    });
    const result = analyzeSession(frames, "swing", baseline);
    expect(result.reps).toHaveLength(1);
    expect(result.reps[0].cue.text).toContain("bell path");
  });

  it("withholds review when the camera loses most of the body", () => {
    const hidden = standing.map((frame) => ({ ...frame, points: frame.points.map((point, index) => index === LM.LEFT_ANKLE ? { ...point, visibility: 0.01 } : point) }));
    const result = analyzeSession(hidden, "goblet", baseline);
    expect(result.quality).toBe("unusable");
    expect(result.reps).toHaveLength(0);
  });

  it("routes basketball through upper-body calibration and shot-motion review", () => {
    const frames = [...Array(10).fill([0.5, 0.31]), ...Array(6).fill([0.61, 0.2])].map(([x, y], i) => {
      const frame = makeFrame({ kneeAngle: 175, t: i * 33 });
      frame.points[LM.RIGHT_SHOULDER] = { x: 0.52, y: 0.45, z: 0, visibility: 1 };
      frame.points[LM.RIGHT_ELBOW] = { x: 0.56, y: 0.35, z: 0, visibility: 1 };
      frame.points[LM.RIGHT_WRIST] = { x, y, z: 0, visibility: 1 };
      frame.points[LM.RIGHT_HIP] = { x: 0.54, y: 0.66, z: 0, visibility: 1 };
      frame.points[LM.RIGHT_ANKLE].visibility = 0;
      return frame;
    });
    const camera = buildCoachBaseline(frames, "basketball", "right");
    expect(camera.baseline?.side).toBe("right");
    const result = analyzeSession(frames, "basketball", camera.baseline!);
    expect(result.reps).toHaveLength(0);
    expect(result.shots).toHaveLength(1);
  });
});
