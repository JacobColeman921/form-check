import { describe, expect, it } from "vitest";
import {
  ANGLE_BAND_MAX_DEG,
  ANGLE_RMSE_FLOOR_DEG,
  angleBand,
  isUnusable,
  positionBand,
  resolve,
} from "./uncertainty";

describe("angleBand", () => {
  it("equals the published RMSE floor at perfect visibility", () => {
    expect(angleBand(1)).toBeCloseTo(ANGLE_RMSE_FLOOR_DEG, 6);
  });

  it("never goes below the floor", () => {
    for (let v = 0; v <= 1; v += 0.05) expect(angleBand(v)).toBeGreaterThanOrEqual(ANGLE_RMSE_FLOOR_DEG - 1e-9);
  });

  it("widens as visibility falls", () => {
    expect(angleBand(0.5)).toBeGreaterThan(angleBand(1));
    expect(angleBand(0.2)).toBeGreaterThan(angleBand(0.5));
  });

  it("is capped", () => {
    expect(angleBand(0)).toBeLessThanOrEqual(ANGLE_BAND_MAX_DEG);
  });

  it("clamps visibility outside 0 to 1", () => {
    expect(angleBand(-5)).toBe(angleBand(0));
    expect(angleBand(5)).toBe(angleBand(1));
  });
});

describe("positionBand", () => {
  it("widens as visibility falls", () => {
    expect(positionBand(0.4)).toBeGreaterThan(positionBand(1));
  });
});

describe("isUnusable", () => {
  it("flags a maxed-out band", () => {
    expect(isUnusable(ANGLE_BAND_MAX_DEG)).toBe(true);
    expect(isUnusable(ANGLE_RMSE_FLOOR_DEG)).toBe(false);
  });
});

describe("resolve", () => {
  it("calls a clear pass above the threshold", () => {
    expect(resolve(100, 90, 5, "above")).toBe("MET");
  });

  it("calls a clear fail below the threshold", () => {
    expect(resolve(80, 90, 5, "above")).toBe("NOT_MET");
  });

  it("inverts correctly for below-is-better criteria", () => {
    expect(resolve(80, 90, 5, "below")).toBe("MET");
    expect(resolve(100, 90, 5, "below")).toBe("NOT_MET");
  });

  it("refuses to call a value inside the band", () => {
    expect(resolve(92, 90, 7, "above")).toBe("UNCALLABLE");
    expect(resolve(88, 90, 7, "above")).toBe("UNCALLABLE");
    expect(resolve(92, 90, 7, "below")).toBe("UNCALLABLE");
  });

  it("treats the band edge as uncallable, not as a pass", () => {
    expect(resolve(97, 90, 7, "above")).toBe("UNCALLABLE");
    expect(resolve(97.01, 90, 7, "above")).toBe("MET");
  });

  it("is the whole thesis: 88 and 92 degrees are the same rep at 7 degree error", () => {
    expect(resolve(88, 90, 7, "below")).toBe(resolve(92, 90, 7, "below"));
  });
});
