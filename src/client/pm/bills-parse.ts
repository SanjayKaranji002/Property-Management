// Reads the details of a utility bill from its text (DEWA, ADDC, AADC, SEWA, Etihad WE).
//
// Kept free of the PDF library so the same rules can be tested outside the
// browser and reused by the backend. Bills print labels and values in
// different orders depending on the layout, so every field is looked for:
//   - after its label        "Month: February 2022"
//   - before its label       "February 2022 Month:"      (DEWA Green Bill text order)
//   - on the line above      "3004446951" / "Account Number"
// Specific lines win over generic ones ("Electricity total" before "Electricity").

import { iso8601 } from "./data";

export interface ParsedBill {
  provider: string | null;
  account: string | null;
  /** DEWA premise number and the name the bill is addressed to, used when the account number is missing. */
  premise: string | null; customerName: string | null;
  /** The text found in the file, shown in the import window. */
  text: string;
  /** Billing month, YYYY-MM. */
  period: string | null;
  electricity: number | null;
  water: number | null;
  /** This bill's own charges ("Current month total"), not including earlier balances. */
  total: number | null;
  dueDate: string | null;
  /** Payment the provider received since the previous bill. */
  paidAmount: number | null;
  paidOn: string | null;
  /** A final (move-out) bill. */
  finalBill: boolean;
  /** What could not be read, for the review screen. */
  missing: string[];
  textFound: boolean;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** A money amount, optionally with AED before or after and CR / brackets. */
const AMT = String.raw`(?:AED|Dhs?\.?)?\s*(?:CR\s*)?\(?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|-?\d+\.\d{1,2}|-?\d{1,3}(?:,\d{3})+|-?\d+)\s*\)?\s*(?:AED)?`;
const DATE = String.raw`(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\-]+[A-Za-z]{3,9}[\s\-,]+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})`;
const MONTH_YEAR = String.raw`([A-Za-z]{3,9})[\s\-,]+(\d{4})`;

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

/**
 * Finds `value` next to `label`: after it on the same line, before it on the
 * same line, or (when `above`) on the line above it. Returns the first capture group(s).
 */
function near(t: string, label: string, value: string, opts: { above?: boolean } = {}): RegExpMatchArray | null {
  return first(t, [
    new RegExp(String.raw`(?:^|[^A-Za-z])${label}\s*[:#\-]?[ \t]*${value}`, "im"),
    new RegExp(String.raw`${value}[ \t]*${label}\s*[:#]?`, "im"),
    ...(opts.above ? [new RegExp(String.raw`${value}[ \t]*\n[ \t]*${label}`, "im"), new RegExp(String.raw`${label}[^\n\d]*\n[ \t]*${value}`, "im")] : []),
  ]);
}

const monthOf = (name: string, year: string) => { const mo = MONTHS.indexOf(name.slice(0, 3).toLowerCase()); return mo >= 0 ? `${year}-${String(mo + 1).padStart(2, "0")}` : null; };

export function parseBill(text: string, fileName = ""): ParsedBill {
  const t = text.replace(/[ \t]+/g, " ").replace(/\n[ \t]*(?:\n[ \t]*)+/g, "\n").trim();
  const hay = `${t}\n${fileName}`;

  const provider =
    /\bDEWA\b|Dubai Electricity/i.test(hay) ? "DEWA"
    : /\bAADC\b|Al Ain Distribution/i.test(hay) ? "AADC"
    : /\bADDC\b|Abu Dhabi Distribution|\bTAQA\b/i.test(hay) ? "ADDC"
    : /\bSEWA\b|Sharjah Electricity/i.test(hay) ? "SEWA"
    : /Etihad\s*(Water|WE)|\bFEWA\b/i.test(hay) ? "Etihad WE" : null;

  // Account number. Digits may be spaced ("3 0 0 4…") in large print.
  const ACC_LABEL = String.raw`(?:Contract\s*Account(?:\s*(?:No\.?|Number))?|C\.?\s*A\.?\s*No\.?|Account\s*(?:No\.?|Number|#)|Acc(?:ount)?\.?\s*No\.?|Customer\s*(?:No|Number|ID)|Consumer\s*(?:No|Number))`;
  const ACC_VAL = String.raw`(\d(?:[ \-]?\d){6,13})`;
  const acc = near(hay, ACC_LABEL, ACC_VAL, { above: true }) ?? first(hay, [/\b([23]\d{9})\b/]);
  const account = acc ? acc[1].replace(/[\s-]/g, "") : null;
  const prem = near(hay, String.raw`Premise\s*(?:No\.?|Number|#)?`, String.raw`(\d(?:\s?\d){7,10})`);
  const premise = prem ? prem[1].replace(/\s/g, "") : null;
  const cust = first(t, [/(?:Customer|Consumer|Account)\s*Name\s*[:\-]?\s*([A-Za-z][A-Za-z .'&-]{2,60})/i, /^\s*(?:Mr|Mrs|Ms|M\/s)\.?\s+([A-Za-z][A-Za-z .'&-]{2,60})$/im]);
  const customerName = cust ? cust[1].trim().replace(/\s{2,}/g, " ") : null;

  // Billing month: the bill's own "Month" label first, then the end of the period, then the issue date.
  let period: string | null = null;
  const mon = near(t, String.raw`(?:Bill(?:ing)?\s*)?Month`, MONTH_YEAR);
  if (mon) period = monthOf(mon[1], mon[2]);
  if (!period) {
    const range = t.match(new RegExp(String.raw`(?:Bill(?:ing)?\s*Period|Period|Consumption\s*Period|From)\s*[:\-]?\s*${DATE}\s*(?:-|–|to|To|TO)\s*${DATE}`, "i"));
    if (range) period = parseDate(range[2])?.slice(0, 7) ?? null;
  }
  if (!period) {
    const issued = parseDate(near(t, String.raw`(?:Bill|Invoice|Issue)\s*Date`, DATE)?.[1]);
    if (issued) { const d = new Date(`${issued}T00:00:00`); d.setMonth(d.getMonth() - 1); period = iso8601(d).slice(0, 7); }
  }

  // Charges: "<x> total" lines are the most reliable; then a line starting with the utility name.
  const electricity = num(first(t, [
    new RegExp(String.raw`Electricity\s*total\s*[:\-]?\s*${AMT}`, "i"),
    new RegExp(String.raw`^\s*Electricity\s*(?:Charges?|Amount)?\s*[:\-]?\s*${AMT}\s*$`, "im"),
    new RegExp(String.raw`Electricity\s*(?:Charges?|Amount)\s*[:\-]?\s*${AMT}`, "i"),
  ])?.[1]);
  const water = num(first(t, [
    new RegExp(String.raw`Water\s*total\s*[:\-]?\s*${AMT}`, "i"),
    new RegExp(String.raw`^\s*Water\s*(?:Charges?|Amount)?\s*[:\-]?\s*${AMT}\s*$`, "im"),
    new RegExp(String.raw`Water\s*(?:Charges?|Amount)\s*[:\-]?\s*${AMT}`, "i"),
  ])?.[1]);
  // This bill's own total. "Total Due" usually adds earlier balances, so it is the last resort.
  const total = num(
    near(t, String.raw`Current\s*(?:month|bill)\s*(?:total|amount|charges?)`, AMT)?.[1]
    ?? near(t, String.raw`(?:Total\s*Bill\s*Amount|Total\s*Current\s*Charges)`, AMT)?.[1]
    ?? near(t, String.raw`(?:Total\s*(?:Amount\s*)?(?:Due|Payable)(?:\s*\([^)]*\))?|Amount\s*(?:Due|Payable))`, AMT)?.[1],
  );
  const dueDate = parseDate(near(t, String.raw`(?:Due\s*(?:Date|before|by|on)|Pay(?:ment)?\s*(?:Due\s*)?By|Last\s*Date\s*(?:of|for)\s*Payment)`, DATE)?.[1]);

  const paid = first(t, [new RegExp(String.raw`(?:Payments?\s*Received|Last\s*Payment(?:\s*Received)?|Paid\s*Amount|Payment\s*-?\s*Thank\s*you)[^\d\n]{0,30}?${AMT}(?:[^\n]*?(?:on|dated?)\s*${DATE})?`, "i")]);
  const paidAmount = paid ? num(paid[1]) : null;
  const paidOn = paid ? parseDate(paid[2]) : null;

  const missing: string[] = [];
  if (!provider) missing.push("provider");
  if (!account) missing.push("account number");
  if (!period) missing.push("billing month");
  if (!electricity && !water && !total) missing.push("amount");
  return {
    provider, account, premise, customerName, text: t, period,
    electricity: electricity || null, water: water || null, total, dueDate,
    paidAmount: paidAmount || null, paidOn, finalBill: /\bFinal\s+Bill\b/i.test(t),
    missing, textFound: t.length > 20,
  };
}
