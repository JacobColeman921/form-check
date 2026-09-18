import { describe, expect, it } from "vitest";
import { angleFromVertical, clamp, mean, median, smooth, stdDev, threePointAngle } from "./geometry";
import type { Landmark } from "./types";

const p = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });

describe("threePointAngle", () => {
  it("returns 180 for a straight line", () => {
    expect(threePointAngle(p(0, 0), p(0, 1), p(0, 2))).toBeCloseTo(180, 6);
  });

  it("returns 90 for a right angle", () => {
    expect(threePointAngle(p(0, 0), p(0, 1), p(1, 1))).toBeCloseTo(90, 6);
  });

  it("returns 135 for rays at (0,-1) and (1,1)", () => {
    // b=(0,1). a-b points straight up, c-b points down-right at 45 degrees.
    // Interior angle between them is 135, not 45.
    expect(threePointAngle(p(0, 0), p(0, 1), p(1, 2))).toBeCloseTo(135, 6);
  });

  it("returns 45 when the two rays are 45 degrees apart", () => {
    expect(threePointAngle(p(0, -1), p(0, 0), p(1, -1))).toBeCloseTo(45, 6);
  });

  it("is symmetric in its outer arguments", () => {
    const a = p(0.2, 0.1), b = p(0.3, 0.5), c = p(0.1, 0.9);
    expect(threePointAngle(a, b, c)).toBeCloseTo(threePointAngle(c, b, a), 10);
  });

  it("never exceeds 180", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const r = (deg * Math.PI) / 180;
      const v = threePointAngle(p(1, 0), p(0, 0), p(Math.cos(r), Math.sin(r)));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(180);
    }
  });

  it("stays accurate near the straight-leg case where dot product degrades", () => {
    // knee almost locked: 179 degrees
    const v = threePointAngle(p(0, 0), p(0, 1), p(Math.sin((1 * Math.PI) / 180), 2));
    expect(v).toBeGreaterThan(178);
    expect(v).toBeLessThan(180);
  });
});

describe("angleFromVertical", () => {
  it("returns 0 for a vertical segment pointing down", () => {
    expect(angleFromVertical(p(0.5, 0.2), p(0.5, 0.8))).toBeCloseTo(0, 6);
  });

  it("returns 0 for a vertical segment pointing up", () => {
    expect(angleFromVertical(p(0.5, 0.8), p(0.5, 0.2))).toBeCloseTo(0, 6);
  });

  it("returns 90 for a horizontal segment", () => {
    expect(angleFromVertical(p(0.2, 0.5), p(0.8, 0.5))).toBeCloseTo(90, 6);
  });

  it("returns 45 for an even diagonal", () => {
    expect(angleFromVertical(p(0, 0), p(1, 1))).toBeCloseTo(45, 6);
  });

  it("returns 0 for a zero-length segment rather than NaN", () => {
    expect(angleFromVertical(p(0.4, 0.4), p(0.4, 0.4))).toBe(0);
  });

  it("never exceeds 90", () => {
    for (let deg = 0; deg < 360; deg += 11) {
      const r = (deg * Math.PI) / 180;
      const v = angleFromVertical(p(0, 0), p(Math.cos(r), Math.sin(r)));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(90.0000001);
    }
  });
});

describe("statistics", () => {
  it("mean of empty is 0", () => expect(mean([])).toBe(0));
  it("mean works", () => expect(mean([1, 2, 3, 4])).toBe(2.5));
  it("stdDev of fewer than two is 0", () => expect(stdDev([5])).toBe(0));
  it("stdDev uses the sample denominator", () => expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4));
  it("median odd", () => expect(median([3, 1, 2])).toBe(2));
  it("median even", () => expect(median([4, 1, 3, 2])).toBe(2.5));
  it("median does not mutate its input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("smooth", () => {
  it("returns a copy when the window is 1", () => {
    const xs = [1, 2, 3];
    expect(smooth(xs, 1)).toEqual(xs);
    expect(smooth(xs, 1)).not.toBe(xs);
  });

  it("preserves length", () => {
    expect(smooth([1, 2, 3, 4, 5, 6, 7], 5)).toHaveLength(7);
  });

  it("flattens a spike without shifting the series", () => {
    const xs = [10, 10, 10, 40, 10, 10, 10];
    const out = smooth(xs, 3);
    expect(out[3]).toBeLessThan(40);
    // A centred window spreads the spike symmetrically around index 3, so the
    // maxima tie. Symmetry is the real no-phase-shift assertion.
    expect(out[2]).toBeCloseTo(out[4], 10);
    expect(out[1]).toBeCloseTo(out[5], 10);
    expect(out[3]).toBe(Math.max(...out));
  });

  it("leaves a constant series unchanged", () => {
    expect(smooth([7, 7, 7, 7, 7], 5)).toEqual([7, 7, 7, 7, 7]);
  });

  it("forces an even window odd", () => {
    expect(smooth([1, 2, 3, 4, 5], 4)).toEqual(smooth([1, 2, 3, 4, 5], 5));
  });
});

describe("clamp", () => {
  it("clamps low, high and passes through", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
