import "./empty.css";

/**
 * The state before any set exists. A composed view that says what will appear
 * here and what it takes to get it, rather than an absence.
 */
export function EmptyReport({ calibrated }: { calibrated: boolean }) {
  return (
    <section className="empty" aria-labelledby="empty-heading">
      <div className="empty-art" aria-hidden="true">
        <span className="band met" />
        <span className="band unc" />
        <span className="band not" />
      </div>
      <div>
        <h2 id="empty-heading">No set graded yet</h2>
        <p>
          {calibrated
            ? "Baseline is set. Start a set and the report lands here."
            : "Calibrate first, then do a set."}{" "}
          Each rep gets four judgements, and every one arrives with the error band that produced it.
        </p>
        <ul className="legend">
          <li><span className="key met" aria-hidden="true">{"✓"}</span> Met, the value clears the threshold by more than the band</li>
          <li><span className="key not" aria-hidden="true">{"✗"}</span> Not met, it misses by more than the band</li>
          <li><span className="key unc" aria-hidden="true">?</span> Too close to call, it sits inside the band</li>
        </ul>
      </div>
    </section>
  );
}
