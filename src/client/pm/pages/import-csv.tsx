import { useRef, useState } from "react";
import { Download, FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addMonthsIso, EMIRATES, FREQUENCIES, iso8601, type Contract, type Frequency, type Landlord, type Property, type Tenant } from "../data";
import { useStore, type Store } from "../store";
import { Modal, NSelect, Pill } from "../ui";

// ── CSV import (properties, landlords, tenants, agreements) ───────────
// One file per kind. Each row is checked before anything is saved; rows with
// errors are listed and skipped, valid rows are created on "Import".

type Kind = "landlords" | "properties" | "tenants" | "agreements";
type CsvRow = Record<string, string>;

const SPEC: Record<Kind, { label: string; required: string[]; optional: string[]; example: string[] }> = {
  landlords: {
    label: "Landlords",
    required: ["name"],
    optional: ["email", "phone", "nationality", "emirates_id", "passport_no"],
    example: ["Ahmed Al Mansoori", "ahmed@example.ae", "+971501112233", "Emirati", "784-1975-1234567-1", "A1234567"],
  },
  properties: {
    label: "Properties & units",
    required: ["building", "unit", "landlord", "emirate", "annual_rent"],
    optional: ["usage", "type", "community", "bedrooms", "size_sqft", "status", "title_deed_no", "dewa_premise_no"],
    example: ["Marina Heights", "1204", "Ahmed Al Mansoori", "Dubai", "120000", "residential", "Apartment", "Dubai Marina", "2", "1250", "rented", "TD-100201", "681234501"],
  },
  tenants: {
    label: "Tenants",
    required: ["first_name", "last_name", "phone"],
    optional: ["email", "nationality", "emirates_id", "emirates_id_expiry", "passport_no", "passport_expiry"],
    example: ["Omar", "Haddad", "+971501234567", "omar@example.com", "Jordanian", "784-1990-1111111-1", "2027-07-01", "N1122334", "2029-01-01"],
  },
  agreements: {
    label: "Rental agreements",
    required: ["building", "unit", "tenant", "start_date", "end_date", "annual_rent", "payments"],
    optional: ["ejari_no", "deposit", "usage", "dewa_account"],
    example: ["Marina Heights", "1204", "Omar Haddad", "2026-01-17", "2027-01-16", "120000", "4", "EJ-2026001", "6000", "residential", "2031000007"],
  },
};

/** RFC-4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const key = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
/** Accepts 2027-01-31, 31/01/2027 and 31-01-2027 (day first, as in the UAE). */
const toIso = (s: string) => { const v = s.trim(); if (isDate(v)) return v; const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); return m ? iso8601(new Date(+m[3], +m[2] - 1, +m[1])) : v; };
const money = (s: string | undefined) => Number((s ?? "").replace(/[, ]|AED/gi, ""));

/** Checks one row; returns its errors (empty = will be imported). */
function check(s: Store, kind: Kind, r: CsvRow, seen: Set<string>): string[] {
  const e: string[] = SPEC[kind].required.filter((k) => !r[k]?.trim()).map((k) => `missing ${k}`);
  if (e.length) return e;
  const dup = (k: string, msg: string) => { if (seen.has(k)) e.push(`${msg} twice in file`); seen.add(k); };
  if (kind === "landlords") {
    dup(norm(r.name), "landlord");
    if (s.landlords.some((l) => norm(l.name) === norm(r.name))) e.push("already exists");
  }
  if (kind === "properties") {
    dup(`${norm(r.building)}|${norm(r.unit)}`, "unit");
    if (s.properties.some((p) => norm(p.name) === norm(r.building) && norm(p.unit_no) === norm(r.unit))) e.push("already exists");
    if (!EMIRATES.some((x) => norm(x) === norm(r.emirate))) e.push(`unknown emirate "${r.emirate}"`);
    if (!(money(r.annual_rent) > 0)) e.push("annual_rent not a number");
    if (r.usage && !["residential", "commercial"].includes(norm(r.usage))) e.push("usage must be residential or commercial");
    if (r.status && !["rented", "occupied", "vacant"].includes(norm(r.status))) e.push("status must be rented, occupied or vacant");
  }
  if (kind === "tenants") {
    dup(norm(r.emirates_id) || `${norm(r.first_name)} ${norm(r.last_name)}`, "tenant");
    if (r.emirates_id && s.tenants.some((t) => norm(t.emirates_id) === norm(r.emirates_id))) e.push("Emirates ID already exists");
    for (const d of ["emirates_id_expiry", "passport_expiry"]) if (r[d] && !isDate(toIso(r[d]))) e.push(`${d} not a date`);
  }
  if (kind === "agreements") {
    dup(`${norm(r.building)}|${norm(r.unit)}|${norm(r.start_date)}`, "agreement");
    if (!findProperty(s, r)) e.push("property not found (import properties first)");
    if (!findTenant(s, r.tenant)) e.push(`tenant "${r.tenant}" not found (import tenants first)`);
    if (!isDate(toIso(r.start_date)) || !isDate(toIso(r.end_date))) e.push("dates must be YYYY-MM-DD or DD/MM/YYYY");
    if (!(money(r.annual_rent) > 0)) e.push("annual_rent not a number");
    if (!FREQUENCIES.some((f) => f.payments === Number(r.payments))) e.push("payments must be 1, 2, 4 or 12");
    const p = findProperty(s, r);
    if (p && isDate(toIso(r.start_date)) && isDate(toIso(r.end_date))) {
      const clash = s.overlapFor({ property_id: p.id, start_date: toIso(r.start_date), end_date: toIso(r.end_date), role: "direct" });
      if (clash) e.push(clash);
    }
  }
  return e;
}

const findProperty = (s: Store, r: CsvRow) => s.properties.find((p) => norm(p.name) === norm(r.building) && norm(p.unit_no) === norm(r.unit));
const findTenant = (s: Store, name: string) => s.tenants.find((t) => norm(`${t.first_name} ${t.last_name}`) === norm(name));

/** Creates the records for the valid rows. Returns how many were created. */
function importRows(s: Store, kind: Kind, rows: CsvRow[]): number {
  let n = 0;
  const landlordIds = new Map(s.landlords.map((l) => [norm(l.name), l.id]));
  for (const r of rows) {
    if (kind === "landlords") {
      s.saveLandlord({ name: r.name.trim(), email: r.email ?? "", phone: r.phone ?? "", nationality: r.nationality || "Other", emirates_id: r.emirates_id ?? "", passport_no: r.passport_no ?? "", own_portfolio: false } as Omit<Landlord, "id">);
    }
    if (kind === "properties") {
      // An unknown landlord is created on the fly so the property is never orphaned.
      let lid = landlordIds.get(norm(r.landlord));
      if (!lid) { lid = s.saveLandlord({ name: r.landlord.trim(), email: "", phone: "", nationality: "Other", emirates_id: "", passport_no: "", own_portfolio: false }).id; landlordIds.set(norm(r.landlord), lid); }
      s.saveProperty({
        landlord_id: lid, name: r.building.trim(), unit_no: r.unit.trim(), usage: (norm(r.usage) || "residential") as Property["usage"], type: r.type || "Apartment",
        community: r.community ?? "", emirate: EMIRATES.find((x) => norm(x) === norm(r.emirate))!, title_deed_no: r.title_deed_no ?? "",
        bedrooms: Number(r.bedrooms) || 0, size_sqft: Number(r.size_sqft) || 0, rental_value: money(r.annual_rent),
        status: (norm(r.status) || "vacant") as Property["status"], dewa_premise_no: r.dewa_premise_no ?? "", broker_user_id: null,
      } as Omit<Property, "id">);
    }
    if (kind === "tenants") {
      s.saveTenant({
        first_name: r.first_name.trim(), last_name: r.last_name.trim(), email: r.email ?? "", phone: r.phone.trim(), nationality: r.nationality || "Other",
        emirates_id: r.emirates_id ?? "", emirates_id_expiry: r.emirates_id_expiry ? toIso(r.emirates_id_expiry) : "", passport_no: r.passport_no ?? "", passport_expiry: r.passport_expiry ? toIso(r.passport_expiry) : "",
        kyc_verified: false, driving_licence: "", driving_licence_expiry: "", kyc_status: "missing",
      } as Omit<Tenant, "id">);
    }
    if (kind === "agreements") {
      const p = findProperty(s, r)!; const t = findTenant(s, r.tenant)!;
      const start = toIso(r.start_date), end = toIso(r.end_date);
      const years = Math.max(1, Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / (365 * 86_400_000))) >= 2 ? 2 : 1;
      const rent = money(r.annual_rent);
      s.saveContract({
        property_id: p.id, tenant_id: t.id, usage: (norm(r.usage) || p.usage) as Contract["usage"], start_date: start, end_date: end, term_years: years as 1 | 2,
        annual_rent: rent, frequency: FREQUENCIES.find((f) => f.payments === Number(r.payments))!.value as Frequency, deposit: r.deposit ? money(r.deposit) : Math.round(rent * 0.05),
        role: "direct", parent_contract_id: null, ejari_no: r.ejari_no ?? "", status: end < iso8601(new Date()) ? "expired" : "active", approval: "approved",
        broker_fee: 0, other_charges: 0, prorate_first: false, custom_amounts: null,
        ejari_status: "not_registered", ejari_reg_date: r.ejari_no ? start : "", ejari_expiry: r.ejari_no ? end : "",
        dewa_account: r.dewa_account ?? "", dewa_status: r.dewa_account ? "active" : "not_linked", dewa_deposit_confirmed: !!r.dewa_account, move_in_date: start, closure: null, agreement_versions: 1,
      });
    }
    n++;
  }
  return n;
}

export function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("properties");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headErr, setHeadErr] = useState("");
  const spec = SPEC[kind];

  function load(text: string) {
    const grid = parseCsv(text);
    if (grid.length < 2) { setRows([]); setHeadErr("The file has no data rows."); return; }
    const head = grid[0].map(key);
    const missingCols = spec.required.filter((c) => !head.includes(c));
    setHeadErr(missingCols.length ? `Missing column${missingCols.length > 1 ? "s" : ""}: ${missingCols.join(", ")}. Download the template to see the expected columns.` : "");
    setRows(grid.slice(1).map((cells) => Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]))));
  }

  const seen = new Set<string>();
  const checked = headErr ? [] : rows.map((r) => ({ r, errors: check(s, kind, r, seen) }));
  const good = checked.filter((x) => !x.errors.length);
  const cols = [...spec.required, ...spec.optional].filter((c) => rows[0] && c in rows[0]).slice(0, 6);

  function template() {
    const csv = [[...spec.required, ...spec.optional].join(","), spec.example.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",")].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${kind}-template.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  function run() {
    const n = importRows(s, kind, good.map((x) => x.r));
    s.notify("Import complete", `${n} ${spec.label.toLowerCase()} imported${checked.length - n ? ` · ${checked.length - n} skipped` : ""}`);
    onClose();
  }

  return (
    <Modal wide open onClose={onClose} title="Import from CSV"
      footer={<>
        <span className="mr-auto self-center text-xs text-muted-foreground">{checked.length ? `${good.length} of ${checked.length} rows ready` : ""}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!good.length} onClick={run}><Upload className="h-4 w-4" />Import {good.length || ""} {spec.label.toLowerCase()}</Button>
      </>}>
      <div className="flex flex-wrap items-center gap-2">
        <NSelect className="w-52" value={kind} onChange={(v) => { setKind(v as Kind); setRows([]); setFileName(""); setHeadErr(""); }} options={(Object.keys(SPEC) as Kind[]).map((k) => ({ value: k, label: SPEC[k].label }))} />
        <Button variant="outline" onClick={template}><Download className="h-4 w-4" />Download template</Button>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setFileName(f.name); void f.text().then(load); e.target.value = ""; }} />
        <Button onClick={() => ref.current?.click()}><FileUp className="h-4 w-4" />Choose CSV file</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Required columns: <b>{spec.required.join(", ")}</b>. Optional: {spec.optional.join(", ")}.
        {kind === "agreements" && " Import landlords, properties and tenants first — agreements are matched to them by building + unit and tenant full name."}
        {kind === "properties" && " A landlord name that doesn't exist yet is created automatically."}
        {" "}Dates: YYYY-MM-DD or DD/MM/YYYY. Exports from Excel or Happy Tenant work if the column names match.
      </p>

      {headErr && <p className="rounded-2xl bg-[#f6e1d8] px-3 py-2 text-sm text-[#9a3f22]">{headErr}</p>}
      {checked.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{fileName}</span><Pill tone="green">{good.length} ready</Pill>{checked.length - good.length > 0 && <Pill tone="red">{checked.length - good.length} with errors (skipped)</Pill>}</div>
          <div className="max-h-[45vh] overflow-auto rounded-2xl border border-border/70">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground"><tr><th className="px-2 py-1.5 font-normal">#</th>{cols.map((c) => <th key={c} className="px-2 py-1.5 font-normal">{c}</th>)}<th className="px-2 py-1.5 font-normal">Check</th></tr></thead>
              <tbody className="divide-y divide-border/70">{checked.map(({ r, errors }, i) => (
                <tr key={i} className={cn(errors.length && "bg-[#fbf3ef] dark:bg-[#2a1f1b]")}>
                  <td className="px-2 py-1.5 text-muted-foreground">{i + 2}</td>
                  {cols.map((c) => <td key={c} className="max-w-40 truncate px-2 py-1.5">{r[c]}</td>)}
                  <td className="px-2 py-1.5">{errors.length ? <span className="text-[#9a3f22]">{errors.join("; ")}</span> : <span className="text-[#1f3d2b] dark:text-[#8fb89a]">OK</span>}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {checked.length - good.length > 0 && <p className="text-xs text-muted-foreground">Rows with errors are skipped. Fix them in the file and import it again — rows already imported will show "already exists".</p>}
        </div>)}
    </Modal>
  );
}
