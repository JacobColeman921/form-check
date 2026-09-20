import { describe, expect, it } from "vitest";
import { fitWithin } from "./fit";

describe("fitWithin", () => {
  it("leaves anything already small enough alone", () => {
    expect(fitWithin(640, 480, 640)).toEqual({ w: 640, h: 480 });
    expect(fitWithin(320, 240, 640)).toEqual({ w: 320, h: 240 });
  });

  it("caps the long edge of a landscape frame", () => {
    expect(fitWithin(1920, 1080, 640)).toEqual({ w: 640, h: 360 });
  });

  it("caps the long edge of a portrait frame, which is what a phone gives", () => {
    expect(fitWithin(1080, 1920, 640)).toEqual({ w: 360, h: 640 });
  });

  it("keeps the aspect ratio", () => {
    const r = fitWithin(1280, 720, 500);
    expect(r.w / r.h).toBeCloseTo(1280 / 720, 2);
  });

  it("never returns a zero dimension", () => {
    expect(fitWithin(2000, 1, 640).h).toBe(1);
  });
});
