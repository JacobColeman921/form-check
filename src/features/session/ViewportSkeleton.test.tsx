import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewportSkeleton } from "./ViewportSkeleton";

describe("ViewportSkeleton", () => {
  it("announces itself as a busy status rather than being silent", () => {
    render(<ViewportSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveAccessibleName(/Starting the camera/);
  });

  it("warns that the first run downloads a model", () => {
    render(<ViewportSkeleton />);
    expect(screen.getByText(/First run downloads about 5 MB/)).toBeInTheDocument();
  });

  it("is shaped like a body, not a spinner, so the layout does not jump", () => {
    const { container } = render(<ViewportSkeleton />);
    // a head, a spine, two limb segments and three joints
    expect(container.querySelectorAll(".sk-bone").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll(".sk-dot").length).toBeGreaterThanOrEqual(4);
  });

  it("hides the decorative figure from assistive technology", () => {
    const { container } = render(<ViewportSkeleton />);
    expect(container.querySelector(".sk-figure")).toHaveAttribute("aria-hidden", "true");
  });
});
