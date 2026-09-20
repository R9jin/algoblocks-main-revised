// frontend/src/components/LearningImpactModel.jsx
//
// "Learning Impact Model (Phased Regression)" for the admin analytics page.
// Two entry points share one body so the dashboard, the on-screen Full Report
// and the PDF/Excel exports can never drift apart:
//   <LearningImpactModelSection />        -- dashboard block
//   <LearningImpactModelReportSection />  -- numbered section in the report modal
//
// Everything shown comes from `overview.regression` (computed once on the
// server in api/services/regression_service.py, after the same respondent
// scoping as the rest of the dashboard). This component never re-fits the model
// and has no controls that change which respondents are in it: a
// non-significant result is shown as non-significant.

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
  buildScatterSpecs,
  fmtCi,
  fmtF,
  fmtNum,
  fmtP,
  fmtR2,
  isModelSignificant,
} from "../utils/regressionReport";

const BRAND = "#5A1398";
const INFLUENTIAL = "#ea580c";

const PREDICTOR_LABELS = {
  intercept: "Intercept",
  z_Pre: "Pre-test (z)",
  P3: "Phase 3 composite (P3)",
};

function PhaseLegend() {
  const phases = [
    ["1", "Pre-test"],
    ["2", "In-app interaction"],
    ["3", "TSR / AES / ROG"],
    ["4", "Post-test"],
  ];
  return (
    <ol className="lim-phases" aria-label="Study phases">
      {phases.map(([n, label]) => (
        <li key={n} className={`lim-phase${n === "3" ? " is-modelled" : ""}`}>
          <span className="lim-phase-num">{n}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

// Green only when the overall model test is significant at .05; otherwise a
// neutral gray that says so. Deliberately no amber/red "almost" styling.
function SignificanceBadge({ model }) {
  const sig = isModelSignificant(model);
  return (
    <span className={`lim-badge ${sig ? "is-significant" : "is-neutral"}`}>
      {sig ? "Statistically significant (p < .05)" : "Not statistically significant"}
      <span className="lim-badge-detail"> &middot; model p {fmtP(model.p)}</span>
    </span>
  );
}

function InclusionNote({ reg }) {
  return (
    <div className="lim-inclusion">
      <strong>n = {reg.n_included}</strong> included &middot; {reg.n_excluded} excluded
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

function CoefficientTable({ model }) {
  return (
    <div className="user-report-table-wrapper">
      <table className="full-report-table wide lim-table">
        <thead>
          <tr>
            <th>Predictor</th>
            <th>&beta;</th>
            <th>SE</th>
            <th>t</th>
            <th>p</th>
            <th>95% CI</th>
          </tr>
        </thead>
        <tbody>
          {model.coefficients.map((c) => (
            <tr key={c.name}>
              <td>{PREDICTOR_LABELS[c.name] || c.name}</td>
              <td>{fmtNum(c.beta)}</td>
              <td>{fmtNum(c.se)}</td>
              <td>{fmtNum(c.t, 2)}</td>
              <td>{fmtP(c.p)}</td>
              <td>{fmtCi(c.ci_low, c.ci_high)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelComparisonTable({ reg }) {
  const { model1: m1, model2: m2 } = reg.models;
  const ch = reg.change;
  return (
    <div className="user-report-table-wrapper">
      <table className="full-report-table wide lim-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>R&sup2;</th>
            <th>Adj. R&sup2;</th>
            <th>F (df)</th>
            <th>p</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1: Pre-test</td>
            <td>{fmtR2(m1.r2)}</td>
            <td>{fmtR2(m1.adj_r2)}</td>
            <td>{fmtF(m1.f, m1.df1, m1.df2)}</td>
            <td>{fmtP(m1.p)}</td>
          </tr>
          <tr>
            <td>2: Pre-test + Phase 3 (P3)</td>
            <td>{fmtR2(m2.r2)}</td>
            <td>{fmtR2(m2.adj_r2)}</td>
            <td>{fmtF(m2.f, m2.df1, m2.df2)}</td>
            <td>{fmtP(m2.p)}</td>
          </tr>
          <tr className="lim-change-row">
            <td>Change from adding Phase 3</td>
            <td>&Delta;R&sup2; = {fmtR2(ch.delta_r2)}</td>
            <td />
            <td>F-change({ch.df1}, {ch.df2}) = {fmtNum(ch.f_change, 2)}</td>
            <td>{fmtP(ch.p)}</td>
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

function DiagnosticsBody({ reg }) {
  const dg = reg.diagnostics;
  return (
    <>
      <div className="user-report-table-wrapper">
        <table className="full-report-table lim-kv-table">
          <tbody>
            <tr><th>VIF (pre-test, P3)</th><td>{fmtNum(dg.vif.pre, 2)}, {fmtNum(dg.vif.p3, 2)}</td></tr>
            <tr>
              <th>Residual normality (Jarque-Bera)</th>
              <td>JB = {fmtNum(dg.jarque_bera.jb, 1)}, p {fmtP(dg.jarque_bera.p).startsWith("<") ? fmtP(dg.jarque_bera.p) : `= ${fmtP(dg.jarque_bera.p)}`}</td>
            </tr>
            <tr>
              <th>Most influential respondent (Cook&apos;s D)</th>
              <td>{dg.cooks_distance.max_id}: D = {fmtNum(dg.cooks_distance.max)} (cutoff 4/n = {fmtNum(dg.cooks_distance.cutoff)})</td>
            </tr>
            <tr>
              <th>Respondents above the cutoff</th>
              <td>{dg.cooks_distance.flagged_ids?.length ? dg.cooks_distance.flagged_ids.join(", ") : "none"}</td>
            </tr>
            <tr><th>Max |standardized residual|</th><td>{fmtNum(dg.max_abs_std_residual, 2)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="analytics-section-label">Sensitivity of the Phase 3 effect</div>
      <div className="user-report-table-wrapper">
        <table className="full-report-table wide lim-table">
          <thead>
            <tr>
              <th>Specification</th>
              <th>n</th>
              <th>&beta; (P3)</th>
              <th>p (P3)</th>
              <th>R&sup2;</th>
              <th>p (model)</th>
            </tr>
          </thead>
          <tbody>
            {reg.sensitivity.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{s.n}</td>
                {s.unavailable ? (
                  <td colSpan={4}>Not available: {s.unavailable}</td>
                ) : (
                  <>
                    <td>{fmtNum(s.beta_p3)}</td>
                    <td>{fmtP(s.p_p3)}</td>
                    <td>{fmtR2(s.r2)}</td>
                    <td>{fmtP(s.model_p)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lim-note">
        Excluding a respondent appears only as this labelled check on how much one person matters; it is never applied to the main model.
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
      <div>Post-test (z): {fmtNum(p.y, 2)}</div>
      {p.influential && <div className="lim-tooltip-flag">Above Cook&apos;s D cutoff</div>}
    </div>
  );
}

function ScatterPair({ reg }) {
  const specs = buildScatterSpecs(reg);
  if (specs.length === 0) return null;
  return (
    <>
      <div className="lim-scatter-grid">
        {specs.map((spec) => {
          const normal = spec.points.filter((p) => !p.influential);
          const flagged = spec.points.filter((p) => p.influential);
          return (
            <figure
              key={spec.key}
              className="lim-scatter"
              aria-label={`${spec.title}. Simple least-squares line, slope ${fmtNum(spec.fit.slope, 3)}.`}
            >
              <figcaption>{spec.title}</figcaption>
              <ResponsiveContainer width="100%" height={260}>
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
                    tickFormatter={(v) => v.toFixed(1)}
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
          );
        })}
      </div>
      <p className="lim-note">
        Z-scores. The line is the simple least-squares fit for each plot on its own, not the two-predictor model.
        Orange points exceed the Cook&apos;s D cutoff.
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
      {reg.reason || "The phased regression is not available for the current scope."}
      {reg.n_included != null && (
        <> ({reg.n_included} respondent{reg.n_included === 1 ? "" : "s"} with complete data, {reg.n_excluded ?? 0} excluded.)</>
      )}
    </div>
  );
}

/** Dashboard block, placed below "Assessment-Based Learning Measures". */
export function LearningImpactModelSection({ regression }) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const reg = regression;

  return (
    <div className="lim-section">
      <div className="analytics-section-label">Learning Impact Model (Phased Regression)</div>
      {!reg?.available ? (
        <Unavailable reg={reg} />
      ) : (
        <>
          <div className="lim-toprow">
            <SignificanceBadge model={reg.models.model2} />
            <InclusionNote reg={reg} />
          </div>
          <PhaseLegend />

          <div className="analytics-card-grid lim-cards">
            <div className="analytics-card">
              <div className="analytics-card-body">
                <span className="analytics-card-value">R&sup2; = {fmtR2(reg.models.model2.r2)}</span>
                <span className="analytics-card-label">
                  Model 2 &middot; adjusted R&sup2; = {fmtR2(reg.models.model2.adj_r2)} &middot; {fmtF(reg.models.model2.f, reg.models.model2.df1, reg.models.model2.df2)}, p = {fmtP(reg.models.model2.p)}
                </span>
              </div>
            </div>
            <LiiCard lii={reg.lii} />
          </div>

          <div className="analytics-section-label">Model 2 coefficients (z_Post ~ z_Pre + P3)</div>
          <CoefficientTable model={reg.models.model2} />

          <div className="analytics-section-label">Model 1 vs Model 2</div>
          <ModelComparisonTable reg={reg} />

          <InterpretationBlock reg={reg} />

          <button
            type="button"
            className="lim-toggle"
            aria-expanded={showDiagnostics}
            onClick={() => setShowDiagnostics((v) => !v)}
          >
            {showDiagnostics ? <LuChevronUp size={16} /> : <LuChevronDown size={16} />}
            Diagnostics &amp; sensitivity
          </button>
          {showDiagnostics && (
            <div className="lim-collapsible">
              <DiagnosticsBody reg={reg} />
            </div>
          )}

          <ScatterPair reg={reg} />
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
      <h2>{sectionNumber}. Learning Impact Model (Phased Regression)</h2>
      {!reg?.available ? (
        <Unavailable reg={reg} />
      ) : (
        <>
          <p>
            Phases: 1 = pre-test; 2 = in-app interaction (the treatment, not scored); 3 = in-app performance
            (TSR, AES, ROG); 4 = post-test. Each respondent contributes one row (per-student means). TSR, AES, ROG,
            pre-test and post-test are converted to z-scores using the sample standard deviation (n &minus; 1). The
            Phase 3 composite is {reg.method.p3_definition}. The phased model is {reg.method.model_equation};
            Model 1 contains the pre-test only, Model 2 adds P3.
          </p>
          <div className="lim-toprow">
            <SignificanceBadge model={reg.models.model2} />
            <InclusionNote reg={reg} />
          </div>

          <h3 className="lim-h3">Model 2 coefficients</h3>
          <CoefficientTable model={reg.models.model2} />

          <h3 className="lim-h3">Model 1 vs Model 2</h3>
          <ModelComparisonTable reg={reg} />

          <h3 className="lim-h3">Diagnostics &amp; sensitivity</h3>
          <DiagnosticsBody reg={reg} />

          <h3 className="lim-h3">Interpretation</h3>
          <InterpretationBlock reg={reg} />

          <h3 className="lim-h3">Learning Impact Index (descriptive)</h3>
          <div className="analytics-card-grid lim-cards">
            <LiiCard lii={reg.lii} />
          </div>

          <ScatterPair reg={reg} />

          <h3 className="lim-h3">Appendix: per-respondent data (anonymized by row order)</h3>
          <div className="user-report-table-wrapper">
            <table className="full-report-table wide lim-table lim-appendix">
              <thead>
                <tr>
                  <th>ID</th><th>Pre</th><th>Post</th><th>TSR</th><th>AES</th><th>ROG</th>
                  <th>z Pre</th><th>z Post</th><th>z TSR</th><th>z AES</th><th>z ROG</th>
                  <th>P3</th><th>Fitted</th><th>Resid.</th>
                </tr>
              </thead>
              <tbody>
                {reg.respondents.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{fmtNum(r.pre, 1)}</td><td>{fmtNum(r.post, 1)}</td>
                    <td>{fmtNum(r.tsr, 1)}</td><td>{fmtNum(r.aes, 1)}</td><td>{fmtNum(r.rog, 1)}</td>
                    <td>{fmtNum(r.z_pre, 2)}</td><td>{fmtNum(r.z_post, 2)}</td>
                    <td>{fmtNum(r.z_tsr, 2)}</td><td>{fmtNum(r.z_aes, 2)}</td><td>{fmtNum(r.z_rog, 2)}</td>
                    <td>{fmtNum(r.p3, 2)}</td><td>{fmtNum(r.fitted, 2)}</td><td>{fmtNum(r.residual, 2)}</td>
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
