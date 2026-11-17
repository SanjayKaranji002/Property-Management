// Reads utility bills (DEWA, ADDC, AADC, SEWA, Etihad WE) in the browser.
//
// Text PDFs (the e-bills providers email) are read with pdf.js; the details are
// then picked out by bills-parse.ts. Scanned bills and photos have no text
// layer: they come back empty and the person fills them in. Reading those
// needs OCR / an AI reader on the backend.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { parseBill, type ParsedBill } from "./bills-parse";

export { parseBill, parseDate, type ParsedBill } from "./bills-parse";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** The text of the first pages, one line per printed line. */
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

export async function readBill(file: File): Promise<ParsedBill> {
  try {
    return parseBill(await extractText(file), file.name);
  } catch {
    return { ...parseBill("", file.name), textFound: false };
  }
}
