// Reads utility bills (DEWA, ADDC, AADC, SEWA, Etihad WE) in the browser.
//
// Text PDFs (the e-bills providers email) are read with pdf.js; the parser
// looks for the labels these bills use rather than fixed positions, so a
// layout change degrades to "fill in by hand" instead of wrong numbers.
// Scanned bills and photos have no text layer: they come back empty and the
// person fills them in. Reading those needs OCR / an AI reader on the backend.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { iso8601 } from "./data";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface ParsedBill {
  provider: string | null;
  account: string | null;
  /** Consumption month, YYYY-MM. */
  period: string | null;
  electricity: number | null;
  water: number | null;
  total: number | null;
  dueDate: string | null;
  /** Payment the provider received since the previous bill. */
  paidAmount: number | null;
  paidOn: string | null;
  /** What could not be read, for the review screen. */
  missing: string[];
  textFound: boolean;
}

export async function extractText(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return "";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    // Keep line breaks so "label  value" pairs on one line stay together.
    let line = "", lastY: number | null = null;
    const lines: string[] = [];
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ""; }
      line += (line && !line.endsWith(" ") ? " " : "") + item.str;
      lastY = y;
      if (item.hasEOL) { lines.push(line); line = ""; lastY = null; }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const AMOUNT = String.raw`(?:AED|Dhs?\.?)?\s*\(?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|-?\d+\.\d{1,2}|-?\d{1,3}(?:,\d{3})+|-?\d+)\s*\)?\s*(?:AED)?`;
const DATE = String.raw`(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\-]+[A-Za-z]{3,9}[\s\-,]+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})`;

const num = (s: string | undefined) => (s ? Math.abs(parseFloat(s.replace(/,/g, ""))) : null);

/** dd/mm/yyyy, dd-Mon-yyyy, Mon dd yyyy → YYYY-MM-DD (UAE bills use day-first). */
export function parseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return iso8601(new Date(y, +m[2] - 1, +m[1])); }
  m = s.match(/(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-,]+(\d{4})/);
  if (m) { const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); if (mo >= 0) return iso8601(new Date(+m[3], mo, +m[1])); }
  m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) { const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); if (mo >= 0) return iso8601(new Date(+m[3], mo, +m[2])); }
  return null;
}

function first(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) { const m = text.match(p); if (m) return m; }
  return null;
}

export function parseBill(text: string, fileName = ""): ParsedBill {
  const t = text.replace(/[ \t]+/g, " ");
  const hay = `${t}\n${fileName}`;

  const provider =
    /\bDEWA\b|Dubai Electricity/i.test(hay) ? "DEWA"
    : /\bAADC\b|Al Ain Distribution/i.test(hay) ? "AADC"
    : /\bADDC\b|Abu Dhabi Distribution|\bTAQA\b/i.test(hay) ? "ADDC"
    : /\bSEWA\b|Sharjah Electricity/i.test(hay) ? "SEWA"
    : /Etihad\s*(Water|WE)|\bFEWA\b/i.test(hay) ? "Etihad WE" : null;

  const acc = first(hay, [
    /(?:Contract\s*Account|Account\s*(?:No\.?|Number|#)|Acc(?:ount)?\.?\s*No\.?|Customer\s*(?:No|Number))\s*[:#.\-]?\s*(\d[\d\s]{6,14}\d)/i,
    /\b(20\d{8})\b/,
  ]);
  const account = acc ? acc[1].replace(/\s/g, "") : null;

  // Billing period: prefer an explicit "from – to" range (use its end month), then "Month YYYY".
  let period: string | null = null;
  const range = t.match(new RegExp(String.raw`(?:Bill(?:ing)?\s*Period|Period|Consumption\s*Period|From)\s*[:\-]?\s*${DATE}\s*(?:-|–|to|To|TO)\s*${DATE}`, "i"));
  if (range) period = parseDate(range[2])?.slice(0, 7) ?? null;
  if (!period) {
    const mon = t.match(/(?:Bill(?:ing)?\s*(?:Month|Period)|Month)\s*[:\-]?\s*([A-Za-z]{3,9})[\s\-,]+(\d{4})/i);
    if (mon) { const mo = MONTHS.indexOf(mon[1].slice(0, 3).toLowerCase()); if (mo >= 0) period = `${mon[2]}-${String(mo + 1).padStart(2, "0")}`; }
  }
  const billDate = parseDate(first(t, [new RegExp(String.raw`(?:Bill|Invoice|Issue)\s*Date\s*[:\-]?\s*${DATE}`, "i")])?.[1]);
  if (!period && billDate) { // a bill issued in November is for October's consumption
    const d = new Date(`${billDate}T00:00:00`); d.setMonth(d.getMonth() - 1); period = iso8601(d).slice(0, 7);
  }

  const electricity = num(first(t, [new RegExp(String.raw`Electricity\s*(?:Charges?|Consumption(?:\s*Charges?)?|Amount)?\s*[:\-]?\s*${AMOUNT}`, "i")])?.[1]);
  const water = num(first(t, [new RegExp(String.raw`Water\s*(?:Charges?|Consumption(?:\s*Charges?)?|Amount)?\s*[:\-]?\s*${AMOUNT}`, "i")])?.[1]);
  const total = num(first(t, [
    new RegExp(String.raw`(?:Total\s*(?:Amount\s*)?(?:Due|Payable)|Amount\s*(?:Due|Payable)|Current\s*(?:Bill|Month)\s*(?:Amount|Charges?)|Total\s*Bill\s*Amount|Total\s*Current\s*Charges)\s*[:\-]?\s*${AMOUNT}`, "i"),
  ])?.[1]);
  const dueDate = parseDate(first(t, [new RegExp(String.raw`(?:Due\s*Date|Pay(?:ment)?\s*(?:Due\s*)?By|Last\s*Date\s*(?:of|for)\s*Payment)\s*[:\-]?\s*${DATE}`, "i")])?.[1]);

  const paid = first(t, [new RegExp(String.raw`(?:Payments?\s*Received|Last\s*Payment(?:\s*Received)?|Paid\s*Amount|Payment\s*-?\s*Thank\s*you)[^\d\n]{0,30}?${AMOUNT}(?:[^\n]*?(?:on|dated?)\s*${DATE})?`, "i")]);
  const paidAmount = paid ? num(paid[1]) : null;
  const paidOn = paid ? parseDate(paid[2]) : null;

  const missing: string[] = [];
  if (!provider) missing.push("provider");
  if (!account) missing.push("account number");
  if (!period) missing.push("billing month");
  if (electricity == null && water == null && total == null) missing.push("amount");
  return { provider, account, period, electricity, water, total, dueDate, paidAmount: paidAmount || null, paidOn, missing, textFound: t.trim().length > 20 };
}

export async function readBill(file: File): Promise<ParsedBill> {
  try {
    return parseBill(await extractText(file), file.name);
  } catch {
    return { ...parseBill("", file.name), textFound: false };
  }
}
