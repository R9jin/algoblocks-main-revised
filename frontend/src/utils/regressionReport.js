// frontend/src/utils/regressionReport.js
//
// Everything the "Learning Impact Model (Simple Regression)" needs on the
// client, kept out of AdminUserManagement.jsx so that file only gains a few
// call sites:
//   - number formatting shared by the dashboard, the on-screen report, the PDF
//     and the Excel export (so all four always print the same digits)
//   - scatter-plot data + an offscreen canvas renderer (the PDF must not
//     depend on the on-screen Recharts chart being mounted)
//   - drawRegressionPdfSection(): the jsPDF/autoTable section
//   - addRegressionSheets(): the "Regression Data" / "Regression Summary" sheets,
//     plus the scatter plot embedded in the Regression Summary sheet
//
// All statistics come from the backend's `overview.regression` payload
// (api/services/regression_service.py): X = average(z_TSR, z_AES, z_ROG) ---
// the "System Interaction" composite; Y = (Post - Pre) / (100 - Pre) ---
// normalized learning gain; Y = b0 + b1 * X, one predictor, fit by the
// elementary running-sums formula. Nothing here re-fits or "improves" the
// model: the only maths done client-side is drawing the already-fitted line
// through the plotted points, and the Excel formulas that let a reader
// recompute the same numbers.

import { addTableSheet, addKeyValueSheet, colLetter, OPEN_LAST_ROW } from "./excelReport";

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

/** APA-style statistic bounded by 1 (R², r): ".075", "-.023". */
export const fmtR2 = (v) => {
  if (v == null || !Number.isFinite(v)) return "--";
  const s = v.toFixed(3);
  return Math.abs(v) < 1 ? s.replace("0.", ".") : s;
};

export const fmtCi = (lo, hi) => `[${fmtNum(lo)}, ${fmtNum(hi)}]`;

/** True only when the model's slope test is significant at alpha = .05. */
export const isModelSignificant = (model) =>
  Boolean(model && (model.significant === true || (model.p != null && model.p < 0.05)));

// jsPDF's built-in Helvetica is WinAnsi-only: Greek letters and a few
// math symbols come out as garbage, and the superscript 2 / multiplication
// sign were observed to render blank. The backend's interpretation strings
// use them (beta, R\u00b2), so map to plain ASCII first.
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
// Scatter plot: Y (normalized gain) vs X (System Interaction composite)
// ---------------------------------------------------------------------------

/**
 * Builds the single scatter spec for Y vs X, using the already-fitted line
 * from the backend (b0, b1) rather than refitting client-side. Respondents
 * dropped from the regression (perfect 100 pre-test, Y undefined) are left
 * out of the plot entirely -- there is no Y to place them at. The
 * "excl_influential" sensitivity row's respondent is tagged so it renders
 * visibly distinct, since it's the one point a reader is told to check.
 */
export function buildScatterSpec(reg) {
  if (!reg?.available || !reg.respondents?.length) return null;
  const exclRow = (reg.sensitivity || []).find((s) => s.key === "excl_influential");
  const exclMatch = exclRow?.label ? exclRow.label.match(/\(([^)]+)\)$/) : null;
  const flaggedId = exclMatch ? exclMatch[1] : null;

  const points = reg.respondents
    .filter((r) => r.x != null && r.y != null)
    .map((r) => ({ id: r.id, x: r.x, y: r.y, influential: r.id === flaggedId }));
  if (points.length === 0) return null;

  const { b0 = 0, b1 = 0 } = reg.model || {};
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  return {
    key: "x_y",
    title: "Normalized Gain (Y) vs System Interaction (X)",
    xLabel: "X: System Interaction composite (z)",
    yLabel: "Y: Normalized learning gain",
    points,
    fit: { slope: b1, intercept: b0 },
    line: [
      { x: xMin, y: b0 + b1 * xMin },
      { x: xMax, y: b0 + b1 * xMax },
    ],
  };
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
 * Draws the scatter + regression line on an offscreen canvas and returns a
 * PNG data URL. Uses only the 2D canvas API (no DOM chart), so it works while
 * the dashboard chart is unmounted or the report modal is closed.
 */
export function renderScatterPng(
  spec,
  { width = 560, height = 380, scale = 2, lineWidth = 2, pointColor, pointRadius = 4 } = {}
) {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const pad = { left: 60, right: 18, top: 34, bottom: 48 };
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
    ctx.fillText(t.toFixed(yt.step < 1 ? 1 : 2), pad.left - 6, sy(t));
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
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(sx(spec.line[0].x), sy(spec.line[0].y));
  ctx.lineTo(sx(spec.line[1].x), sy(spec.line[1].y));
  ctx.stroke();

  spec.points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), p.influential ? pointRadius + 1 : pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = pointColor || (p.influential ? "rgba(234,88,12,0.85)" : "rgba(90,19,152,0.55)");
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
  ctx.translate(16, pad.top + plotH / 2);
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
  const title = `${sectionNumber}. Learning Impact Model (Simple Regression)`;
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

  const { model, correlation, sensitivity, method } = reg;

  // -- method ---------------------------------------------------------------
  addParagraph(
    "Phases: 1 = pre-test; 2 = in-app interaction (the treatment, not scored); 3 = in-app performance " +
    "(TSR, AES, ROG); 4 = post-test. Each respondent contributes one row (per-student means). " +
    `X is the independent variable: ${pdfSafe(method.x_definition)}. ` +
    `Y is the dependent variable: ${pdfSafe(method.y_definition)}. ` +
    `The model is ${method.model_equation}, fit with the elementary running-sums formula.`
  );

  // -- inclusion ------------------------------------------------------------
  const inclusionRows = [
    ["Respondents with complete pre/post/TSR/AES/ROG", String(reg.n_included)],
    ["Respondents excluded (listwise, nothing imputed)", String(reg.n_excluded)],
  ];
  (reg.excluded_reasons || []).forEach((r) => inclusionRows.push([`  - ${pdfSafe(r.reason)}`, String(r.count)]));
  if (reg.n_dropped_for_regression > 0) {
    inclusionRows.push([
      "  - dropped from the regression only (perfect pre-test, Y undefined)",
      String(reg.n_dropped_for_regression),
    ]);
  }
  inclusionRows.push(["Respondents in the fitted regression", String(reg.n_regression)]);
  table(null, inclusionRows, { columnStyles: { 0: { fontStyle: "bold", cellWidth: 320 } } });

  // -- model ------------------------------------------------------------------
  addSubheading("Regression: Y = b0 + b1 X");
  table(
    ["b0 (intercept)", "b1 (slope)", "SE(b1)", "t", "p", "95% CI (b1)", "r", "R2"],
    [[
      fmtNum(model.b0), fmtNum(model.b1), fmtNum(model.se_b1), fmtNum(model.t, 2), fmtP(model.p),
      fmtCi(model.ci_low, model.ci_high), fmtNum(correlation.r), fmtR2(correlation.r2),
    ]]
  );

  // -- sensitivity ----------------------------------------------------------------
  addSubheading("Sensitivity check");
  table(
    ["Specification", "n", "b1 (slope)", "p", "R2"],
    sensitivity.map((s) =>
      s.unavailable
        ? [pdfSafe(s.label), String(s.n), "n/a", "n/a", pdfSafe(s.unavailable)]
        : [pdfSafe(s.label), String(s.n), fmtNum(s.slope), fmtP(s.p), fmtR2(s.r2)]
    )
  );
  addParagraph(
    "Case exclusion appears only as the second sensitivity row, as a check on how much one respondent's residual " +
    "matters. It is not applied to the main model."
  );

  // -- interpretation + limitations --------------------------------------------------
  addSubheading("Interpretation");
  (reg.interpretation || []).forEach((s) => addParagraph(pdfSafe(s)));
  if ((reg.limitations || []).length > 0) {
    addSubheading("Limitations");
    reg.limitations.forEach((s) => addParagraph(pdfSafe(s)));
  }

  // -- scatter plot ---------------------------------------------------------------------
  const spec = buildScatterSpec(reg);
  if (spec) {
    addSubheading("Scatter plot (line = fitted regression; orange = flagged in the sensitivity check)");
    const imgW = Math.min(pageWidth - marginX * 2, 420);
    const imgH = imgW * (380 / 560);
    ensureRoom(imgH + 10);
    const top = getY();
    const png = renderScatterPng(spec);
    // "FAST" makes jsPDF deflate the image stream.
    doc.addImage(png, "PNG", marginX, top, imgW, imgH, undefined, "FAST");
    setY(top + imgH + 16);
  }

  // -- anonymized appendix ----------------------------------------------------------------
  addSubheading("Appendix: per-respondent data (anonymized by row order)");
  table(
    ["ID", "Pre", "Post", "TSR", "AES", "ROG", "z TSR", "z AES", "z ROG", "X", "Y", "Fitted", "Resid."],
    reg.respondents.map((r) => [
      r.id,
      fmtNum(r.pre, 1), fmtNum(r.post, 1), fmtNum(r.tsr, 1), fmtNum(r.aes, 1), fmtNum(r.rog, 1),
      fmtNum(r.z_tsr, 2), fmtNum(r.z_aes, 2), fmtNum(r.z_rog, 2),
      fmtNum(r.x, 2), r.y == null ? "n/a" : fmtNum(r.y, 3),
      r.fitted == null ? "n/a" : fmtNum(r.fitted, 3), r.residual == null ? "n/a" : fmtNum(r.residual, 3),
    ]),
    { fontSize: 6.5, cellPadding: 2.5 }
  );
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const DATA_SHEET = "Regression Data";
const SUMMARY_SHEET = "Regression Summary";

const PLOT_SHEET = "Regression Plot";

/** Plain sensitivity row label with no parenthetical, e.g. "Main model excluding S04". */
function sensitivityLabel(s) {
  if (s.key === "main") return "Main model";
  const id = s.label?.match(/\(([^)]+)\)$/)?.[1];
  if (s.key === "excl_influential" && id) return `Main model excluding ${id}`;
  return String(s.label ?? "").replace(/\s*\(([^)]*)\)/g, ", $1");
}

/**
 * Adds a "Regression Plot" sheet holding the scatter plot of the fitted
 * regression: one dot per respondent plus the fitted line. Axis labels are
 * deliberately just "System Interaction" (X) and "Learning Gain" (Y).
 *
 * ExcelJS cannot author native Excel charts, so the plot is drawn on an
 * offscreen canvas (the same renderer the PDF uses) and embedded as a PNG.
 * It shows the numbers as of export time; the statistics on the Summary sheet
 * remain live formulas. Skipped (silently) where no canvas exists.
 */
function addRegressionPlotSheet(workbook, reg) {
  const spec = buildScatterSpec(reg);
  if (!spec || typeof document === "undefined") return;

  const width = 760;
  const height = 460;
  const png = renderScatterPng(
    {
      ...spec,
      title: "Learning Gain vs System Interaction",
      xLabel: "System Interaction",
      yLabel: "Learning Gain",
      // one plain series: the PDF's orange "flagged" respondent needs a
      // legend, which this sheet does not have
      points: spec.points.map((p) => ({ ...p, influential: false })),
    },
    { width, height, scale: 2, lineWidth: 3, pointColor: "rgba(37,99,235,0.85)", pointRadius: 5 }
  );

  const sheet = workbook.addWorksheet(PLOT_SHEET);
  sheet.views = [{ showGridLines: false }];
  // keep the whole plot on one printed page
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  const imageId = workbook.addImage({ base64: png, extension: "png" });
  sheet.addImage(imageId, { tl: { col: 0.3, row: 0.6 }, ext: { width, height } });
}

/**
 * Adds "Regression Data" and "Regression Summary" plus a scatter-plot sheet (in that order, after any
 * sheets already in the workbook). No names or emails: anonymized IDs only.
 *
 * Data sheet: raw numbers as plain values, then z-scores / X / Y as
 * REAL formulas. Y is left blank for a respondent dropped from the
 * regression (perfect pre-test), which SLOPE/INTERCEPT/CORREL/RSQ/STEYX all
 * silently skip -- so the Summary sheet's formulas naturally match the
 * server's n_regression rather than n_included.
 *
 * Summary sheet: every statistic is a formula over the data sheet (SLOPE,
 * INTERCEPT, CORREL, RSQ, STEYX, T.DIST.2T), with the server-computed value
 * as the cached result so it shows immediately and is recomputed by Excel.
 * The sensitivity row and the interpretation text are static, server-
 * computed cells and are labelled that way.
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
        heading: "Learning Impact Model: Simple Regression",
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

  // ----- Regression Data -----------------------------------------------------
  const COLS = [
    ["id", "Respondent ID", 16],
    ["pre", "Pre-test", 11],
    ["post", "Post-test", 11],
    ["tsr", "TSR", 10],
    ["aes", "AES", 10],
    ["rog", "ROG", 10],
    ["zTsr", "z_TSR", 10],
    ["zAes", "z_AES", 10],
    ["zRog", "z_ROG", 10],
    ["x", "X System Interaction", 16],
    ["y", "Y Learning Gain", 14],
  ];
  const col = {};
  COLS.forEach(([key], i) => { col[key] = colLetter(i + 1); });
  // Whole-column references, not a range frozen to the exported row count:
  // a row added below the last respondent (or deleted from anywhere) is
  // picked up by the z-scores and every statistic, with no #REF!. Every
  // function used over them (AVERAGE, STDEV.S, SLOPE, INTERCEPT, CORREL, RSQ,
  // STEYX, DEVSQ, SUM, SUMSQ, COUNT, MIN, MAX) ignores the header text.
  // SUMPRODUCT alone gets a bounded range, since a whole column would make
  // it walk a million rows.
  const abs = (key) => `$${col[key]}:$${col[key]}`;
  const dataRef = (key) => `'${DATA_SHEET}'!$${col[key]}:$${col[key]}`;
  const dataAbs = dataRef;
  const dataBounded = (key) => `'${DATA_SHEET}'!$${col[key]}$2:$${col[key]}$${OPEN_LAST_ROW}`;

  const dataRows = rows.map((r, i) => {
    const rr = i + 2;
    return {
      id: r.id,
      pre: r.pre, post: r.post, tsr: r.tsr, aes: r.aes, rog: r.rog,
      zTsr: f(`STANDARDIZE(D${rr},AVERAGE(${abs("tsr")}),_xlfn.STDEV.S(${abs("tsr")}))`, r.z_tsr),
      zAes: f(`STANDARDIZE(E${rr},AVERAGE(${abs("aes")}),_xlfn.STDEV.S(${abs("aes")}))`, r.z_aes),
      zRog: f(`STANDARDIZE(F${rr},AVERAGE(${abs("rog")}),_xlfn.STDEV.S(${abs("rog")}))`, r.z_rog),
      x: f(`AVERAGE(${col.zTsr}${rr}:${col.zRog}${rr})`, r.x),
      // Left blank for a dropped respondent (Pre = 100): SLOPE/CORREL/etc.
      // over a mismatched blank-vs-number pair simply skip that row.
      y: r.y == null ? "" : f(`(C${rr}-B${rr})/(100-B${rr})`, r.y),
    };
  });

  addTableSheet(
    workbook,
    DATA_SHEET,
    COLS.map(([key, header, width]) => ({
      header,
      key,
      width,
      numFmt: ["zTsr", "zAes", "zRog", "x", "y"].includes(key) ? "0.000" : undefined,
    })),
    dataRows,
    { headerColor }
  );

  // ----- Regression Summary --------------------------------------------------
  const X = dataAbs("x");
  const Y = dataAbs("y");
  const m = reg.model;
  const c = reg.correlation;
  const dg = reg.sums;

  const b1 = f(`SLOPE(${Y},${X})`, m.b1, "0.0000");
  const b0 = f(`INTERCEPT(${Y},${X})`, m.b0, "0.0000");
  const r = f(`CORREL(${Y},${X})`, c.r, "0.0000");
  const r2 = f(`RSQ(${Y},${X})`, c.r2, "0.0000");
  const nCount = `COUNT(${Y})`;
  const df = `${nCount}-2`;
  const devsqX = `DEVSQ(${X})`;
  // STEYX is a legacy (pre-2007) function -- no _xlfn. prefix needed, unlike
  // STDEV.S / T.DIST.2T / T.INV.2T below.
  const seB1 = `STEYX(${Y},${X})/SQRT(${devsqX})`;
  const tStat = `SLOPE(${Y},${X})/(${seB1})`;

  const sections = [
    {
      heading: "Learning Impact Model: Simple Regression",
      rows: [
        ["Respondents with complete data", reg.n_included],
        ["Respondents excluded", reg.n_excluded],
        ...(reg.excluded_reasons || []).map((rr) => [`Excluded: ${rr.reason}`, rr.count]),
        ["Respondents in the fitted regression", f(nCount, reg.n_regression)],
        ["Dropped for perfect pre-test", reg.n_dropped_for_regression],
        ["Model equation", reg.method.model_equation],
      ],
    },
    {
      heading: "Regression",
      rows: [
        ["Intercept b0", b0],
        ["Slope b1", b1],
        ["SE of b1", f(seB1, m.se_b1, "0.0000")],
        ["t", f(tStat, m.t, "0.000")],
        ["df", f(df, m.df)],
        ["p two-tailed", f(`_xlfn.T.DIST.2T(ABS(${tStat}),${df})`, m.p, "0.0000")],
        ["95% CI lower", f(`${b1.formula}-_xlfn.T.INV.2T(0.05,${df})*(${seB1})`, m.ci_low, "0.0000")],
        ["95% CI upper", f(`${b1.formula}+_xlfn.T.INV.2T(0.05,${df})*(${seB1})`, m.ci_high, "0.0000")],
        ["Pearson r", r],
        ["R2", r2],
      ],
    },
    {
      heading: "Running sums",
      rows: [
        ["n", f(nCount, m.n)],
        ["SigmaX", f(`SUM(${X})`, dg.sum_x, "0.0000")],
        ["SigmaY", f(`SUM(${Y})`, dg.sum_y, "0.0000")],
        ["SigmaXY", f(`SUMPRODUCT(${dataBounded("x")},${dataBounded("y")})`, dg.sum_xy, "0.0000")],
        ["SigmaX2", f(`SUMSQ(${X})`, dg.sum_x2, "0.0000")],
        ["SigmaY2", f(`SUMSQ(${Y})`, dg.sum_y2, "0.0000")],
      ],
    },
    {
      heading: "Sensitivity check",
      rows: reg.sensitivity.map((s) => [
        `${sensitivityLabel(s)}, n = ${s.n}`,
        s.unavailable
          ? `Not available: ${s.unavailable}`
          : `b1 = ${fmtNum(s.slope)}, p ${fmtP(s.p).startsWith("<") ? "" : "= "}${fmtP(s.p)}, R2 = ${fmtR2(s.r2)}`,
      ]),
    },
    { heading: "Interpretation" },
    ...(reg.interpretation || []).map((s) => ({ narrative: s })),
  ];
  if ((reg.limitations || []).length > 0) {
    sections.push({ heading: "Limitations" });
    reg.limitations.forEach((s) => sections.push({ narrative: s }));
  }

  const sheet = addKeyValueSheet(workbook, SUMMARY_SHEET, sections, { headerColor });
  addRegressionPlotSheet(workbook, reg);

  // Merged narrative rows don't auto-fit their height in Excel; size them from
  // the text length (the two merged columns are ~110 characters wide).
  sheet.getColumn(1).width = 62;
  sheet.getColumn(2).width = 58;
  sheet.eachRow((row) => {
    const v = row.getCell(1).value;
    if (typeof v === "string" && v.length > 60 && row.getCell(1).alignment?.wrapText) {
      row.height = 15 * Math.ceil(v.length / 105) + 4;
    }
  });
}
