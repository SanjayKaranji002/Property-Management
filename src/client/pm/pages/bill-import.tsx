import { useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, FileText, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { readBill, type ParsedBill } from "../bills";
import { aed, aedExact, fmtDate, PROVIDER_BY_EMIRATE, today, UTIL_LABEL, type Contract, type UtilityBill, type UtilityType, iso8601 } from "../data";
import { useStore, type Store } from "../store";
import { Modal, NSelect, Pill } from "../ui";

/** One file in the import, after reading and matching, editable before saving. */
interface Row {
  key: string; file: File; url: string; status: "reading" | "ready";
  parsed: ParsedBill | null;
  contractId: number | null;
  /** How the tenancy was found; null = chosen by hand. */
  matchedBy: "premise" | "account" | "name" | "property" | "group" | null;
  /** A best guess from the bill's text that someone should confirm. */
  suggested: boolean;
  /** Why there is no match / where the match came from. */
  note: string;
  provider: string; period: string;
  electricity: number; water: number; total: number; dueDate: string;
  paidAmount: number; paidOn: string;
  skip: boolean;
  /** The bill was settled before import: save it as Paid straight away. */
  alreadyPaid: boolean; alreadyPaidOn: string;
  open: "" | "details" | "text";
}

const month = (p: string) => (p ? new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** First and last day of a YYYY-MM month. */
const monthRange = (p: string | null | undefined): [string, string] | null =>
  p ? [`${p}-01`, iso8601(new Date(+p.slice(0, 4), +p.slice(5, 7), 0))] : null;

/**
 * The tenancy of a property running during the bill's month (sub-lets excluded).
 * If a move-out and a move-in fall in the same month, the newer tenancy is used.
 */
function tenancyDuring(s: Store, propertyId: number, period: string | null | undefined): Contract | undefined {
  const r = monthRange(period);
  return s.contracts
    .filter((c) => c.property_id === propertyId && c.role !== "sub_tenant" && c.approval !== "draft")
    .filter((c) => (r ? c.start_date <= r[1] && c.end_date >= r[0] : c.status === "active"))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}

type Match = { contract: Contract | null; by: Row["matchedBy"]; sure: boolean; note: string } | null;

/**
 * Find the tenancy a bill belongs to, strongest evidence first:
 *  1. premise number → the property → the tenancy running that month (premise numbers never change)
 *  2. account number → the tenancy with that account (accounts change with each tenant)
 *  3. a suggestion from the bill's text (tenant name, building, unit) to confirm with one click
 */
function matchContract(s: Store, p: ParsedBill): Match {
  const r = monthRange(p.period);
  const inMonth = (c: Contract) => (r ? c.start_date <= r[1] && c.end_date >= r[0] : c.status === "active");

  for (const key of [p.premise, p.account]) {
    if (!key) continue;
    const prop = s.properties.find((x) => x.dewa_premise_no && x.dewa_premise_no.replace(/\s/g, "") === key);
    if (!prop) continue;
    const c = tenancyDuring(s, prop.id, p.period);
    return c
      ? { contract: c, by: "premise", sure: true, note: "" }
      : { contract: null, by: null, sure: false, note: `Premise ${key} is ${s.propLabel(prop.id)}, but it had no tenancy in ${month(p.period ?? "")}.` };
  }

  if (p.account) {
    const withAcc = s.contracts.filter((x) => x.dewa_account === p.account);
    const c = withAcc.filter(inMonth).sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? (withAcc.length === 1 ? withAcc[0] : undefined);
    if (c) return { contract: c, by: "account", sure: true, note: "" };
  }

  // Suggestion: score each tenancy running that month by what the bill's text mentions.
  const text = ` ${norm(`${p.customerName ?? ""} ${p.text}`)} `;
  const has = (w: string) => w.length > 1 && text.includes(` ${norm(w)} `);
  let best: { c: Contract; score: number; by: "name" | "property" } | null = null, tie = false;
  for (const c of s.contracts.filter((x) => inMonth(x) && x.role !== "sub_tenant")) {
    const t = s.tenant(c.tenant_id); const pr = s.property(c.property_id);
    let score = 0, by: "name" | "property" = "property";
    if (t && has(`${t.first_name} ${t.last_name}`)) { score += 3; by = "name"; } else if (t && t.last_name.length > 3 && has(t.last_name)) score += 1;
    if (pr && has(pr.name)) score += 2;
    if (pr && has(pr.unit_no)) score += 1;
    if (score < 2) continue;
    if (!best || score > best.score) { best = { c, score, by }; tie = false; } else if (score === best.score) tie = true;
  }
  if (best && !tie) return { contract: best.c, by: best.by, sure: false, note: "" };
  return null;
}

/** The charges a bill becomes: separate electricity and water lines when the bill splits them. */
function chargesFor(r: Row): { type: UtilityType; amount: number }[] {
  if (r.electricity > 0 || r.water > 0) return [
    ...(r.electricity > 0 ? [{ type: "electricity" as const, amount: r.electricity }] : []),
    ...(r.water > 0 ? [{ type: "water" as const, amount: r.water }] : []),
  ];
  return r.total > 0 ? [{ type: "combined", amount: r.total }] : [];
}

function duplicateOf(s: Store, r: Row) {
  return chargesFor(r).filter((ch) => s.utilities.some((u) => u.contract_id === r.contractId && u.period === r.period && u.type === ch.type));
}

/**
 * Applies a payment shown on a newer bill to the earlier unpaid bills of the
 * same tenancy, oldest first. A bill is only marked paid when fully covered.
 */
export function settleFromNextBill(s: Store, contractId: number, beforePeriod: string, amount: number, paidOn: string, ref: string) {
  let left = amount;
  const settled: UtilityBill[] = [];
  const open = s.utilities.filter((u) => u.contract_id === contractId && u.status === "unpaid" && u.period < beforePeriod).sort((a, b) => a.period.localeCompare(b.period));
  for (const u of open) {
    if (left + 0.5 < u.amount) break;
    left -= u.amount;
    const paid: UtilityBill = { ...u, status: "paid", paid_on: paidOn, paid_method: "Paid to provider (shown on next bill)", paid_ref: ref, paid_by: "Automatic (bill import)" };
    s.saveUtility(paid);
    settled.push(paid);
  }
  return settled;
}

const MATCH_LABEL: Record<NonNullable<Row["matchedBy"]>, string> = {
  premise: "matched by premise number (tenancy running that month)", account: "matched by account number",
  name: "matched by tenant name on the bill", property: "matched by building and unit on the bill", group: "same number as another bill in this import",
};

export function BillImportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const tenancies = s.contracts.filter((c) => c.status === "active" || c.status === "closed")
    .sort((a, b) => s.propLabel(a.property_id).localeCompare(s.propLabel(b.property_id)));

  async function add(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.size <= 10 * 1024 * 1024);
    const fresh: Row[] = files.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`, file, url: "", status: "reading", parsed: null, contractId: null, matchedBy: null, suggested: false, note: "",
      provider: "", period: "", electricity: 0, water: 0, total: 0, dueDate: "", paidAmount: 0, paidOn: "", skip: false, alreadyPaid: false, alreadyPaidOn: "", open: "",
    }));
    setRows((r) => [...r, ...fresh]);
    for (const row of fresh) {
      const [p, url] = await Promise.all([readBill(row.file), new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(row.file); })]);
      const m = matchContract(s, p);
      const c = m?.contract;
      const provider = p.provider ?? (c ? PROVIDER_BY_EMIRATE[s.property(c.property_id)?.emirate ?? ""] ?? "" : "");
      const total = p.total ?? (p.electricity ?? 0) + (p.water ?? 0);
      setRows((rs) => rs.map((r) => (r.key !== row.key ? r : {
        ...r, status: "ready", parsed: p, url, contractId: c?.id ?? null, matchedBy: m?.by ?? null, suggested: !!c && !m?.sure, note: m?.note ?? "", provider, period: p.period ?? "",
        electricity: p.electricity ?? 0, water: p.water ?? 0, total, dueDate: p.dueDate ?? "", paidAmount: p.paidAmount ?? 0, paidOn: p.paidOn ?? "",
        // Open the details straight away only when something has to be typed in.
        open: !p.textFound || !p.period || !total ? "details" : "",
      })));
    }
  }
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /**
   * Sets the tenancy for one bill, and for every other bill in this import
   * with the same account number (same tenant) or premise number (same
   * property, tenancy picked by each bill's month) that isn't settled yet.
   */
  function choose(key: string, contractId: number | null) {
    setRows((rs) => {
      const src = rs.find((x) => x.key === key)!;
      const c = contractId ? s.contract(contractId) : undefined;
      const acc = src.parsed?.account, prem = src.parsed?.premise;
      return rs.map((r) => {
        if (r.key === key) return { ...r, contractId, matchedBy: null, suggested: false, note: "" };
        if (!c || r.status !== "ready" || (r.contractId && !r.suggested)) return r;
        if (acc && r.parsed?.account === acc) return { ...r, contractId: c.id, matchedBy: "group", suggested: false, note: `Same account as ${src.file.name}` };
        if (prem && r.parsed?.premise === prem) {
          const t = tenancyDuring(s, c.property_id, r.period);
          if (t) return { ...r, contractId: t.id, matchedBy: "group", suggested: false, note: `Same premise as ${src.file.name}` };
        }
        return r;
      });
    });
  }
  const suggestions = rows.filter((r) => r.status === "ready" && !r.skip && r.suggested).length;

  const problems = (r: Row) => {
    const out: string[] = [];
    if (!r.contractId) out.push("Choose the tenancy");
    else if (r.suggested) out.push("Confirm the suggested tenancy");
    if (!r.period) out.push("Add the billing month");
    if (!chargesFor(r).length) out.push("Add the amount");
    if (r.contractId && r.period && chargesFor(r).length && duplicateOf(s, r).length === chargesFor(r).length) out.push("Already recorded");
    return out;
  };
  const ready = rows.filter((r) => r.status === "ready" && !r.skip && problems(r).length === 0);
  const reading = rows.some((r) => r.status === "reading");
  const needs = rows.filter((r) => r.status === "ready" && !r.skip && problems(r).length > 0).length;

  function confirm() {
    let charges = 0, settledCount = 0, paidCount = 0, learned = 0;
    for (const r of ready) {
      const dupTypes = new Set(duplicateOf(s, r).map((d) => d.type));
      for (const ch of chargesFor(r)) {
        if (dupTypes.has(ch.type)) continue;
        const bill = s.saveUtility({
          contract_id: r.contractId!, type: ch.type, period: r.period, amount: ch.amount, provider: r.provider || "Other", due_date: r.dueDate || undefined,
          ...(r.alreadyPaid
            ? { status: "paid" as const, paid_on: r.alreadyPaidOn || r.dueDate || today(), paid_method: "Already paid (marked at import)", paid_by: s.me.name }
            : { status: "unpaid" as const }),
        });
        if (r.alreadyPaid) paidCount++;
        s.saveDoc({ entity: "utility", entity_id: bill.id, category: "utility_bill", name: r.file.name, mime: r.file.type || "application/pdf", url: r.url, uploaded_on: today() });
        charges++;
      }
      // Learn: remember this bill's account number on the tenancy, so next month's bill matches by itself.
      const c = s.contract(r.contractId!);
      if (c && r.parsed?.account && c.dewa_account !== r.parsed.account && (!c.dewa_account || r.matchedBy !== "account")) {
        s.patchContract(c.id, { dewa_account: r.parsed.account });
        learned++;
      }
      // Learn the premise number on the property: it identifies every future bill for it, whoever the tenant is.
      const prop = c ? s.property(c.property_id) : undefined;
      if (prop && r.parsed?.premise && !prop.dewa_premise_no && !s.properties.some((x) => x.dewa_premise_no === r.parsed!.premise)) {
        s.saveProperty({ ...prop, dewa_premise_no: r.parsed.premise });
        learned++;
      }
      if (r.paidAmount > 0) settledCount += settleFromNextBill(s, r.contractId!, r.period, r.paidAmount, r.paidOn || today(), `${r.provider} bill ${month(r.period)}`).length;
    }
    s.notify("Bills imported", [`${charges} charge${charges === 1 ? "" : "s"} added`, paidCount && `${paidCount} already paid`, settledCount && `${settledCount} earlier bills marked paid`, learned && `${learned} account/premise number${learned === 1 ? "" : "s"} saved for next time`].filter(Boolean).join(" · "));
    onClose();
  }

  return (
    <Modal wide open onClose={onClose} title="Import utility bills"
      footer={<>
        <span className="mr-auto self-center text-xs text-muted-foreground">{rows.length ? `${ready.length} ready${needs ? ` · ${needs} need${needs === 1 ? "s" : ""} attention` : ""}` : ""}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!ready.length || reading} onClick={confirm}>{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Import {ready.length || ""} bill{ready.length === 1 ? "" : "s"}</Button>
      </>}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void add(e.dataTransfer.files); }}
        className={cn("flex flex-wrap items-center gap-3 rounded-[1.25rem] border-2 border-dashed transition-colors", rows.length ? "px-4 py-3" : "flex-col p-8 text-center", dragging ? "border-[#1f3d2b] bg-muted" : "border-border")}>
        <FileUp className="h-6 w-6 text-muted-foreground" />
        <div className={cn("text-sm", rows.length && "flex-1")}>{rows.length ? "Drop more bills here" : "Drop this month's DEWA, ADDC, SEWA or Etihad WE bills here (PDF), as many as you like"}</div>
        <input ref={ref} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>Choose files</Button>
        {!rows.length && <p className="text-xs text-muted-foreground">Each bill is read and matched to its tenancy. You only fill in what couldn't be read.</p>}
      </div>

      {suggestions > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e2c58f] bg-[#fbf6ec] px-4 py-2.5 text-sm dark:bg-[#2a2519]">
          <span className="flex-1">{suggestions} bill{suggestions === 1 ? " has a" : "s have"} suggested tenanc{suggestions === 1 ? "y" : "ies"} — check them, then accept.</span>
          <Button size="sm" onClick={() => setRows((rs) => rs.map((r) => (r.suggested ? { ...r, suggested: false } : r)))}><Check className="h-4 w-4" />Accept all suggestions</Button>
        </div>)}
      {rows.length > 1 && (
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" checked={rows.every((r) => r.alreadyPaid)} onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, alreadyPaid: e.target.checked })))} />
          Mark all as already paid <span className="text-xs text-muted-foreground">— for old bills you know are settled</span>
        </label>)}

      {rows.length > 0 && (
        <div className="max-h-[55vh] space-y-2 overflow-auto pr-1">
          {rows.map((r) => {
            const issues = r.status === "ready" ? problems(r) : [];
            const ok = r.status === "ready" && !issues.length;
            const charges = chargesFor(r);
            const p = r.parsed;
            return (
              <div key={r.key} className={cn("rounded-2xl border bg-card p-4 text-sm transition-opacity", r.skip && "opacity-50", ok ? "border-border/70" : r.status === "ready" ? "border-[#e2c58f]" : "border-border/70")}>
                {/* Title */}
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium" title={r.file.name}>{r.file.name}</span>
                  {r.status === "reading" ? <Pill tone="gray"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Reading</Pill>
                    : r.skip ? <Pill tone="gray">Skipped</Pill>
                    : ok ? <Pill tone="green">{r.alreadyPaid ? "Ready · saved as Paid" : "Ready"}</Pill>
                    : <Pill tone={issues[0] === "Already recorded" ? "gray" : "amber"}>{issues[0]}</Pill>}
                  <button aria-label={`Remove ${r.file.name}`} className="rounded-full p-1 hover:bg-muted" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>

                {r.status === "ready" && <>
                  {/* What was read */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Fact ok={!!r.provider} label={r.provider || "Provider?"} />
                    <Fact ok={!!r.period} label={r.period ? month(r.period) : "Month?"} />
                    {charges.length ? charges.map((ch) => <Fact key={ch.type} ok label={`${UTIL_LABEL[ch.type]} ${aedExact(ch.amount)}`} />) : <Fact ok={false} label="Amount?" />}
                    {r.dueDate && <Fact ok label={`Due ${fmtDate(r.dueDate)}`} />}
                    {p?.account && <Fact ok label={`Acc. ${p.account}`} />}
                    {p?.finalBill && <Fact ok label="Final bill (move-out)" />}
                    {r.paidAmount > 0 && <Fact ok label={`Payment ${aedExact(r.paidAmount)}`} />}
                    {!p?.textFound && <span className="text-xs text-[#7a5a24]">This file has no readable text (scan or photo) — fill in the details below.</span>}
                  </div>

                  {/* Tenancy */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">Tenancy</span>
                    <NSelect className={cn("h-9 min-w-0 flex-1", (!r.contractId || r.suggested) && "border-[#e2c58f] bg-[#fbf6ec] dark:bg-[#2a2519]")} value={r.contractId ?? ""}
                      onChange={(v) => choose(r.key, v ? Number(v) : null)}
                      options={[{ value: "", label: "Choose the tenancy this bill is for…" }, ...tenancies.map((x) => ({ value: x.id, label: `${s.propLabel(x.property_id)} — ${s.tenantName(x.tenant_id)}${x.status !== "active" ? " (ended)" : ""}` }))]} />
                  </div>
                  <div className="ml-[4.5rem] mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {r.suggested
                      ? <><Pill tone="amber">Suggested</Pill><span>from the {r.matchedBy === "name" ? "tenant's name" : "building and unit"} on the bill — please check.</span>
                          <button className="font-medium text-[#1f3d2b] hover:underline dark:text-[#8fb89a]" onClick={() => choose(r.key, r.contractId)}>Confirm</button></>
                      : <span>{r.contractId
                          ? r.matchedBy === "group" ? `✓ ${r.note}` : r.matchedBy ? `✓ ${MATCH_LABEL[r.matchedBy]}` : (p?.premise || p?.account) ? "Chosen by hand — the bill's premise/account number will be remembered, and other bills with the same number in this import are filled in too." : "Chosen by hand."
                          : r.note || (p?.premise || p?.account ? `No property or tenancy has ${p?.premise ? `premise ${p.premise}` : `account ${p?.account}`} yet. Choose one once and it will be remembered.` : "The account and premise numbers couldn't be read from this bill.")}</span>}
                  </div>

                  {/* Options */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-3 text-xs">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.alreadyPaid} onChange={(e) => update(r.key, { alreadyPaid: e.target.checked })} />Already paid</label>
                    {r.alreadyPaid && <label className="flex items-center gap-1.5 text-muted-foreground">on <Input type="date" className="h-7 w-36 text-xs" value={r.alreadyPaidOn} onChange={(e) => update(r.key, { alreadyPaidOn: e.target.value })} /></label>}
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={r.skip} onChange={(e) => update(r.key, { skip: e.target.checked })} />Skip this bill</label>
                    <span className="flex-1" />
                    <Toggle open={r.open === "details"} onClick={() => update(r.key, { open: r.open === "details" ? "" : "details" })}>Edit details</Toggle>
                    {p?.textFound && <Toggle open={r.open === "text"} onClick={() => update(r.key, { open: r.open === "text" ? "" : "text" })}>What was read</Toggle>}
                  </div>

                  {r.open === "details" && (
                    <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-3 sm:grid-cols-3">
                      <Labeled label="Provider"><NSelect className="h-9" value={r.provider} onChange={(v) => update(r.key, { provider: v })} options={["", "DEWA", "ADDC", "AADC", "SEWA", "Etihad WE", "Other"].map((x) => ({ value: x, label: x || "—" }))} /></Labeled>
                      <Labeled label="Billing month"><Input type="month" className="h-9" value={r.period} onChange={(e) => update(r.key, { period: e.target.value })} /></Labeled>
                      <Labeled label="Due date"><Input type="date" className="h-9" value={r.dueDate} onChange={(e) => update(r.key, { dueDate: e.target.value })} /></Labeled>
                      <Labeled label="Electricity (AED)"><Input type="number" className="h-9" value={r.electricity || ""} onChange={(e) => update(r.key, { electricity: Number(e.target.value) })} /></Labeled>
                      <Labeled label="Water (AED)"><Input type="number" className="h-9" value={r.water || ""} onChange={(e) => update(r.key, { water: Number(e.target.value) })} /></Labeled>
                      <Labeled label="Total (if not split)"><Input type="number" className="h-9" value={r.total || ""} disabled={r.electricity > 0 || r.water > 0} onChange={(e) => update(r.key, { total: Number(e.target.value) })} /></Labeled>
                      <Labeled label="Payment shown on bill"><Input type="number" className="h-9" value={r.paidAmount || ""} onChange={(e) => update(r.key, { paidAmount: Number(e.target.value) })} /></Labeled>
                      <Labeled label="Payment date"><Input type="date" className="h-9" value={r.paidOn} onChange={(e) => update(r.key, { paidOn: e.target.value })} /></Labeled>
                    </div>)}
                  {r.open === "text" && p && (
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">{p.text || "(no text)"}</pre>)}

                  {r.contractId && r.paidAmount > 0 && <PaymentPreview s={s} row={r} />}
                  {issues.length > 1 && <p className="mt-2 flex items-center gap-1 text-xs text-[#7a5a24]"><AlertTriangle className="h-3.5 w-3.5" />Still needed: {issues.join(", ").toLowerCase()}</p>}
                </>}
              </div>);
          })}
        </div>)}
    </Modal>
  );
}

function Fact({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs", ok ? "bg-[#e6ede6] text-[#1f3d2b] dark:bg-[#2b3a30] dark:text-[#cfe3d3]" : "bg-[#f3e8d3] text-[#7a5a24] dark:bg-[#3a3122] dark:text-[#e2c58f]")}>
      {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{label}
    </span>
  );
}

function Toggle({ open, onClick, children }: { open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
      {children}<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="text-[11px] text-muted-foreground">{label}</span>{children}</label>;
}

function PaymentPreview({ s, row }: { s: Store; row: Row }) {
  let left = row.paidAmount;
  const covered = s.utilities.filter((u) => u.contract_id === row.contractId && u.status === "unpaid" && u.period < row.period)
    .sort((a, b) => a.period.localeCompare(b.period))
    .filter((u) => { if (left + 0.5 < u.amount) { left = -Infinity; return false; } left -= u.amount; return true; });
  return (
    <p className="mt-2 text-xs text-[#1f3d2b] dark:text-[#8fb89a]">
      {covered.length
        ? `Payment of ${aed(row.paidAmount)}${row.paidOn ? ` on ${fmtDate(row.paidOn)}` : ""} will mark earlier bills paid: ${covered.map((u) => `${UTIL_LABEL[u.type]} ${month(u.period)} (${aed(u.amount)})`).join(", ")}`
        : `Payment of ${aed(row.paidAmount)} found, but it doesn't fully cover an earlier unpaid bill for this tenancy.`}
    </p>
  );
}
