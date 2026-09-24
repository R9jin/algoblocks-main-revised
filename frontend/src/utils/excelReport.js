// frontend/src/utils/excelReport.js
//
// Small shared helpers on top of ExcelJS for the "Download Excel" actions in
// AdminUserManagement.jsx (Learning Impact Report) and EvaluationSuite.jsx
// (Complexity Analyzer Benchmark Report). Both reports build a multi-sheet
// jsPDF report already -- these helpers build the equivalent .xlsx workbook
// with a matching set of sheets, but carrying the *full* underlying data
// (every field, every row) rather than the pagination-limited subset a
// printable PDF page can reasonably show.
//
// Kept deliberately generic (no admin/eval-specific field names) so both
// pages can compose their own sheets out of plain "table" data.

const BRAND_HEADER_FONT_COLOR = { argb: "FFFFFFFF" };

/**
 * Converts a 1-indexed column number to its Excel column letter(s)
 * (1 -> "A", 27 -> "AA"). Used when building cross-sheet formula strings
 * so a column's position only has to be tracked once, as a number.
 */
export function colLetter(n) {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

/**
 * Escapes a value for safe embedding inside a double-quoted Excel formula
 * string literal (doubles any embedded double-quotes).
 */
export function excelStringLiteral(value) {
  return String(value ?? "").replace(/"/g, '""');
}

/**
 * Same as excelStringLiteral, but for a literal used as the *criterion* of
 * COUNTIF / COUNTIFS / SUMIFS / AVERAGEIFS. Those functions treat `*`, `?`
 * and `~` as wildcard syntax, so a label like "O(n * m)" would also match
 * "O(n + m)" unless the wildcard characters are escaped with `~`.
 */
export function excelCriterion(value) {
  return String(value ?? "")
    .replace(/~/g, "~~")
    .replace(/\*/g, "~*")
    .replace(/\?/g, "~?")
    .replace(/"/g, '""');
}

/**
 * Last row used by the bounded "open" ranges below. Only needed by
 * formulas that cannot take a whole-column reference (SUMPRODUCT would
 * walk all 1,048,576 rows); everything else uses whole columns.
 */
export const OPEN_LAST_ROW = 5000;

/**
 * A cell in a `rows` array passed to addTableSheet/addKeyValueSheet can be
 * either a plain value (string/number/etc, written as-is, same as before)
 * or `{ formula, result, numFmt }` to write an actual Excel formula --
 * `result` is an optional cached value ExcelJS/Excel shows until the
 * workbook is recalculated, and `numFmt` (if given) overrides the column's
 * own numFmt for that one cell. This is what lets a "computed" sheet like
 * Summary or Per-Module Breakdown actually calculate its numbers from the
 * raw-data sheets (Respondents, Learning Path Detail, Pre-Post Test Data)
 * instead of having the final number pasted in as a static value.
 */
function applyCellValue(cell, value, fallbackNumFmt) {
  if (value && typeof value === "object" && "formula" in value) {
    cell.value = value.result !== undefined
      ? { formula: value.formula, result: value.result }
      : { formula: value.formula };
    if (value.numFmt || fallbackNumFmt) cell.numFmt = value.numFmt || fallbackNumFmt;
  } else {
    cell.value = value ?? "";
    if (fallbackNumFmt) cell.numFmt = fallbackNumFmt;
  }
}

/**
 * Adds a formatted single-header-row table sheet to `workbook`.
 *
 * @param {import("exceljs").Workbook} workbook
 * @param {string} sheetName - Excel sheet names are capped at 31 chars and
 *   can't contain []:*?/\\ -- sanitized here so callers can pass a natural
 *   title without worrying about that.
 * @param {Array<{ header: string, key: string, width?: number, numFmt?: string }>} columns
 * @param {Array<Object>} rows - plain objects keyed by each column's `key`.
 *   Each value can be a plain value, or `{ formula, result, numFmt }` --
 *   see `applyCellValue` above.
 * @param {{ headerColor?: string, title?: string, subtitle?: string }} [opts]
 *   headerColor: 6-digit hex (no #), defaults to a purple matching the app.
 *   title/subtitle: optional banner rows rendered above the header row.
 */
export function addTableSheet(workbook, sheetName, columns, rows, opts = {}) {
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Sheet";
  const sheet = workbook.addWorksheet(safeName, {
    views: [{ state: "frozen", ySplit: opts.title ? (opts.subtitle ? 3 : 2) : 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || Math.max(12, Math.min(40, c.header.length + 4)),
  }));

  let headerRowNumber = 1;
  if (opts.title) {
    const titleRow = sheet.addRow([opts.title]);
    titleRow.font = { bold: true, size: 13 };
    sheet.mergeCells(1, 1, 1, columns.length || 1);
    headerRowNumber += 1;
    if (opts.subtitle) {
      const subtitleRow = sheet.addRow([opts.subtitle]);
      subtitleRow.font = { size: 11 };
      sheet.mergeCells(2, 1, 2, columns.length || 1);
      headerRowNumber += 1;
    }
    // Re-add the header row (sheet.columns already wrote one at row 1 via
    // ExcelJS's implicit header handling for row 1 only -- since we've
    // pushed banner rows above it, add the real header explicitly here).
    const headerRow = sheet.getRow(headerRowNumber);
    columns.forEach((c, idx) => {
      headerRow.getCell(idx + 1).value = c.header;
    });
    headerRow.commit();
  }

  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: BRAND_HEADER_FONT_COLOR };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${opts.headerColor || "5A1398"}` },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  headerRow.height = 20;

  rows.forEach((rowData) => {
    const row = sheet.addRow([]);
    columns.forEach((c, idx) => {
      applyCellValue(row.getCell(idx + 1), rowData[c.key], c.numFmt);
    });
  });

  columns.forEach((c, idx) => {
    if (c.wrap) sheet.getColumn(idx + 1).alignment = { wrapText: true, vertical: "top" };
  });

  if (rows.length > 0 && columns.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + rows.length, column: columns.length },
    };
  }

  return sheet;
}

/**
 * Builds the cross-sheet reference strings for a table sheet added with
 * addTableSheet, given only its name, its column keys in order, and how
 * many data rows it will have.
 *
 * Callers use this to write formulas that point at a raw-data sheet
 * without hand-tracking column letters, and it is safe to build BEFORE the
 * sheet itself is added -- Excel resolves forward references fine, which is
 * what lets a computed Summary sit as the first tab while reading from raw
 * sheets further right.
 *
 * IMPORTANT -- ranges are OPEN, not frozen to the exported row count.
 * `range(key)` is the whole column (`'Submissions'!$J:$J`), so a row that
 * is added below the last one, pasted in, or inserted directly under the
 * header is picked up by every formula that reads the column, and deleting
 * rows can never leave a #REF! behind. (The previous version wrote
 * `$J$2:$J$418`, which silently ignored anything added past row 418.)
 * The header cell is inside a whole-column range; every function used over
 * it (COUNTIFS/SUMIFS/AVERAGEIFS criteria, AVERAGE, SUM, COUNT, MEDIAN,
 * PERCENTILE, MAX ...) ignores text, and `count(key)` subtracts it for the
 * one that does not (COUNTA).
 *
 * @param {string} sheetName - the SAME string passed to addTableSheet.
 * @param {string[]} colKeys - column keys, in the order the columns appear.
 * @param {number} rowCount - number of data rows AT EXPORT TIME (only used
 *   for `lastRow` / `cell()` addressing; ranges do not depend on it).
 * @param {{ headerRows?: number }} [opts] - headerRows defaults to 1; pass
 *   2 or 3 when the sheet is created with a title/subtitle banner.
 */
export function sheetRefs(sheetName, colKeys, rowCount, opts = {}) {
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Sheet";
  const quoted = /[^A-Za-z0-9_]/.test(safeName) ? `'${safeName}'` : safeName;
  const headerRows = opts.headerRows || 1;
  const firstRow = headerRows + 1;
  const lastRow = rowCount > 0 ? headerRows + rowCount : firstRow;

  const letters = {};
  colKeys.forEach((key, i) => { letters[key] = colLetter(i + 1); });
  const wholeCol = (key) => `${quoted}!$${letters[key]}:$${letters[key]}`;

  return {
    sheet: quoted,
    firstRow,
    lastRow,
    rowCount,
    col: (key) => letters[key],
    /** Whole column, sheet-qualified: grows and shrinks with the data. */
    range: wholeCol,
    /**
     * Data-only range that stops at OPEN_LAST_ROW -- for SUMPRODUCT and
     * other array formulas where a whole column would be needlessly slow.
     */
    bounded: (key) => `${quoted}!$${letters[key]}$${firstRow}:$${letters[key]}$${OPEN_LAST_ROW}`,
    /** Number of non-empty data cells in a column (COUNTA minus the header row(s)). */
    count: (key) => `(COUNTA(${wholeCol(key)})-${headerRows})`,
    /** Sheet-qualified single cell, by column key and data-row index (0-based). */
    cell: (key, i) => `${quoted}!$${letters[key]}$${firstRow + i}`,
    /** Local (same-sheet) cell address, for formulas written INTO this sheet. */
    localCell: (key, i) => `${letters[key]}${firstRow + i}`,
  };
}

/**
 * Works out, BEFORE anything is written, which row each labelled row of a
 * key-value sheet will land on, and returns a `ref(id)` helper giving that
 * row's value-cell address (e.g. `'Summary'!$B$14`).
 *
 * This is what lets a Summary sheet chain its own cells together the way a
 * person would by hand -- "Overall Time Accuracy" as `=B6/B5` (correct
 * count over total tested) rather than as one long COUNTIF(...)/COUNTA(...)
 * expression repeated in every row, or worse, as a pasted-in number.
 *
 * Pass rows as `[label, value, id]`; the third element is the lookup id and
 * is ignored by addKeyValueSheet itself. The row arithmetic below mirrors
 * addKeyValueSheet exactly: row 1 is the "Metric / Value" header written by
 * `sheet.columns`, then one row per heading, one per narrative, one per
 * data row, and one blank spacer after each section.
 *
 * @param {string} sheetName - must be the SAME string passed to
 *   addKeyValueSheet (it is sanitized here the same way).
 * @param {Array} sections
 * @returns {{ ref: (id: string) => string, rowOf: (id: string) => number }}
 */
export function planKeyValueSheet(sheetName, sections) {
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Summary";
  const rowOfId = {};
  let row = 1; // row 1 is the header written by sheet.columns

  sections.forEach((section) => {
    if (section.heading) row += 1;
    if (section.narrative) row += 1;
    (section.rows || []).forEach(([, , id]) => {
      row += 1;
      if (id) rowOfId[id] = row;
    });
    row += 1; // trailing blank spacer row
  });

  return {
    rowOf: (id) => rowOfId[id],
    ref: (id) => (rowOfId[id] ? `'${safeName}'!$B$${rowOfId[id]}` : "#REF!"),
  };
}

/**
 * Adds a simple two-column "label / value" sheet -- used for the Summary /
 * Overview sheet of a report, mirroring the key-value tables the PDF
 * version renders with autoTable.
 *
 * Rows may be `[label, value]` or `[label, value, id]` -- the optional id is
 * only meaningful to planKeyValueSheet above and is ignored here.
 */
export function addKeyValueSheet(workbook, sheetName, sections, opts = {}) {
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Summary";
  const sheet = workbook.addWorksheet(safeName);
  sheet.columns = [
    { header: "Metric", key: "label", width: 42 },
    { header: "Value", key: "value", width: 46 },
  ];

  sections.forEach((section) => {
    if (section.heading) {
      const headingRow = sheet.addRow([section.heading]);
      headingRow.font = { bold: true, size: 12, color: { argb: `FF${opts.headerColor || "5A1398"}` } };
      sheet.mergeCells(headingRow.number, 1, headingRow.number, 2);
    }
    if (section.narrative) {
      const narrativeRow = sheet.addRow([section.narrative]);
      narrativeRow.alignment = { wrapText: true, vertical: "top" };
      sheet.mergeCells(narrativeRow.number, 1, narrativeRow.number, 2);
    }
    (section.rows || []).forEach(([label, value]) => {
      const row = sheet.addRow([label]);
      applyCellValue(row.getCell(2), value);
      row.getCell(1).font = { bold: true };
    });
    sheet.addRow([]);
  });

  return sheet;
}

/**
 * Writes the workbook to an .xlsx Blob and triggers a browser download --
 * no server round-trip, matching how the PDF report is generated fully
 * client-side with jsPDF.
 */
export async function downloadWorkbook(workbook, filename) {
  // Ask Excel to rebuild every formula from the raw cells when the file is
  // opened, instead of trusting the cached results written alongside them.
  // The cached values only exist so the numbers read correctly in viewers
  // that never calculate (previewers, Protected View); they must never be
  // what Excel keeps showing after a cell is edited or a row is removed.
  workbook.calcProperties = { ...(workbook.calcProperties || {}), fullCalcOnLoad: true };
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
