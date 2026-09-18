import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GradeReport } from "./GradeReport";
import { gradeSession } from "../../domain/grade";
import { makeRep } from "../../test/factory";
import type { Baseline } from "../../domain/types";

const baseline: Baseline = {
  standingKneeAngle: 175,
  standingHeelY: 0.92,
  standingTrunkLean: 5,
  side: "left",
  visibility: 1,
  frameCount: 90,
};

const cleanSet = () =>
  gradeSession(
    Array.from({ length: 3 }, (_, i) =>
      makeRep({ index: i, depthMargin: 0.08, peakTrunkLean: 25, peakHeelRise: 0.001 }),
    ),
    baseline,
  );

const murkySet = () =>
  gradeSession(
    Array.from({ length: 3 }, (_, i) =>
      makeRep({ index: i, visibility: 0.05, depthMargin: 0.001, peakTrunkLean: 50, peakHeelRise: 0.03 }),
    ),
    baseline,
  );

describe("GradeReport", () => {
  it("shows the letter grade for a clean set", () => {
    render(<GradeReport grade={cleanSet()} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows Not graded rather than a letter when the set is uncallable", () => {
    render(<GradeReport grade={murkySet()} />);
    expect(screen.getByText("Not graded")).toBeInTheDocument();
    expect(screen.getByText(/Move the camera/)).toBeInTheDocument();
  });

  it("renders one disclosure per rep", () => {
    render(<GradeReport grade={cleanSet()} />);
    expect(screen.getByText("Rep 1")).toBeInTheDocument();
    expect(screen.getByText("Rep 2")).toBeInTheDocument();
    expect(screen.getByText("Rep 3")).toBeInTheDocument();
  });

  it("states every criterion in words, never by colour alone", () => {
    render(<GradeReport grade={cleanSet()} />);
    // Three reps, four criteria each. Depth is met, knee angle is always
    // reported-only, so both labels must appear as text.
    expect(screen.getAllByText("Met").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Too close to call").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Depth at or below parallel").length).toBe(3);
  });

  it("prints the measurement and its band next to every judgement", () => {
    render(<GradeReport grade={cleanSet()} />);
    expect(screen.getAllByText(/band plus or minus/).length).toBeGreaterThan(0);
  });

  it("marks the knee angle as reported rather than graded", () => {
    render(<GradeReport grade={cleanSet()} />);
    expect(screen.getAllByText(/Reported, not graded/).length).toBe(3);
  });

  it("leads with the tally including the uncallable count", () => {
    render(<GradeReport grade={cleanSet()} />);
    expect(screen.getByText("Too close to call", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByText("Reps", { selector: "dt" })).toBeInTheDocument();
  });

  it("decorative glyphs are hidden from assistive technology", () => {
    const { container } = render(<GradeReport grade={cleanSet()} />);
    const glyphs = container.querySelectorAll(".glyph");
    expect(glyphs.length).toBeGreaterThan(0);
    glyphs.forEach((g) => expect(g).toHaveAttribute("aria-hidden", "true"));
  });
});
