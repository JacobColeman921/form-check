import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyReport } from "./EmptyReport";

describe("EmptyReport", () => {
  it("is a composed state, not an absence", () => {
    render(<EmptyReport calibrated={false} />);
    expect(screen.getByRole("heading", { name: "No set graded yet" })).toBeInTheDocument();
  });

  it("tells an uncalibrated user what to do first", () => {
    render(<EmptyReport calibrated={false} />);
    expect(screen.getByText(/Calibrate first, then do a set/)).toBeInTheDocument();
  });

  it("changes the instruction once a baseline exists", () => {
    render(<EmptyReport calibrated />);
    expect(screen.getByText(/Baseline is set/)).toBeInTheDocument();
    expect(screen.queryByText(/Calibrate first/)).not.toBeInTheDocument();
  });

  it("explains all three judgement states before any set is run", () => {
    render(<EmptyReport calibrated />);
    expect(screen.getByText(/Met, the value clears the threshold/)).toBeInTheDocument();
    expect(screen.getByText(/Not met, it misses by more than the band/)).toBeInTheDocument();
    expect(screen.getByText(/Too close to call, it sits inside the band/)).toBeInTheDocument();
  });

  it("hides the decorative bands and glyph keys from assistive technology", () => {
    const { container } = render(<EmptyReport calibrated />);
    expect(container.querySelector(".empty-art")).toHaveAttribute("aria-hidden", "true");
    container.querySelectorAll(".key").forEach((k) => expect(k).toHaveAttribute("aria-hidden", "true"));
  });
});
