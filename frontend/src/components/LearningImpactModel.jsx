// frontend/src/components/LearningImpactModel.jsx
//
// "Learning Impact Model (Simple Regression)" for the admin analytics page.
// Two entry points share one body so the dashboard, the on-screen Full Report
// and the PDF/Excel exports can never drift apart:
//   <LearningImpactModelSection />        -- dashboard block
//   <LearningImpactModelReportSection />  -- numbered section in the report modal
//
// Everything shown comes from `overview.regression` (computed once on the
// server in api/services/regression_service.py, after the same respondent
// scoping as the rest of the dashboard):
//   X (independent variable) = "System Interaction" composite
//       = average(z_TSR, z_AES, z_ROG)
//   Y (dependent variable) = "Normalized Learning Gain" (Hake's g)
//       = (Post - Pre) / (100 - Pre)
//   Model: Y = b0 + b1 * X, one predictor, fit by the running-sums formula.
//
// This component never re-fits the model and has no controls that change
// which respondents are in it: a non-significant result is shown as
// non-significant.

import { useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LuChevronDown, LuChevronUp, LuTriangleAlert, LuTrendingUp } from "react-icons/lu";
import {
  buildScatterSpec,
  fmtCi,
  fmtNum,
  fmtP,
  fmtR2,
  isModelSignificant,
} from "../utils/regressionReport";

const BRAND = "#5A1398";
const INFLUENTIAL = "#ea580c";

function PhaseLegend({ phases }) {
  if (!phases?.length) return null;
  return (
    <ol className="lim-phases" aria-label="Study phases">
      {phases.map((p) => (
        <li key={p.phase} className={`lim-phase${p.phase === 3 || p.phase === 4 ? " is-modelled" : ""}`}>
          <span className="lim-phase-num">{p.phase}</span>
          {p.label}
        </li>
      ))}
    </ol>
  );
}

// Green only when the slope test is significant at .05; otherwise a
// neutral gray that says so. Deliberately no amber/red "almost" styling.
function SignificanceBadge({ model }) {
  const sig = isModelSignificant(model);
  return (
    <span className={`lim-badge ${sig ? "is-significant" : "is-neutral"}`}>
      {sig ? "Statistically significant (p < .05)" : "Not statistically significant"}
      <span className="lim-badge-detail"> &middot; p {fmtP(model.p)}</span>
    </span>
  );
}

function InclusionNote({ reg }) {
  return (
    <div className="lim-inclusion">
      <strong>n = {reg.n_included}</strong> with complete data &middot; {reg.n_excluded} excluded
      {reg.n_dropped_for_regression > 0 && (
        <> &middot; {reg.n_dropped_for_regression} dropped from the regression only (Y undefined)</>
      )}
      {reg.excluded_reasons?.length > 0 && (
        <ul className="lim-exclusions">
          {reg.excluded_reasons.map((r) => (
            <li key={r.reason}>{r.count} &times; {r.reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModelTable({ reg }) {
  const { model, correlation } = reg;
  return (
    <div className="user-report-table-wrapper">
      <table className="full-report-table wide lim-table">
        <thead>
          <tr>
            <th>b0 (intercept)</th>
            <th>b1 (slope)</th>
            <th>SE(b1)</th>
            <th>t</th>
            <th>p</th>
            <th>95% CI (b1)</th>
            <th>r</th>
            <th>R&sup2;</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{fmtNum(model.b0)}</td>
            <td>{fmtNum(model.b1)}</td>
            <td>{fmtNum(model.se_b1)}</td>
            <td>{fmtNum(model.t, 2)}</td>
            <td>{fmtP(model.p)}</td>
            <td>{fmtCi(model.ci_low, model.ci_high)}</td>
            <td>{fmtR2(correlation.r)}</td>
            <td>{fmtR2(correlation.r2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LiiCard({ lii }) {
  return (
    <div className="analytics-card lim-lii-card">
      <div className="analytics-card-icon hakesg"><LuTrendingUp size={20} /></div>
      <div className="analytics-card-body">
        <span className="analytics-card-value">{fmtNum(lii.mean, 2)} / 100</span>
        <span className="analytics-card-label">
          Learning Impact Index (mean) &middot; SD {fmtNum(lii.sd, 2)}, range {fmtNum(lii.min, 1)}&ndash;{fmtNum(lii.max, 1)}
        </span>
        <span className="lim-lii-status">Proposed &mdash; pending adviser approval</span>
        <span className="analytics-card-label">{lii.formula}. Descriptive only.</span>
      </div>
    </div>
  );
}

function SensitivityBody({ reg }) {
  return (
    <>
      <div className="user-report-table-wrapper">
        <table className="full-report-table wide lim-table">
          <thead>
            <tr>
              <th>Specification</th>
              <th>n</th>
              <th>b1 (slope)</th>
              <th>p</th>
              <th>R&sup2;</th>
            </tr>
          </thead>
          <tbody>
            {reg.sensitivity.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{s.n}</td>
                {s.unavailable ? (
                  <td colSpan={3}>Not available: {s.unavailable}</td>
                ) : (
                  <>
                    <td>{fmtNum(s.slope)}</td>
                    <td>{fmtP(s.p)}</td>
                    <td>{fmtR2(s.r2)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lim-note">
        Excluding a respondent appears only as this labelled check on how much one person&apos;s residual matters;
        it is never applied to the main model.
      </p>
    </>
  );
}

function ScatterTooltip({ active, payload, xLabel }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="lim-tooltip">
      <strong>{p.id}</strong>
      <div>{xLabel}: {fmtNum(p.x, 2)}</div>
      <div>Y (normalized gain): {fmtNum(p.y, 3)}</div>
      {p.influential && <div className="lim-tooltip-flag">Flagged in the sensitivity check</div>}
    </div>
  );
}

function ScatterPlot({ reg }) {
  const spec = buildScatterSpec(reg);
  if (!spec) return null;
  const normal = spec.points.filter((p) => !p.influential);
  const flagged = spec.points.filter((p) => p.influential);
  return (
    <>
      <figure className="lim-scatter" aria-label={`${spec.title}. Fitted line, slope ${fmtNum(spec.fit.slope, 3)}.`}>
        <figcaption>{spec.title}</figcaption>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 26, left: 8 }}>
            <CartesianGrid stroke="#ece8f8" />
            <XAxis
              type="number"
              dataKey="x"
              domain={["auto", "auto"]}
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: spec.xLabel, position: "insideBottom", offset: -14, fontSize: 11 }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={["auto", "auto"]}
              tickFormatter={(v) => v.toFixed(2)}
              label={{ value: spec.yLabel, angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }}
              tick={{ fontSize: 10 }}
            />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip xLabel={spec.xLabel} />} />
            <ReferenceLine segment={spec.line} stroke={BRAND} strokeWidth={2} ifOverflow="extendDomain" />
            <Scatter data={normal} fill={BRAND} fillOpacity={0.55} isAnimationActive={false} />
            {flagged.length > 0 && (
              <Scatter data={flagged} fill={INFLUENTIAL} fillOpacity={0.9} isAnimationActive={false} />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </figure>
      <p className="lim-note">
        The line is the fitted regression, Y = b0 + b1 X. Orange marks the respondent named in the sensitivity check.
      </p>
    </>
  );
}

function InterpretationBlock({ reg }) {
  return (
    <div className="lim-interpretation">
      {reg.interpretation.map((s) => <p key={s}>{s}</p>)}
      {reg.limitations.length > 0 && (
        <ul className="lim-limitations">
          {reg.limitations.map((s) => (
            <li key={s}><LuTriangleAlert size={14} /> <span>{s}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Shown in place of the model when it can't be fitted (too few complete
// respondents, a constant column, ...) -- always with the plain reason.
function Unavailable({ reg }) {
  if (!reg) {
    return (
      <div className="analytics-empty-note">
        The server did not return a regression for this scope (it may be running an older version).
      </div>
    );
  }
  return (
    <div className="analytics-empty-note">
      {reg.reason || "The regression is not available for the current scope."}
      {reg.n_included != null && (
        <> ({reg.n_included} respondent{reg.n_included === 1 ? "" : "s"} with complete data, {reg.n_excluded ?? 0} excluded.)</>
      )}
    </div>
  );
}

/** Dashboard block, placed below "Assessment-Based Learning Measures". */
export function LearningImpactModelSection({ regression }) {
  const [showSensitivity, setShowSensitivity] = useState(false);
  const reg = regression;

  return (
    <div className="lim-section">
      <div className="analytics-section-label">Learning Impact Model (Simple Regression)</div>
      {!reg?.available ? (
        <Unavailable reg={reg} />
      ) : (
        <>
          <div className="lim-toprow">
            <SignificanceBadge model={reg.model} />
            <InclusionNote reg={reg} />
          </div>
          <PhaseLegend phases={reg.phases} />

          <div className="analytics-card-grid lim-cards">
            <div className="analytics-card">
              <div className="analytics-card-body">
                <span className="analytics-card-value">R&sup2; = {fmtR2(reg.correlation.r2)}</span>
                <span className="analytics-card-label">
                  b1 = {fmtNum(reg.model.b1)} &middot; r = {fmtR2(reg.correlation.r)} &middot; t({reg.model.df}) = {fmtNum(reg.model.t, 2)}, p = {fmtP(reg.model.p)}
                </span>
              </div>
            </div>
            <LiiCard lii={reg.lii} />
          </div>

          <div className="analytics-section-label">Regression (Y = normalized gain, X = System Interaction)</div>
          <ModelTable reg={reg} />

          <InterpretationBlock reg={reg} />

          <button
            type="button"
            className="lim-toggle"
            aria-expanded={showSensitivity}
            onClick={() => setShowSensitivity((v) => !v)}
          >
            {showSensitivity ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
            Sensitivity check
          </button>
          {showSensitivity && (
            <div className="lim-collapsible">
              <SensitivityBody reg={reg} />
            </div>
          )}

          <ScatterPlot reg={reg} />
        </>
      )}
    </div>
  );
}

/** Numbered section for the on-screen "Full Learning Impact Report" modal. */
export function LearningImpactModelReportSection({ regression, sectionNumber = 6 }) {
  const reg = regression;
  return (
    <section className="full-report-section">
      <h2>{sectionNumber}. Learning Impact Model (Simple Regression)</h2>
      {!reg?.available ? (
        <Unavailable reg={reg} />
      ) : (
        <>
          <p>
            Phases: 1 = pre-test; 2 = in-app interaction (the treatment, not scored); 3 = in-app performance
            (TSR, AES, ROG); 4 = post-test. Each respondent contributes one row (per-student means). X (the
            independent variable) is {reg.method.x_definition}. Y (the dependent variable) is {reg.method.y_definition}.
            The model is {reg.method.model_equation}, fit with the elementary running-sums formula so it can be
            checked by hand.
          </p>
          <div className="lim-toprow">
            <SignificanceBadge model={reg.model} />
            <InclusionNote reg={reg} />
          </div>

          <h3 className="lim-h3">Regression</h3>
          <ModelTable reg={reg} />

          <h3 className="lim-h3">Sensitivity check</h3>
          <SensitivityBody reg={reg} />

          <h3 className="lim-h3">Interpretation</h3>
          <InterpretationBlock reg={reg} />

          <h3 className="lim-h3">Learning Impact Index (descriptive)</h3>
          <div className="analytics-card-grid lim-cards">
            <LiiCard lii={reg.lii} />
          </div>

          <ScatterPlot reg={reg} />

          <h3 className="lim-h3">Appendix: per-respondent data (anonymized by row order)</h3>
          <div className="user-report-table-wrapper">
            <table className="full-report-table wide lim-table lim-appendix">
              <thead>
                <tr>
                  <th>ID</th><th>Pre</th><th>Post</th><th>TSR</th><th>AES</th><th>ROG</th>
                  <th>z TSR</th><th>z AES</th><th>z ROG</th>
                  <th>X</th><th>Y</th><th>Fitted</th><th>Resid.</th>
                </tr>
              </thead>
              <tbody>
                {reg.respondents.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{fmtNum(r.pre, 1)}</td><td>{fmtNum(r.post, 1)}</td>
                    <td>{fmtNum(r.tsr, 1)}</td><td>{fmtNum(r.aes, 1)}</td><td>{fmtNum(r.rog, 1)}</td>
                    <td>{fmtNum(r.z_tsr, 2)}</td><td>{fmtNum(r.z_aes, 2)}</td><td>{fmtNum(r.z_rog, 2)}</td>
                    <td>{fmtNum(r.x, 2)}</td>
                    <td>{r.y == null ? "n/a" : fmtNum(r.y, 3)}</td>
                    <td>{r.fitted == null ? "n/a" : fmtNum(r.fitted, 3)}</td>
                    <td>{r.residual == null ? "n/a" : fmtNum(r.residual, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
