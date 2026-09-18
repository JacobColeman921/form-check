import "./skeleton.css";

/**
 * Shown while the model downloads and the camera warms up.
 *
 * Shaped like the thing it replaces rather than a spinner, so the layout does
 * not jump when the real view arrives.
 */
export function ViewportSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Starting the camera and loading the pose model">
      <div className="sk-figure" aria-hidden="true">
        <span className="sk-dot sk-head" />
        <span className="sk-bone sk-spine" />
        <span className="sk-bone sk-thigh" />
        <span className="sk-bone sk-shank" />
        <span className="sk-dot sk-hip" />
        <span className="sk-dot sk-knee" />
        <span className="sk-dot sk-ankle" />
      </div>
      <p className="sk-note">Loading the pose model. First run downloads about 5 MB.</p>
    </div>
  );
}
