import { describe, expect, it } from "vitest";
import { monotonicClock } from "./clock";

describe("monotonicClock", () => {
  it("returns integers", () => {
    const tick = monotonicClock(() => 12.7);
    expect(Number.isInteger(tick())).toBe(true);
  });

  it("advances with real time", () => {
    let t = 0;
    const tick = monotonicClock(() => (t += 33.3));
    expect(tick()).toBe(33);
    expect(tick()).toBe(67);
    expect(tick()).toBe(100);
  });

  it("never repeats when the clock stalls, which is the bug this exists for", () => {
    const tick = monotonicClock(() => 100);
    expect(tick()).toBe(100);
    expect(tick()).toBe(101);
    expect(tick()).toBe(102);
  });

  it("never goes backwards when the clock does", () => {
    const times = [500, 100, 120, 80];
    let i = 0;
    const tick = monotonicClock(() => times[i++]);
    const out = [tick(), tick(), tick(), tick()];
    expect(out).toEqual([500, 501, 502, 503]);
    for (let j = 1; j < out.length; j++) expect(out[j]).toBeGreaterThan(out[j - 1]);
  });

  it("is strictly increasing across a long run of a stalled clock", () => {
    const tick = monotonicClock(() => 0);
    let prev = -Infinity;
    for (let i = 0; i < 500; i++) {
      const t = tick();
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });
});
