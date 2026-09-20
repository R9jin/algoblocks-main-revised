// frontend/src/utils/regressionReport.js
//
// Everything the "Learning Impact Model (Phased Regression)" needs on the
// client, kept out of AdminUserManagement.jsx so that file only gains a few
// call sites:
//   - number formatting shared by the dashboard, the on-screen report, the PDF
//     and the Excel export (so all four always print the same digits)
//   - scatter-plot data + an offscreen canvas renderer (the PDF must not
//     depend on the on-screen Recharts chart being mounted)
//   - drawRegressionPdfSection(): the jsPDF/autoTable section
//   - addRegressionSheets(): the "Regression Data" / "Regression Summary" sheets
//
// All statistics come from the backend's `overview.regression` payload
// (api/services/regression_service.py). Nothing here re-fits or "improves" the
// model: the only maths done client-side is drawing a simple least-squares line
// through the plotted points, and the Excel formulas that let a reader
// recompute the same numbers.

import { addTableSheet, addKeyValueSheet, colLetter } from "./excelReport";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const fmtNum = (v, digits = 3) =>
  v == null || !Number.isFinite(v) ? "--" : v.toFixed(digits);

/** APA-style p-value: "< .001" or ".348" (no leading zero). */
export const fmtP = (p) => {
  if (p == null || !Number.isFinite(p)) return "--";
  if (p < 0.001) return "< .001";
  return p.toFixed(3).replace(/^0/, "");
};

/** APA-style statistic bounded by 1 (R², adjusted R²): ".075", "-.023". */
export const fmtR2 = (v) => {
  if (v == null || !Number.isFinite(v)) return "--";
  const s = v.toFixed(3);
  return Math.abs(v) < 1 ? s.replace("0.", ".") : s;
};

export const fmtCi = (lo, hi) => `[${fmtNum(lo)}, ${fmtNum(hi)}]`;

export const fmtF = (f, df1, df2) => `F(${df1}, ${df2}) = ${fmtNum(f, 2)}`;

/** True only when the model's overall F test is significant at alpha = .05. */
export const isModelSignificant = (model) =>
  Boolean(model && model.p != null && model.p < 0.05);

// jsPDF's built-in Helvetica is WinAnsi-only: Greek letters and a few
// math symbols come out as garbage, and the superscript 2 / multiplication
// sign were observed to render blank. The backend's interpretation strings
// use them (beta, R\u00b2, TSR \u00d7 Efficiency), so map to plain ASCII first.
export const pdfSafe = (text) =>
  String(text ?? "")
    .replace(/\u03b2/g, "beta")
    .replace(/\u00b2/g, "2")
    .replace(/\u00d7/g, "x")
    .replace(/\u0394/g, "Delta ")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->");

// ---------------------------------------------------------------------------
// Scatter plots: Post vs Pre and Post vs P3 (z-scored, the model's own scale)
// ---------------------------------------------------------------------------

/** Simple least-squares line y = intercept + slope * x through the points. */
export function simpleFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/**
 * Builds the two scatter specs. Respondents whose Cook's D exceeds the
 * backend's 4/n cutoff are tagged `influential` so they are visibly marked --
 * hiding them would misrepresent the fit.
 */
export function buildScatterSpecs(reg) {
  if (!reg?.available || !reg.respondents?.length) return [];
  const flagged = new Set(reg.diagnostics?.cooks_distance?.flagged_ids || []);
  const make = (key, xKey, title, xLabel) => {
    const points = reg.respondents.map((r) => ({
      id: r.id,
      x: r[xKey],
      y: r.z_post,
      influential: flagged.has(r.id),
    }));
    const fit = simpleFit(points.map((p) => p.x), points.map((p) => p.y));
    const xs = points.map((p) => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    return {
      key,
      title,
      xLabel,
      yLabel: "Post-test (z)",
      points,
      fit,
      line: [
        { x: xMin, y: fit.intercept + fit.slope * xMin },
        { x: xMax, y: fit.intercept + fit.slope * xMax },
      ],
    };
  };
  return [
    make("pre", "z_pre", "Post-test vs Pre-test", "Pre-test (z)"),
    make("p3", "p3", "Post-test vs Phase 3 composite (P3)", "P3 composite (z)"),
  ];
}

function niceTicks(min, max, target = 6) {
  const span = max - min || 1;
  const rough = span / target;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Math.abs(t) < 1e-9 ? 0 : t);
  }
  return { ticks, step };
}

/**
 * Draws one scatter + regression line on an offscreen canvas and returns a
 * PNG data URL. Uses only the 2D canvas API (no DOM chart), so it works while
 * the dashboard chart is unmounted or the report modal is closed.
 */
export function renderScatterPng(spec, { width = 520, height = 360, scale = 2 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const pad = { left: 56, right: 18, top: 34, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const xr = (Math.max(...xs) - Math.min(...xs)) || 1;
  const yr = (Math.max(...ys) - Math.min(...ys)) || 1;
  const xMin = Math.min(...xs) - xr * 0.06;
  const xMax = Math.max(...xs) + xr * 0.06;
  const yMin = Math.min(...ys) - yr * 0.06;
  const yMax = Math.max(...ys) + yr * 0.06;
  const sx = (v) => pad.left + ((v - xMin) / (xMax - xMin)) * plotW;
  const sy = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // grid + ticks
  ctx.font = "10px Helvetica, Arial, sans-serif";
  ctx.lineWidth = 1;
  const xt = niceTicks(xMin, xMax);
  const yt = niceTicks(yMin, yMax);
  ctx.strokeStyle = "#ece8f8";
  ctx.fillStyle = "#5b5675";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  xt.ticks.forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(sx(t), pad.top);
    ctx.lineTo(sx(t), pad.top + plotH);
    ctx.stroke();
    ctx.fillText(t.toFixed(xt.step < 1 ? 1 : 0), sx(t), pad.top + plotH + 5);
  });
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  yt.ticks.forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(pad.left, sy(t));
    ctx.lineTo(pad.left + plotW, sy(t));
    ctx.stroke();
    ctx.fillText(t.toFixed(yt.step < 1 ? 1 : 0), pad.left - 6, sy(t));
  });

  // frame
  ctx.strokeStyle = "#b8b0d4";
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);

  // clip so the regression line never spills outside the plot frame
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();

  ctx.strokeStyle = "#5A1398";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx(spec.line[0].x), sy(spec.line[0].y));
  ctx.lineTo(sx(spec.line[1].x), sy(spec.line[1].y));
  ctx.stroke();

  spec.points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), p.influential ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = p.influential ? "rgba(234,88,12,0.85)" : "rgba(90,19,152,0.55)";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.restore();

  // titles
  ctx.fillStyle = "#241b52";
  ctx.font = "bold 12px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(spec.title, pad.left, 10);

  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#3a3450";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(spec.xLabel, pad.left + plotW / 2, height - 10);
  ctx.save();
  ctx.translate(14, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(spec.yLabel, 0, 0);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Appends the regression section to an in-progress jsPDF report.
 *
 * `ctx` is the handful of helpers handleDownloadPdf already owns (kept as-is
 * so the existing layout code is not duplicated): doc, autoTable, marginX,
 * pageWidth, brandColor, ensureRoom, addHeading, addParagraph, and getY/setY
 * because that handler tracks its cursor in a closure variable.
 */
export function drawRegressionPdfSection(ctx, reg, sectionNumber = 6) {
  const { doc, autoTable, marginX, pageWidth, brandColor, ensureRoom, addHeading, addParagraph, getY, setY } = ctx;
  const title = `${sectionNumber}. Learning Impact Model (Phased Regression)`;
  const advance = () => setY(doc.lastAutoTable.finalY + 20);

  const addSubheading = (text) => {
    ensureRoom(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(60, 40, 110);
    doc.text(text, marginX, getY());
    setY(getY() + 14);
    doc.setTextColor(20, 20, 20);
  };

  const table = (head, body, opts = {}) => {
    autoTable(doc, {
      startY: getY(),
      margin: { left: marginX, right: marginX },
      theme: "grid",
      styles: { fontSize: opts.fontSize || 9, cellPadding: opts.cellPadding ?? 5 },
      headStyles: { fillColor: brandColor },
      columnStyles: opts.columnStyles,
      head: head ? [head] : undefined,
      body,
    });
    advance();
  };

  addHeading(title);

  if (!reg) {
    addParagraph("The regression was not included in this report's data (the server did not return one).");
    return;
  }
  if (!reg.available) {
    addParagraph(pdfSafe(reg.reason || "The regression is not available for the current scope."));
    if (reg.n_included != null) {
      addParagraph(`Respondents with complete data: ${reg.n_included}; excluded: ${reg.n_excluded ?? 0}.`);
    }
    return;
  }

  const { models, change, diagnostics: dg, sensitivity, lii, method } = reg;
  const m1 = models.model1;
  const m2 = models.model2;

  // -- method ---------------------------------------------------------------
  addParagraph(
    "Phases: 1 = pre-test; 2 = in-app interaction (the treatment, not scored); 3 = in-app performance " +
    "(TSR, AES, ROG); 4 = post-test. Each respondent contributes one row (per-student means). TSR, AES, ROG, " +
    "pre-test and post-test are converted to z-scores using the sample standard deviation (n - 1). The Phase 3 " +
    `composite is ${method.p3_definition} (the mean of the three z-scores, standardized again). ` +
    `The phased model is ${method.model_equation}; Model 1 contains the pre-test only, Model 2 adds P3.`
  );

  // -- inclusion ------------------------------------------------------------
  const inclusionRows = [
    ["Respondents included in the model", String(reg.n_included)],
    ["Respondents excluded (listwise, nothing imputed)", String(reg.n_excluded)],
  ];
  (reg.excluded_reasons || []).forEach((r) => inclusionRows.push([`  - ${pdfSafe(r.reason)}`, String(r.count)]));
  table(null, inclusionRows, { columnStyles: { 0: { fontStyle: "bold", cellWidth: 300 } } });

  // -- Model 2 coefficients -----------------------------------------------------
  addSubheading("Model 2 coefficients (z_Post ~ z_Pre + P3)");
  table(
    ["Predictor", "Beta", "SE", "t", "p", "95% CI"],
    m2.coefficients.map((c) => [
      c.name === "intercept" ? "Intercept" : c.name === "z_Pre" ? "Pre-test (z)" : "Phase 3 composite (P3)",
      fmtNum(c.beta),
      fmtNum(c.se),
      fmtNum(c.t, 2),
      fmtP(c.p),
      fmtCi(c.ci_low, c.ci_high),
    ])
  );

  // -- Model 1 vs 2 ---------------------------------------------------------------
  addSubheading("Model 1 vs Model 2");
  table(
    ["Model", "R2", "Adj. R2", "F (df)", "p (model)"],
    [
      ["1: Pre-test", fmtR2(m1.r2), fmtR2(m1.adj_r2), fmtF(m1.f, m1.df1, m1.df2), fmtP(m1.p)],
      ["2: Pre-test + P3", fmtR2(m2.r2), fmtR2(m2.adj_r2), fmtF(m2.f, m2.df1, m2.df2), fmtP(m2.p)],
      [
        "Change (adding Phase 3)",
        `Delta R2 = ${fmtR2(change.delta_r2)}`,
        "",
        `F-change(${change.df1}, ${change.df2}) = ${fmtNum(change.f_change, 2)}`,
        fmtP(change.p),
      ],
    ]
  );

  // -- diagnostics + sensitivity ----------------------------------------------------
  addSubheading("Diagnostics");
  table(null, [
    ["VIF (pre-test, P3)", `${fmtNum(dg.vif.pre, 2)}, ${fmtNum(dg.vif.p3, 2)}`],
    ["Residual normality (Jarque-Bera)", `JB = ${fmtNum(dg.jarque_bera.jb, 1)}, p ${fmtP(dg.jarque_bera.p).startsWith("<") ? fmtP(dg.jarque_bera.p) : `= ${fmtP(dg.jarque_bera.p)}`}`],
    [
      "Most influential respondent (Cook's D)",
      `${dg.cooks_distance.max_id}: D = ${fmtNum(dg.cooks_distance.max)} (cutoff 4/n = ${fmtNum(dg.cooks_distance.cutoff)})`,
    ],
    ["Respondents above the Cook's D cutoff", (dg.cooks_distance.flagged_ids || []).join(", ") || "none"],
    ["Max |standardized residual|", fmtNum(dg.max_abs_std_residual, 2)],
  ], { columnStyles: { 0: { fontStyle: "bold", cellWidth: 240 } } });

  addSubheading("Sensitivity of the Phase 3 effect");
  table(
    ["Specification", "n", "Beta (P3)", "p (P3)", "R2", "p (model)"],
    sensitivity.map((s) =>
      s.unavailable
        ? [pdfSafe(s.label), String(s.n), "n/a", "n/a", "n/a", pdfSafe(s.unavailable)]
        : [pdfSafe(s.label), String(s.n), fmtNum(s.beta_p3), fmtP(s.p_p3), fmtR2(s.r2), fmtP(s.model_p)]
    ),
    { fontSize: 8.5 }
  );
  addParagraph(
    "Case exclusion appears only as the last sensitivity row, as a check on how much one respondent matters. " +
    "It is not applied to the main model."
  );

  // -- interpretation + limitations --------------------------------------------------
  addSubheading("Interpretation");
  (reg.interpretation || []).forEach((s) => addParagraph(pdfSafe(s)));
  if ((reg.limitations || []).length > 0) {
    addSubheading("Limitations");
    reg.limitations.forEach((s) => addParagraph(pdfSafe(s)));
  }

  // -- LII ----------------------------------------------------------------------------
  addSubheading("Learning Impact Index (descriptive)");
  addParagraph(`${pdfSafe(lii.label)}. ${pdfSafe(lii.formula)}.`);
  table(["Mean", "SD", "Min", "Max"], [[fmtNum(lii.mean, 2), fmtNum(lii.sd, 2), fmtNum(lii.min, 1), fmtNum(lii.max, 1)]]);

  // -- scatter plots ---------------------------------------------------------------------
  const specs = buildScatterSpecs(reg);
  if (specs.length > 0) {
    addSubheading("Scatter plots (z-scores; line = simple least-squares fit; orange = above Cook's D cutoff)");
    const gap = 12;
    const imgW = (pageWidth - marginX * 2 - gap) / 2;
    const imgH = imgW * (360 / 520);
    ensureRoom(imgH + 10);
    const top = getY();
    specs.forEach((spec, i) => {
      const png = renderScatterPng(spec);
      // "FAST" makes jsPDF deflate the image stream; uncompressed, the two
      // 2x canvases alone made the PDF ~4.5 MB.
      doc.addImage(png, "PNG", marginX + i * (imgW + gap), top, imgW, imgH, undefined, "FAST");
    });
    setY(top + imgH + 16);
  }

  // -- anonymized appendix ----------------------------------------------------------------
  addSubheading("Appendix: per-respondent data (anonymized by row order)");
  table(
    ["ID", "Pre", "Post", "TSR", "AES", "ROG", "z Pre", "z Post", "z TSR", "z AES", "z ROG", "P3", "Fitted", "Resid."],
    reg.respondents.map((r) => [
      r.id,
      fmtNum(r.pre, 1), fmtNum(r.post, 1), fmtNum(r.tsr, 1), fmtNum(r.aes, 1), fmtNum(r.rog, 1),
      fmtNum(r.z_pre, 2), fmtNum(r.z_post, 2), fmtNum(r.z_tsr, 2), fmtNum(r.z_aes, 2), fmtNum(r.z_rog, 2),
      fmtNum(r.p3, 2), fmtNum(r.fitted, 2), fmtNum(r.residual, 2),
    ]),
    { fontSize: 6.5, cellPadding: 2.5 }
  );
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const DATA_SHEET = "Regression Data";
const SUMMARY_SHEET = "Regression Summary";

/**
 * Adds "Regression Data" and "Regression Summary" (in that order, after any
 * sheets already in the workbook). No names or emails: anonymized IDs only.
 *
 * Data sheet: raw numbers as plain values, then z-scores / P3 / LII as REAL
 * formulas. Summary sheet: every statistic is a formula over the data sheet
 * (LINEST / CORREL / F.DIST.RT / T.DIST.2T), with the server-computed value as
 * the cached result so it shows immediately and is recomputed by Excel.
 * Diagnostics that Excel cannot reproduce with one formula (Jarque-Bera,
 * Cook's D, sensitivity runs) and the interpretation text are static,
 * server-computed cells and are labelled that way.
 *
 * Excel stores post-2007 functions with an `_xlfn.` prefix in the file
 * format; without it Excel shows #NAME? until the cell is re-entered.
 *
 * @param {{ headerColor?: string, cachedResults?: boolean }} [opts]
 *   cachedResults=false omits the cached values (used only to verify that the
 *   formulas alone reproduce the server numbers).
 */
export function addRegressionSheets(workbook, reg, opts = {}) {
  const headerColor = opts.headerColor || "5A1398";
  const withCache = opts.cachedResults !== false;
  // formula cell with a cached server value (or without, when verifying)
  const f = (formula, result, numFmt) => {
    const cell = { formula };
    if (withCache && result !== undefined && result !== null) cell.result = result;
    if (numFmt) cell.numFmt = numFmt;
    return cell;
  };

  if (!reg || !reg.available) {
    addKeyValueSheet(workbook, SUMMARY_SHEET, [
      {
        heading: "Learning Impact Model (Phased Regression)",
        rows: [
          ["Status", "Not available for the current scope"],
          ["Reason", reg?.reason || "The server did not return a regression."],
          ["Respondents with complete data", reg?.n_included ?? 0],
          ["Respondents excluded", reg?.n_excluded ?? 0],
        ],
      },
    ], { headerColor });
    return;
  }

  const rows = reg.respondents;
  const n = rows.length;
  const last = n + 1;

  // ----- Regression Data -----------------------------------------------------
  // Column order matters: z_Pre (L) sits directly beside P3 (M) so LINEST can
  // take them as one contiguous predictor block.
  const COLS = [
    ["id", "ID (anonymized)", 16],
    ["pre", "Pre-test", 11],
    ["post", "Post-test", 11],
    ["tsr", "TSR", 10],
    ["aes", "AES", 10],
    ["rog", "ROG", 10],
    ["zTsr", "z_TSR", 10],
    ["zAes", "z_AES", 10],
    ["zRog", "z_ROG", 10],
    ["zPost", "z_Post", 10],
    ["p3Raw", "P3_raw", 10],
    ["zPre", "z_Pre", 10],
    ["p3", "P3", 10],
    ["lii", "LII", 10],
  ];
  const col = {};
  COLS.forEach(([key], i) => { col[key] = colLetter(i + 1); });
  const abs = (key) => `$${col[key]}$2:$${col[key]}$${last}`;
  const dataRef = (key) => `'${DATA_SHEET}'!${col[key]}2:${col[key]}${last}`;
  const dataAbs = (key) => `'${DATA_SHEET}'!$${col[key]}$2:$${col[key]}$${last}`;
  const z = (key, r) => `STANDARDIZE(${col[key]}${r},AVERAGE(${abs(key)}),_xlfn.STDEV.S(${abs(key)}))`;

  const dataRows = rows.map((r, i) => {
    const rr = i + 2;
    return {
      id: r.id,
      pre: r.pre, post: r.post, tsr: r.tsr, aes: r.aes, rog: r.rog,
      zTsr: f(`STANDARDIZE(D${rr},AVERAGE(${abs("tsr")}),_xlfn.STDEV.S(${abs("tsr")}))`, r.z_tsr),
      zAes: f(`STANDARDIZE(E${rr},AVERAGE(${abs("aes")}),_xlfn.STDEV.S(${abs("aes")}))`, r.z_aes),
      zRog: f(`STANDARDIZE(F${rr},AVERAGE(${abs("rog")}),_xlfn.STDEV.S(${abs("rog")}))`, r.z_rog),
      zPost: f(`STANDARDIZE(C${rr},AVERAGE(${abs("post")}),_xlfn.STDEV.S(${abs("post")}))`, r.z_post),
      p3Raw: f(`AVERAGE(${col.zTsr}${rr}:${col.zRog}${rr})`, r.p3_raw),
      zPre: f(`STANDARDIZE(B${rr},AVERAGE(${abs("pre")}),_xlfn.STDEV.S(${abs("pre")}))`, r.z_pre),
      p3: f(z("p3Raw", rr), r.p3),
      lii: f(`AVERAGE(${col.tsr}${rr}:${col.rog}${rr},${col.post}${rr})`, r.lii),
    };
  });

  addTableSheet(
    workbook,
    DATA_SHEET,
    COLS.map(([key, header, width]) => ({
      header,
      key,
      width,
      numFmt: ["zTsr", "zAes", "zRog", "zPost", "p3Raw", "zPre", "p3"].includes(key) ? "0.000" : key === "lii" ? "0.00" : undefined,
    })),
    dataRows,
    { headerColor }
  );

  // ----- Regression Summary --------------------------------------------------
  const Y = dataAbs("zPost");
  const X2 = `'${DATA_SHEET}'!$${col.zPre}$2:$${col.p3}$${last}`; // z_Pre:P3, adjacent
  const X1 = dataAbs("zPre");
  const lin2 = (r, c) => `INDEX(LINEST(${Y},${X2},TRUE,TRUE),${r},${c})`;
  const lin1 = (r, c) => `INDEX(LINEST(${Y},${X1},TRUE,TRUE),${r},${c})`;
  // LINEST lists coefficients in REVERSE predictor order, then the intercept:
  // model 2 -> [P3, z_Pre, intercept]; model 1 -> [z_Pre, intercept].
  const M2 = { P3: 1, Pre: 2, icpt: 3 };

  const m1 = reg.models.model1;
  const m2 = reg.models.model2;
  const c2 = (name) => m2.coefficients.find((c) => c.name === name);
  const c1 = (name) => m1.coefficients.find((c) => c.name === name);

  const coefRows = (lin, colIdx, coef, label) => {
    const beta = lin(1, colIdx);
    const se = lin(2, colIdx);
    const df = lin(4, 2);
    const t = `${beta}/${se}`;
    return [
      [`${label}: beta`, f(beta, coef.beta, "0.0000")],
      [`${label}: SE`, f(se, coef.se, "0.0000")],
      [`${label}: t`, f(t, coef.t, "0.000")],
      [`${label}: p (two-tailed)`, f(`_xlfn.T.DIST.2T(ABS(${t}),${df})`, coef.p, "0.0000")],
      [`${label}: 95% CI lower`, f(`${beta}-_xlfn.T.INV.2T(0.05,${df})*${se}`, coef.ci_low, "0.0000")],
      [`${label}: 95% CI upper`, f(`${beta}+_xlfn.T.INV.2T(0.05,${df})*${se}`, coef.ci_high, "0.0000")],
    ];
  };
  const fitRows = (lin, model, k) => {
    const r2 = lin(3, 1);
    const df2 = lin(4, 2);
    return [
      ["R2", f(r2, model.r2, "0.0000")],
      ["Adjusted R2", f(`1-(1-${r2})*(COUNT(${Y})-1)/${df2}`, model.adj_r2, "0.0000")],
      ["F", f(lin(4, 1), model.f, "0.000")],
      ["df1", k],
      ["df2", f(df2, model.df2)],
      ["p (model F)", f(`_xlfn.F.DIST.RT(${lin(4, 1)},${k},${df2})`, model.p, "0.0000")],
    ];
  };

  const dR2 = `${lin2(3, 1)}-${lin1(3, 1)}`;
  const fChange = `(${dR2})/1/((1-${lin2(3, 1)})/${lin2(4, 2)})`;
  const dg = reg.diagnostics;
  const jbP = fmtP(dg.jarque_bera.p);
  const staticNote = "static, computed on the server";

  const pair = (a, b) => `CORREL(${dataRef(a)},${dataRef(b)})`;
  const corrLabels = reg.correlations.labels;
  const corrKey = { TSR: "tsr", AES: "aes", ROG: "rog", Pre: "pre", Post: "post", P3: "p3" };

  const sections = [
    {
      heading: "Learning Impact Model (Phased Regression)",
      narrative:
        "Numbers in this sheet are Excel formulas over the 'Regression Data' sheet, so they recompute if the data change. " +
        "Cells marked (static) were computed on the server because Excel has no single formula for them. " +
        "The correlation matrix is to the right (columns D-J).",
      rows: [
        ["Respondents included", f(`COUNT(${dataRef("post")})`, reg.n_included)],
        ["Respondents excluded (static)", reg.n_excluded],
        ...(reg.excluded_reasons || []).map((r) => [`  reason (static): ${r.reason}`, r.count]),
        ["Normalization", reg.method.normalization],
        ["P3 definition", reg.method.p3_definition],
        ["Model equation", reg.method.model_equation],
      ],
    },
    {
      heading: "Model 1: z_Post ~ z_Pre",
      rows: [
        ...coefRows(lin1, 1, c1("z_Pre"), "z_Pre"),
        ...fitRows(lin1, m1, 1),
      ],
    },
    {
      heading: "Model 2: z_Post ~ z_Pre + P3",
      rows: [
        ["Intercept (about 0 for z-scores)", f(lin2(1, M2.icpt), c2("intercept").beta, "0.0000")],
        ...coefRows(lin2, M2.Pre, c2("z_Pre"), "z_Pre"),
        ...coefRows(lin2, M2.P3, c2("P3"), "P3"),
        ...fitRows(lin2, m2, 2),
      ],
    },
    {
      heading: "Model 1 to Model 2 (adding Phase 3)",
      rows: [
        ["Delta R2", f(dR2, reg.change.delta_r2, "0.0000")],
        ["F-change", f(fChange, reg.change.f_change, "0.000")],
        ["df1, df2", `${reg.change.df1}, ${reg.change.df2}`],
        ["p (F-change)", f(`_xlfn.F.DIST.RT(${fChange},1,${lin2(4, 2)})`, reg.change.p, "0.0000")],
      ],
    },
    {
      heading: "Diagnostics",
      rows: [
        ["VIF (pre-test and P3)", f(`1/(1-CORREL(${dataRef("zPre")},${dataRef("p3")})^2)`, dg.vif.pre, "0.000")],
        [`Jarque-Bera (${staticNote})`, `${fmtNum(dg.jarque_bera.jb, 1)}, p ${jbP.startsWith("<") ? jbP : `= ${jbP}`}`],
        [`Max Cook's D (${staticNote})`, `${dg.cooks_distance.max_id}: ${fmtNum(dg.cooks_distance.max, 4)}`],
        ["Cook's D cutoff 4/n", f(`4/COUNT(${dataRef("post")})`, dg.cooks_distance.cutoff, "0.0000")],
        [`Respondents above cutoff (${staticNote})`, (dg.cooks_distance.flagged_ids || []).join(", ") || "none"],
        [`Max |standardized residual| (${staticNote})`, fmtNum(dg.max_abs_std_residual, 3)],
      ],
    },
    {
      heading: `Sensitivity of the Phase 3 effect (${staticNote})`,
      narrative: "Same Model 2 form. Case exclusion is a labelled check only, never applied to the main model.",
      rows: reg.sensitivity.map((s) => [
        `${s.label} (n = ${s.n})`,
        s.unavailable
          ? `not available: ${s.unavailable}`
          : `beta P3 = ${fmtNum(s.beta_p3)}, p = ${fmtP(s.p_p3)}, R2 = ${fmtR2(s.r2)}, model p = ${fmtP(s.model_p)}`,
      ]),
    },
    {
      heading: reg.lii.label,
      narrative: `${reg.lii.formula}. Descriptive only; not a model.`,
      rows: [
        ["LII mean", f(`AVERAGE(${dataRef("lii")})`, reg.lii.mean, "0.00")],
        ["LII SD (sample)", f(`_xlfn.STDEV.S(${dataRef("lii")})`, reg.lii.sd, "0.00")],
        ["LII min", f(`MIN(${dataRef("lii")})`, reg.lii.min, "0.0")],
        ["LII max", f(`MAX(${dataRef("lii")})`, reg.lii.max, "0.0")],
      ],
    },
    { heading: `Interpretation (${staticNote})` },
    ...(reg.interpretation || []).map((s) => ({ narrative: s })),
  ];
  if ((reg.limitations || []).length > 0) {
    sections.push({ heading: `Limitations (${staticNote})` });
    reg.limitations.forEach((s) => sections.push({ narrative: s }));
  }

  const sheet = addKeyValueSheet(workbook, SUMMARY_SHEET, sections, { headerColor });

  // Merged narrative rows don't auto-fit their height in Excel; size them from
  // the text length (the two merged columns are ~120 characters wide).
  // Long labels (sensitivity rows) need more room than addKeyValueSheet's default.
  sheet.getColumn(1).width = 62;
  sheet.getColumn(2).width = 58;
  sheet.eachRow((row) => {
    const v = row.getCell(1).value;
    if (typeof v === "string" && v.length > 60 && row.getCell(1).font?.italic) {
      row.height = 14 * Math.ceil(v.length / 120) + 4;
    }
  });

  // Correlation matrix: CORREL formulas, placed beside the key/value columns.
  const startCol = 4; // D
  sheet.getCell(1, startCol).value = "Pearson correlation matrix (CORREL over 'Regression Data')";
  sheet.getCell(1, startCol).font = { bold: true, size: 12, color: { argb: `FF${headerColor}` } };
  corrLabels.forEach((lab, j) => {
    const cell = sheet.getCell(2, startCol + 1 + j);
    cell.value = lab;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerColor}` } };
    cell.alignment = { horizontal: "center" };
    sheet.getColumn(startCol + 1 + j).width = 9;
  });
  sheet.getColumn(startCol).width = 8;
  corrLabels.forEach((rowLab, i) => {
    const head = sheet.getCell(3 + i, startCol);
    head.value = rowLab;
    head.font = { bold: true };
    corrLabels.forEach((colLab, j) => {
      const cell = sheet.getCell(3 + i, startCol + 1 + j);
      const formula = pair(corrKey[rowLab], corrKey[colLab]);
      cell.value = withCache ? { formula, result: reg.correlations.matrix[i][j] } : { formula };
      cell.numFmt = "0.000";
    });
  });
}
