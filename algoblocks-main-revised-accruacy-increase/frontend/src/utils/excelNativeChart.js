// frontend/src/utils/excelNativeChart.js
//
// ExcelJS can write images but cannot author chart objects. This module adds
// real, editable Excel scatter charts by post-processing the .xlsx that
// ExcelJS produces: an .xlsx is a zip, so the chart part, the drawing part
// that anchors it on a sheet, their relationships and the content types are
// added directly.
//
// The chart reads its points from worksheet cells (not from a picture), so in
// Excel it can be clicked, restyled, retitled and re-pointed, and it follows
// any edit to the data cells. The fitted line is Excel's own linear
// trendline, so it refits when the data changes.
//
// Usage:
//   addScatterChart(workbook, { sheetName, ... })   // before writing
//   downloadWorkbook(workbook, name)                // injects on write

import JSZip from "jszip";

const REGISTRY = "__nativeScatterCharts";
const EMU_PER_PX = 9525;

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Registers a scatter chart to be embedded on `sheetName` when the workbook
 * is written. Nothing is changed in the workbook until injectNativeCharts().
 *
 * @param {import("exceljs").Workbook} workbook
 * @param {{
 *   sheetName: string,        // sheet that will hold the chart (must exist)
 *   title: string,
 *   xTitle: string,
 *   yTitle: string,
 *   seriesName: string,
 *   xRef: string,             // e.g. "'Regression Data'!$J$2:$J$31"
 *   yRef: string,
 *   xValues?: number[],       // optional cached values so viewers that never
 *   yValues?: Array<number|null>, // recalculate still draw the points
 *   trendline?: boolean,      // default true: linear trendline
 *   anchor?: { col: number, row: number, widthPx: number, heightPx: number },
 *   color?: string            // hex without #
 * }} cfg
 */
export function addScatterChart(workbook, cfg) {
  if (!workbook[REGISTRY]) workbook[REGISTRY] = [];
  workbook[REGISTRY].push(cfg);
}

function numCache(values, fmt = "General") {
  if (!values) return "";
  const pts = values
    .map((v, i) => (v == null || !Number.isFinite(v) ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`))
    .join("");
  return `<c:numCache><c:formatCode>${fmt}</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache>`;
}

const txPr = (sz, bold = false, color = "404040") =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">` +
  `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

const richTitle = (text, sz, bold, rotate) =>
  `<c:title><c:tx><c:rich><a:bodyPr${rotate ? ' rot="-5400000" vert="horz"' : ""}/><a:lstStyle/>` +
  `<a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"/></a:pPr>` +
  `<a:r><a:rPr lang="en-US" sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="262626"/></a:solidFill></a:rPr>` +
  `<a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

function valAx(id, crossId, pos, title) {
  return (
    `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${pos}"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E3E3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    richTitle(title, 1100, false, pos === "l") +
    `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/>` +
    `<c:tickLblPos val="low"/>` +
    `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill></a:ln></c:spPr>` +
    txPr(900) +
    `<c:crossAx val="${crossId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
  );
}

function chartXml(cfg) {
  const color = cfg.color || "2563EB";
  const trend = cfg.trendline !== false;
  const trendXml = trend
    ? `<c:trendline><c:name>Fitted line</c:name>` +
      `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="5A1398"/></a:solidFill></a:ln></c:spPr>` +
      `<c:trendlineType val="linear"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:roundedCorners val="0"/>` +
    `<c:chart>` +
    richTitle(cfg.title, 1400, true, false) +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>` +
    `<c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:tx><c:v>${esc(cfg.seriesName)}</c:v></c:tx>` +
    // markers only; the line between points is switched off
    `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>` +
    `<c:marker><c:symbol val="circle"/><c:size val="8"/>` +
    `<c:spPr><a:solidFill><a:srgbClr val="${color}"><a:alpha val="80000"/></a:srgbClr></a:solidFill>` +
    `<a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>` +
    trendXml +
    `<c:xVal><c:numRef><c:f>${esc(cfg.xRef)}</c:f>${numCache(cfg.xValues)}</c:numRef></c:xVal>` +
    `<c:yVal><c:numRef><c:f>${esc(cfg.yRef)}</c:f>${numCache(cfg.yValues)}</c:numRef></c:yVal>` +
    `<c:smooth val="0"/></c:ser>` +
    `<c:axId val="500000001"/><c:axId val="500000002"/></c:scatterChart>` +
    valAx(500000001, 500000002, "b", cfg.xTitle) +
    valAx(500000002, 500000001, "l", cfg.yTitle) +
    `<c:spPr><a:noFill/></c:spPr></c:plotArea>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    `</c:chartSpace>`
  );
}

function drawingXml(charts) {
  const anchors = charts
    .map((c, i) => {
      const a = c.cfg.anchor || {};
      const col = a.col ?? 0;
      const row = a.row ?? 0;
      const cx = Math.round((a.widthPx || 760) * EMU_PER_PX);
      const cy = Math.round((a.heightPx || 460) * EMU_PER_PX);
      return (
        `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
        `<xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${cx}" cy="${cy}"/>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/>` +
        `<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
        `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/>` +
        `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`
  );
}

/** Resolves a sheet name to its part path (xl/worksheets/sheetN.xml). */
async function sheetPartPath(zip, sheetName) {
  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const tag = [...wb.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => (t.match(/\bname="([^"]*)"/)?.[1] || "").replace(/&amp;/g, "&") === sheetName);
  const rid = tag?.match(/\br:id="([^"]+)"/)?.[1];
  if (!rid) return null;
  const relTag = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => t.match(/\bId="([^"]+)"/)?.[1] === rid);
  const target = relTag?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/**
 * Adds every chart registered with addScatterChart() to the written .xlsx.
 * Takes and returns the raw bytes from `workbook.xlsx.writeBuffer()`; returns
 * them untouched when no chart was registered.
 */
export async function injectNativeCharts(workbook, buffer) {
  const charts = (workbook[REGISTRY] || []).map((cfg) => ({ cfg }));
  if (charts.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);

  // group by sheet so a sheet with two charts shares one drawing part
  const bySheet = new Map();
  for (const c of charts) {
    if (!bySheet.has(c.cfg.sheetName)) bySheet.set(c.cfg.sheetName, []);
    bySheet.get(c.cfg.sheetName).push(c);
  }

  let contentTypes = await zip.file("[Content_Types].xml").async("string");
  const overrides = [];
  let chartNo = 0;
  let drawingNo = 0;
  // never collide with drawings ExcelJS already wrote (e.g. from images)
  const existingDrawings = Object.keys(zip.files).filter((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
  drawingNo = existingDrawings.length;

  for (const [sheetName, list] of bySheet) {
    const sheetPath = await sheetPartPath(zip, sheetName);
    if (!sheetPath || !zip.file(sheetPath)) continue;
    drawingNo += 1;

    const drawingPath = `xl/drawings/drawing${drawingNo}.xml`;
    const drawingRels = [];
    list.forEach((c) => {
      chartNo += 1;
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(c.cfg));
      overrides.push(
        `<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
      );
      drawingRels.push(
        `<Relationship Id="rId${drawingRels.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`
      );
    });
    zip.file(drawingPath, drawingXml(list));
    zip.file(
      `xl/drawings/_rels/drawing${drawingNo}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join("")}</Relationships>`
    );
    overrides.push(
      `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    );

    // sheet -> drawing relationship
    const relsPath = sheetPath.replace(/worksheets\/(sheet\d+\.xml)$/, "worksheets/_rels/$1.rels");
    const drawingRel = `<Relationship Id="rIdChartDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/>`;
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const cur = await relsFile.async("string");
      zip.file(relsPath, cur.replace("</Relationships>", `${drawingRel}</Relationships>`));
    } else {
      zip.file(
        relsPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRel}</Relationships>`
      );
    }

    // <drawing/> must sit before legacyDrawing / tableParts / extLst in the sheet XML
    let sheetXml = await zip.file(sheetPath).async("string");
    if (!/xmlns:r=/.test(sheetXml)) {
      sheetXml = sheetXml.replace(
        /<worksheet\b/,
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
      );
    }
    const drawingTag = `<drawing r:id="rIdChartDrawing"/>`;
    const later = sheetXml.search(/<(legacyDrawing|legacyDrawingHF|drawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
    sheetXml =
      later >= 0
        ? sheetXml.slice(0, later) + drawingTag + sheetXml.slice(later)
        : sheetXml.replace("</worksheet>", `${drawingTag}</worksheet>`);
    zip.file(sheetPath, sheetXml);
  }

  contentTypes = contentTypes.replace("</Types>", `${overrides.join("")}</Types>`);
  zip.file("[Content_Types].xml", contentTypes);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
