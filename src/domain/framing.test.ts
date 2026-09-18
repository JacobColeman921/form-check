import { describe, expect, it } from "vitest";
import { checkFraming } from "./framing";
import { makeFrame } from "../test/factory";
import { LM } from "./types";
import type { LandmarkFrame } from "./types";

const full = () => makeFrame({ kneeAngle: 175, t: 0 });

/** Hide a set of landmarks the way MediaPipe does when they leave the frame. */
function hide(frame: LandmarkFrame, indices: number[]): LandmarkFrame {
  const copy: LandmarkFrame = { t: frame.t, points: frame.points.map((p) => ({ ...p })) };
  for (const i of indices) copy.points[i].visibility = 0.02;
  return copy;
}

describe("checkFraming", () => {
  it("accepts a whole body in shot", () => {
    const r = checkFraming(full(), "left");
    expect(r.ok).toBe(true);
    expect(r.issue).toBe("ok");
  });

  it("rejects a missing pose", () => {
    expect(checkFraming(null, "left").issue).toBe("no-pose");
    expect(checkFraming({ t: 0, points: [] }, "left").issue).toBe("no-pose");
  });

  it("catches the face-only case, which is what a laptop camera gives you", () => {
    const faceOnly = hide(full(), [
      LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX,
    ]);
    const r = checkFraming(faceOnly, "left");
    expect(r.ok).toBe(false);
    expect(r.issue).toBe("legs-missing");
    expect(r.message).toContain("Move the camera back");
  });

  it("catches feet cut off at the bottom", () => {
    const r = checkFraming(hide(full(), [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX]), "left");
    expect(r.issue).toBe("feet-missing");
  });

  it("catches a head out of frame", () => {
    const r = checkFraming(hide(full(), [LM.NOSE]), "left");
    expect(r.issue).toBe("head-missing");
  });

  it("reports the measured visibility so the reason is checkable", () => {
    const faceOnly = hide(full(), [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE]);
    expect(checkFraming(faceOnly, "left").visibility).toBeLessThan(0.1);
  });

  it("checks the side it was asked about, not the other one", () => {
    const rightGone = hide(full(), [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX]);
    expect(checkFraming(rightGone, "left").ok).toBe(true);
    expect(checkFraming(rightGone, "right").ok).toBe(false);
  });

  it("always returns a message a person can act on", () => {
    const cases = [
      null,
      hide(full(), [LM.LEFT_HIP, LM.LEFT_KNEE]),
      hide(full(), [LM.LEFT_ANKLE]),
      hide(full(), [LM.NOSE]),
    ];
    for (const c of cases) {
      const m = checkFraming(c, "left").message;
      expect(m.length).toBeGreaterThan(15);
      expect(m).toMatch(/[.!]$/);
    }
  });
});
