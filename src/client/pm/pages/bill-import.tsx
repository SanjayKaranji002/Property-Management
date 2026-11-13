import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { readBill, type ParsedBill } from "../bills";
import { aed, fmtDate, PROVIDER_BY_EMIRATE, today, UTIL_LABEL, type Contract, type UtilityBill, type UtilityType } from "../data";
import { useStore, type Store } from "../store";
import { Modal, NSelect, Pill } from "../ui";

/** One file in the import, after reading and matching, editable before saving. */
interface Row {
  key: string; file: File; url: string; status: "reading" | "ready";
  parsed: ParsedBill | null;
  contractId: number | null; provider: string; period: string;
  electricity: number; water: number; total: number; dueDate: string;
  paidAmount: number; paidOn: string;
  skip: boolean;
}

const month = (p: string) => (p ? new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—");

/** Find the tenancy a bill belongs to: the utility account number, then the premise number. */
function matchContract(s: Store, p: ParsedBill): Contract | undefined {
  if (!p.account) return undefined;
  const byAccount = s.contracts.filter((c) => c.dewa_account && c.dewa_account === p.account);
  const byPremise = s.contracts.filter((c) => s.property(c.property_id)?.dewa_premise_no === p.account);
  const all = byAccount.length ? byAccount : byPremise;
  return all.find((c) => c.status === "active") ?? all[0];
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

export function BillImportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const active = s.contracts.filter((c) => c.status === "active" || c.status === "closed");

  async function add(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.size <= 10 * 1024 * 1024);
    const fresh: Row[] = files.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`, file, url: "", status: "reading", parsed: null,
      contractId: null, provider: "", period: "", electricity: 0, water: 0, total: 0, dueDate: "", paidAmount: 0, paidOn: "", skip: false,
    }));
    setRows((r) => [...r, ...fresh]);
    for (const row of fresh) {
      const [p, url] = await Promise.all([readBill(row.file), new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(row.file); })]);
      const c = matchContract(s, p);
      const provider = p.provider ?? (c ? PROVIDER_BY_EMIRATE[s.property(c.property_id)?.emirate ?? ""] ?? "" : "");
      setRows((rs) => rs.map((r) => (r.key !== row.key ? r : {
        ...r, status: "ready", parsed: p, url, contractId: c?.id ?? null, provider, period: p.period ?? "",
        electricity: p.electricity ?? 0, water: p.water ?? 0, total: p.total ?? (p.electricity ?? 0) + (p.water ?? 0), dueDate: p.dueDate ?? "",
        paidAmount: p.paidAmount ?? 0, paidOn: p.paidOn ?? "",
      })));
    }
  }
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const problems = (r: Row) => {
    const out: string[] = [];
    if (!r.contractId) out.push("No tenancy matched");
    if (!r.period) out.push("Billing month missing");
    if (!chargesFor(r).length) out.push("Amount missing");
    if (r.contractId && r.period && duplicateOf(s, r).length === chargesFor(r).length && chargesFor(r).length) out.push("Already recorded");
    return out;
  };
  const ready = rows.filter((r) => r.status === "ready" && !r.skip && problems(r).length === 0);
  const reading = rows.some((r) => r.status === "reading");

  function confirm() {
    let charges = 0, settledCount = 0;
    for (const r of ready) {
      const dupTypes = new Set(duplicateOf(s, r).map((d) => d.type));
      for (const ch of chargesFor(r)) {
        if (dupTypes.has(ch.type)) continue;
        const bill = s.saveUtility({ contract_id: r.contractId!, type: ch.type, period: r.period, amount: ch.amount, status: "unpaid", provider: r.provider || "Other", due_date: r.dueDate || undefined });
        s.saveDoc({ entity: "utility", entity_id: bill.id, category: "utility_bill", name: r.file.name, mime: r.file.type || "application/pdf", url: r.url, uploaded_on: today() });
        charges++;
      }
      if (r.paidAmount > 0) settledCount += settleFromNextBill(s, r.contractId!, r.period, r.paidAmount, r.paidOn || today(), `${r.provider} bill ${month(r.period)}`).length;
    }
    s.notify("Bills imported", `${charges} charges added${settledCount ? ` · ${settledCount} earlier bills marked paid` : ""}`);
    onClose();
  }

  return (
    <Modal wide open onClose={onClose} title="Import utility bills"
      footer={<>
        <span className="mr-auto self-center text-xs text-muted-foreground">{rows.length ? `${ready.length} of ${rows.length} ready` : ""}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!ready.length || reading} onClick={confirm}>{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm {ready.length} bill{ready.length === 1 ? "" : "s"}</Button>
      </>}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void add(e.dataTransfer.files); }}
        className={cn("flex flex-col items-center gap-2 rounded-[1.25rem] border-2 border-dashed p-6 text-center transition-colors", dragging ? "border-[#1f3d2b] bg-muted" : "border-border")}>
        <FileUp className="h-6 w-6 text-muted-foreground" />
        <div className="text-sm">Drop this month's DEWA, ADDC, SEWA or Etihad WE bills here (PDF), as many as you like</div>
        <input ref={ref} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>Choose files</Button>
        <p className="text-xs text-muted-foreground">Each bill is read, matched to its tenancy by account number, and checked against bills already recorded. A payment shown on a bill marks the earlier bills paid.</p>
      </div>

      {rows.length > 0 && (
        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {rows.map((r) => {
            const issues = r.status === "ready" ? problems(r) : [];
            const c = r.contractId ? s.contract(r.contractId) : undefined;
            return (
              <div key={r.key} className={cn("rounded-2xl border p-3 text-sm", r.skip ? "opacity-50" : "", issues.length ? "border-[#e8c9bb] bg-[#fbf3ef] dark:border-[#5a3a30] dark:bg-[#2a1f1b]" : "border-border/70 bg-card")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.file.name}</span>
                  {r.status === "reading" ? <Pill tone="gray"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Reading</Pill>
                    : !r.parsed?.textFound ? <Pill tone="amber">No text — fill in by hand</Pill>
                    : issues.length ? <Pill tone="red">{issues[0]}</Pill> : <Pill tone="green">Ready</Pill>}
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={r.skip} onChange={(e) => update(r.key, { skip: e.target.checked })} />Skip</label>
                  <button aria-label={`Remove ${r.file.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                {r.status === "ready" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-6">
                    <label className="sm:col-span-3"><span className="text-[11px] text-muted-foreground">Tenancy {r.parsed?.account ? `(account ${r.parsed.account})` : ""}</span>
                      <NSelect className="h-8" value={r.contractId ?? ""} onChange={(v) => update(r.key, { contractId: v ? Number(v) : null })}
                        options={[{ value: "", label: "Choose tenancy…" }, ...active.map((x) => ({ value: x.id, label: `${s.propLabel(x.property_id)} — ${s.tenantName(x.tenant_id)} (acc. ${x.dewa_account || "—"})` }))]} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Provider</span>
                      <NSelect className="h-8" value={r.provider} onChange={(v) => update(r.key, { provider: v })} options={["", "DEWA", "ADDC", "AADC", "SEWA", "Etihad WE", "Other"].map((p) => ({ value: p, label: p || "—" }))} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Month</span><Input type="month" className="h-8" value={r.period} onChange={(e) => update(r.key, { period: e.target.value })} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Due date</span><Input type="date" className="h-8" value={r.dueDate} onChange={(e) => update(r.key, { dueDate: e.target.value })} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Electricity (AED)</span><Input type="number" className="h-8" value={r.electricity || ""} onChange={(e) => update(r.key, { electricity: Number(e.target.value) })} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Water (AED)</span><Input type="number" className="h-8" value={r.water || ""} onChange={(e) => update(r.key, { water: Number(e.target.value) })} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Total if not split</span><Input type="number" className="h-8" value={r.total || ""} disabled={r.electricity > 0 || r.water > 0} onChange={(e) => update(r.key, { total: Number(e.target.value) })} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Payment on bill</span><Input type="number" className="h-8" value={r.paidAmount || ""} onChange={(e) => update(r.key, { paidAmount: Number(e.target.value) })} /></label>
                    <label><span className="text-[11px] text-muted-foreground">Paid on</span><Input type="date" className="h-8" value={r.paidOn} onChange={(e) => update(r.key, { paidOn: e.target.value })} /></label>
                    <div className="flex items-end text-xs text-muted-foreground sm:col-span-1">{chargesFor(r).map((ch) => `${UTIL_LABEL[ch.type]} ${aed(ch.amount)}`).join(" + ")}</div>
                    {c && r.paidAmount > 0 && <PaymentPreview s={s} row={r} />}
                    {issues.length > 0 && <p className="flex items-center gap-1 text-xs text-[#9a3f22] sm:col-span-6"><AlertTriangle className="h-3.5 w-3.5" />{issues.join(" · ")}{r.parsed?.missing.length ? ` · Could not read: ${r.parsed.missing.join(", ")}` : ""}</p>}
                  </div>)}
              </div>);
          })}
        </div>)}
      <p className="text-xs text-muted-foreground">Text PDFs (the e-bills providers email) are read automatically. Scanned bills and photos need the amounts typed in until an OCR reader is added on the backend.</p>
    </Modal>
  );
}

function PaymentPreview({ s, row }: { s: Store; row: Row }) {
  let left = row.paidAmount;
  const covered = s.utilities.filter((u) => u.contract_id === row.contractId && u.status === "unpaid" && u.period < row.period)
    .sort((a, b) => a.period.localeCompare(b.period))
    .filter((u) => { if (left + 0.5 < u.amount) { left = -Infinity; return false; } left -= u.amount; return true; });
  return (
    <p className="text-xs text-[#1f3d2b] dark:text-[#8fb89a] sm:col-span-6">
      {covered.length
        ? `Payment of ${aed(row.paidAmount)}${row.paidOn ? ` on ${fmtDate(row.paidOn)}` : ""} will mark paid: ${covered.map((u) => `${UTIL_LABEL[u.type]} ${month(u.period)} (${aed(u.amount)})`).join(", ")}`
        : `Payment of ${aed(row.paidAmount)} found, but it doesn't fully cover any earlier unpaid bill for this tenancy.`}
    </p>
  );
}
