import { describe, expect, it } from "vitest";
import { analyzeBasketball, basketballCalibration, basketballFrame } from "./basketball";
import { makeFrame } from "../test/factory";
import { LM } from "./types";
import type { LandmarkFrame } from "./types";

function armFrame(t: number, wristX: number, wristY: number, visible = true): LandmarkFrame {
  const frame = makeFrame({ kneeAngle: 175, t });
  frame.points[LM.RIGHT_SHOULDER] = { x: 0.52, y: 0.45, z: 0, visibility: 1 };
  frame.points[LM.RIGHT_ELBOW] = { x: 0.56, y: 0.35, z: 0, visibility: 1 };
  frame.points[LM.RIGHT_WRIST] = { x: wristX, y: wristY, z: 0, visibility: visible ? 1 : 0.1 };
  frame.points[LM.RIGHT_HIP] = { x: 0.54, y: 0.66, z: 0, visibility: 1 };
  return frame;
}

describe("basketball shooting-arm analysis", () => {
  it("accepts an upper-body view without requiring visible feet", () => {
    const frames = Array.from({ length: 12 }, (_, i) => armFrame(i * 33, 0.5, 0.31));
    for (const frame of frames) frame.points[LM.RIGHT_ANKLE].visibility = 0;
    expect(basketballCalibration(frames, "right").ok).toBe(true);
    expect(basketballFrame(frames[0], "right")).not.toBeNull();
  });

  it("counts a set-to-extension motion and labels the outcome unknown", () => {
    const wrists = [...Array(9).fill([0.55, 0.55]), ...Array(10).fill([0.5, 0.31]), ...Array(5).fill([0.61, 0.2]), ...Array(5).fill([0.55, 0.55])];
    const frames = wrists.map(([x, y], i) => armFrame(i * 33, x, y));
    const result = analyzeBasketball(frames, "right");
    expect(result.quality).toBe("usable");
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].elbowAtExtension).toBeGreaterThan(150);
    expect(result.shots[0].cue.text).toContain("not measured");
  });

  it("does not count an occluded arm", () => {
    const frames = Array.from({ length: 24 }, (_, i) => armFrame(i * 33, 0.61, 0.2, false));
    const result = analyzeBasketball(frames, "right");
    expect(result.quality).toBe("unusable");
    expect(result.shots).toHaveLength(0);
  });
});
