/**
 * A tiny .xlsx writer — just enough for styled report sheets, with no
 * dependency (exceljs alone would add ~1 MB to the app).
 *
 *   const bytes = buildXlsx({ sheets: [{ name, cols: [px…], rows: [{ height, cells: [{ v, s, link }] }] }], styles })
 *   new Blob([bytes], { type: XLSX_MIME })
 *
 * styles: an array of { font: { name, size, bold, underline, color }, fill: "RRGGBB",
 *   border: "RRGGBB", align: "center", valign: "center", wrap: true, numFmt: "#,##0" }.
 *   A cell's `s` is an index into it.
 * Cells: string → inline string (newlines kept), number → number,
 *   `link` → a clickable hyperlink on that cell.
 *
 * The zip is written uncompressed ("stored"), which every spreadsheet app
 * reads; report files stay small anyway.
 */

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // XML 1.0 forbids most control characters; Excel refuses the file if they slip in.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colName = (i) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Excel column width is in "characters" of the default font; ~7px each plus padding.
const pxToWidth = (px) => Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
const pxToPt = (px) => Math.round(px * 0.75 * 100) / 100;

function stylesXml(styles) {
  const fonts = [], fills = [], borders = [], numFmts = [], xfs = [];
  const idx = (list, key) => { let i = list.indexOf(key); if (i < 0) { list.push(key); i = list.length - 1; } return i; };
  // fills 0/1 are reserved by the format (none, gray125)
  fills.push("none", "gray125");
  fonts.push(JSON.stringify({}));
  borders.push("none");
  for (const st of styles) {
    const f = idx(fonts, JSON.stringify(st.font || {}));
    const fl = st.fill ? idx(fills, st.fill) : 0;
    const b = st.border ? idx(borders, st.border) : 0;
    let nf = 0;
    if (st.numFmt) nf = 164 + idx(numFmts, st.numFmt);
    xfs.push({ f, fl, b, nf, st });
  }
  const fontXml = fonts.map((k) => {
    const f = JSON.parse(k);
    return `<font>${f.bold ? "<b/>" : ""}${f.underline ? '<u/>' : ""}<sz val="${f.size || 10}"/>` +
      `<color rgb="FF${(f.color || "000000").toUpperCase()}"/><name val="${esc(f.name || "Arial")}"/></font>`;
  }).join("");
  const fillXml = fills.map((c) => c === "none" || c === "gray125"
    ? `<fill><patternFill patternType="${c}"/></fill>`
    : `<fill><patternFill patternType="solid"><fgColor rgb="FF${c.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`).join("");
  const borderXml = borders.map((c) => c === "none"
    ? "<border><left/><right/><top/><bottom/><diagonal/></border>"
    : `<border>${["left", "right", "top", "bottom"].map((s) => `<${s} style="thin"><color rgb="FF${c.toUpperCase()}"/></${s}>`).join("")}<diagonal/></border>`).join("");
  const numFmtXml = numFmts.length
    ? `<numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("")}</numFmts>` : "";
  const xfXml = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', ...xfs.map(({ f, fl, b, nf, st }) => {
    const al = st.align || st.valign || st.wrap
      ? `<alignment${st.align ? ` horizontal="${st.align}"` : ""}${st.valign ? ` vertical="${st.valign}"` : ""}${st.wrap ? ' wrapText="1"' : ""}/>` : "";
    return `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0"${nf ? ' applyNumberFormat="1"' : ""} applyFont="1"${fl ? ' applyFill="1"' : ""}${b ? ' applyBorder="1"' : ""}${al ? ' applyAlignment="1">' + al + "</xf>" : "/>"}`;
  })].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmtXml}<fonts count="${fonts.length}">${fontXml}</fonts><fills count="${fills.length}">${fillXml}</fills><borders count="${borders.length}">${borderXml}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length + 1}">${xfXml}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function sheetXml(sheet) {
  const links = [];
  const cols = (sheet.cols || []).map((px, i) => `<col min="${i + 1}" max="${i + 1}" width="${pxToWidth(px)}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((row, r) => {
    const cells = row.cells.map((c, ci) => {
      if (c == null) return "";
      const ref = `${colName(ci)}${r + 1}`;
      const s = c.s != null ? ` s="${c.s + 1}"` : "";
      if (c.link) links.push({ ref, url: c.link });
      if (c.v == null || c.v === "") return `<c r="${ref}"${s}/>`;
      if (typeof c.v === "number" && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }).join("");
    const ht = row.height ? ` ht="${pxToPt(row.height)}" customHeight="1"` : "";
    return `<row r="${r + 1}"${ht}>${cells}</row>`;
  }).join("");
  const freeze = sheet.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const hl = links.length
    ? `<hyperlinks>${links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join("")}</hyperlinks>` : "";
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData>${hl}</worksheet>`;
  const rels = links.length
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map((l, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`).join("")}</Relationships>`
    : null;
  return { xml, rels };
}

/** Excel's rules for tab names: ≤31 chars, none of []:*?/\ , unique (case-insensitive). */
export function safeSheetNames(names) {
  const used = new Set();
  return names.map((n) => {
    let base = String(n || "Sheet").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Sheet";
    base = base.slice(0, 31).trim();
    let name = base, k = 2;
    while (used.has(name.toLowerCase())) { const suf = ` (${k++})`; name = base.slice(0, 31 - suf.length).trim() + suf; }
    used.add(name.toLowerCase());
    return name;
  });
}

export function buildXlsx({ sheets, styles = [] }) {
  const names = safeSheetNames(sheets.map((s) => s.name));
  const files = [];
  const add = (path, text) => files.push({ path, data: new TextEncoder().encode(text) });

  add("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  add("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add("xl/styles.xml", stylesXml(styles));
  sheets.forEach((sh, i) => {
    const { xml, rels } = sheetXml(sh);
    add(`xl/worksheets/sheet${i + 1}.xml`, xml);
    if (rels) add(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, rels);
  });
  return zipStore(files);
}

// ── zip (stored) ─────────────────────────────────────────────────────────────
let CRC_TABLE;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = enc.encode(f.path);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true); cen.setUint32(24, f.data.length, true); cen.setUint16(28, name.length, true);
    cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true); cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
