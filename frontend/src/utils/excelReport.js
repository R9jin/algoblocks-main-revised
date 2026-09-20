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
      subtitleRow.font = { italic: true, size: 9, color: { argb: "FF666677" } };
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
      to: { row: headerRowNumber, column: columns.length },
    };
  }

  return sheet;
}

/**
 * Adds a simple two-column "label / value" sheet -- used for the Summary /
 * Overview sheet of a report, mirroring the key-value tables the PDF
 * version renders with autoTable.
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
      narrativeRow.font = { italic: true, size: 9, color: { argb: "FF444455" } };
      narrativeRow.alignment = { wrapText: true };
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
