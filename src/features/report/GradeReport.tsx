import type { CriterionState, SessionGrade } from "../../domain/types";
import "./report.css";

/**
 * State is carried by a text label and a glyph as well as a colour, because
 * colour alone fails WCAG 1.4.1 and is how every traffic-light form app gets
 * this wrong.
 */
const STATE_LABEL: Record<CriterionState, string> = {
  MET: "Met",
  NOT_MET: "Not met",
  UNCALLABLE: "Too close to call",
};

const STATE_GLYPH: Record<CriterionState, string> = {
  MET: "✓",
  NOT_MET: "✗",
  UNCALLABLE: "?",
};

function unitLabel(value: number, unit: string): string {
  if (unit === "deg") return `${value.toFixed(1)} deg`;
  if (unit === "ms") return `${Math.round(value)} ms`;
  return value.toFixed(3);
}

export function GradeReport({ grade }: { grade: SessionGrade }) {
  return (
    <section className="report" aria-labelledby="report-heading">
      <h2 id="report-heading">Set report</h2>

      <div className="verdict">
        <div className={`letter ${grade.letter === "NOT_GRADED" ? "ng" : ""}`}>
          {grade.letter === "NOT_GRADED" ? "Not graded" : grade.letter}
        </div>
        <p className="headline">{grade.headline}</p>
      </div>

      <dl className="tally">
        <div><dt>Reps</dt><dd className="mono">{grade.repCount}</dd></div>
        <div><dt>Judgements met</dt><dd className="mono">{grade.met}</dd></div>
        <div><dt>Callable</dt><dd className="mono">{grade.callable}</dd></div>
        <div><dt>Too close to call</dt><dd className="mono">{grade.uncallable}</dd></div>
      </dl>

      {grade.reps.map((rg) => (
        <details key={rg.rep.index} className="rep">
          <summary>
            <span className="rep-n mono">Rep {rg.rep.index + 1}</span>
            <span className="rep-sum">
              {rg.met} met, {rg.notMet} not met, {rg.uncallable} too close to call
            </span>
          </summary>
          <ul className="criteria">
            {rg.criteria.map((c) => (
              <li key={c.id} className={`crit ${c.state.toLowerCase()}`}>
                <span className="glyph" aria-hidden="true">{STATE_GLYPH[c.state]}</span>
                <span className="body">
                  <span className="label">{c.label}</span>
                  <span className="state">{STATE_LABEL[c.state]}</span>
                  <span className="detail">{c.detail}</span>
                  <span className="numbers mono">
                    measured {unitLabel(c.value, c.unit)}, band plus or minus {unitLabel(c.band, c.unit)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="timing mono">
            down {Math.round(rg.rep.eccentricMs)} ms, up {Math.round(rg.rep.concentricMs)} ms,
            {" "}visibility {(rg.rep.visibility * 100).toFixed(0)} percent
          </p>
        </details>
      ))}
    </section>
  );
}
