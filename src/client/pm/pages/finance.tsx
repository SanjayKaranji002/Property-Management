import { useState, useRef } from "react";
import { Link2, Plus, Send, Paperclip, Upload, FileUp, Receipt as ReceiptIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aed, daysUntil, fmtDate, today, type Installment, type Receipt, type UtilityBill, PROVIDER_BY_EMIRATE, type Doc, UTIL_LABEL } from "../data";
import { Segmented } from "./contracts";
import { NotifyButton } from "./notify";
import { BillImportDialog } from "./bill-import";
import { PayBillButton, ReportPaymentDialog } from "./utility-pay";
import { useStore } from "../store";
import { L, useHref } from "../nav";
import { Field, Modal, NSelect, Page, Pill, SearchBox, Stat, Table, Td, attachUploads, DocViewer, PendingUploads, type PendingFile } from "../ui";

export const payLink = (i: Installment) => `${location.origin}/pay/${i.id}`;

export function PaymentsPage() {
  const s = useStore();
  const h = useHref();
  const [tab, setTab] = useState<"upcoming" | "overdue" | "paid" | "all" | "receipts">(() => (new URLSearchParams(location.search).get("tab") as "overdue") ?? "overdue");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<Installment | null>(null);
  const [linkFor, setLinkFor] = useState<Installment | null>(null);
  const visible = new Set(s.visibleProperties.map((p) => p.id));
  const active = s.installments.filter((i) => { const c = s.contract(i.contract_id); return c?.status === "active" && c.approval === "approved" && visible.has(c.property_id); });
  const rows = active.filter((i) => {
    const c = s.contract(i.contract_id)!;
    if (!`${s.propLabel(c.property_id)} ${s.tenantName(c.tenant_id)}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (tab === "overdue") return s.isOverdue(i);
    if (tab === "upcoming") return s.balance(i) > 0 && !s.isOverdue(i) && daysUntil(i.due_date) <= 60;
    if (tab === "paid") return i.paid > 0;
    return true;
  }).sort((a, b) => (tab === "paid" ? (b.paid_on ?? "").localeCompare(a.paid_on ?? "") : a.due_date.localeCompare(b.due_date)));
  const sum = (f: (i: Installment) => boolean, v: (i: Installment) => number) => active.filter(f).reduce((t, i) => t + v(i), 0);

  return (
    <Page title="Collections" meta="Receipts, clearance and outstanding balances · AED">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Overdue" value={aed(sum(s.isOverdue, s.balance))} tone="bad" sub={`${active.filter(s.isOverdue).length} instalments`} onClick={() => setTab("overdue")} active={tab === "overdue"} />
        <Stat label="Due in 30 days" value={aed(sum((i) => s.balance(i) > 0 && daysUntil(i.due_date) >= 0 && daysUntil(i.due_date) <= 30, s.balance))} tone="warn" onClick={() => setTab("upcoming")} active={tab === "upcoming"} />
        <Stat label="Received this month" value={aed(sum((i) => (i.paid_on ?? "").startsWith(today().slice(0, 7)), (i) => i.paid))} tone="good" onClick={() => setTab("paid")} active={tab === "paid"} />
        <Stat label="Total outstanding" value={aed(sum((i) => s.balance(i) > 0, s.balance))} onClick={() => setTab("all")} active={tab === "all"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: "overdue", label: "Overdue" }, { value: "upcoming", label: "Upcoming" }, { value: "paid", label: "Paid" }, { value: "all", label: "All instalments" }, { value: "receipts", label: `Receipts & cheques (${s.receipts.filter((r) => r.status === "received").length} to clear)` }]} />
        <div className="flex-1" /><SearchBox value={q} onChange={setQ} />
      </div>
      {tab === "receipts" ? <ReceiptsTable /> : <Table head={["Property", "Tenant", "#", "Due date", "Amount", "Cleared", "Balance", "Status", ""]} empty={!rows.length}>
        {rows.map((i) => { const c = s.contract(i.contract_id)!; const bal = s.balance(i); const d = daysUntil(i.due_date); return (
          <tr key={i.id}>
            <Td className="font-medium"><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L></Td><Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td><Td><L to={h.contract(c.id)}>#{i.no}</L></Td><Td>{fmtDate(i.due_date)}</Td>
            <Td className="tabular-nums">{aed(i.amount)}</Td><Td className="tabular-nums">{aed(i.paid)}{i.method && <div className="text-xs text-muted-foreground">{i.method}</div>}</Td><Td className="tabular-nums font-medium">{aed(bal)}</Td>
            <Td>{bal <= 0 ? <Pill tone="green">Paid</Pill> : s.receipts.some((r) => r.installment_id === i.id && r.status === "received") ? <Pill tone="blue">Cheque to clear</Pill> : i.paid > 0 ? <Pill tone="amber">Part-paid</Pill> : d < 0 ? <Pill tone="red">{-d}d overdue</Pill> : <Pill tone={d <= 7 ? "amber" : "gray"}>in {d}d</Pill>}</Td>
            <Td>{bal > 0 && s.can("payments", "edit") && <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setPaying(i)}>Record</Button>
              <Button size="sm" variant="ghost" onClick={() => setLinkFor(i)} aria-label="Payment link"><Link2 className="h-4 w-4" /></Button></div>}{bal > 0 && <div className="mt-1"><NotifyButton event={{ kind: "payment", installmentId: i.id }} /></div>}</Td>
          </tr>); })}
      </Table>}
      <RecordPayment inst={paying} onClose={() => setPaying(null)} />
      <PaymentLinkDialog inst={linkFor} onClose={() => setLinkFor(null)} />
    </Page>
  );
}

function RecordPayment({ inst, onClose }: { inst: Installment | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState({ amount: 0, method: "Cheque" as Receipt["method"], reference: "", bank: "", date: today() });
  const [last, setLast] = useState<unknown>(null);
  if (inst !== last) { setLast(inst); if (inst) setF({ amount: s.balance(inst), method: "Cheque", reference: "", bank: "", date: today() }); }
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const needsRef = f.method === "Cheque" || f.method === "Bank transfer";
  return (
    <Modal open={!!inst} onClose={onClose} title="Record receipt"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={f.amount <= 0 || (needsRef && !f.reference)} onClick={() => { s.addReceipt({ installment_id: inst!.id, ...f }); onClose(); }}>Record</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (AED)"><Input type="number" value={f.amount} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
        <Field label="Method"><NSelect value={f.method} onChange={(v) => set("method", v)} options={["Cheque", "Bank transfer", "Cash", "Card", "Payment link"]} /></Field>
        <Field label={f.method === "Cheque" ? "Cheque no." : "Reference"}><Input value={f.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
        <Field label="Bank"><Input value={f.bank} onChange={(e) => set("bank", e.target.value)} /></Field>
        <Field label={f.method === "Cheque" ? "Cheque date" : "Payment date"}><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">{f.method === "Cheque" ? "Cheques count as paid only once marked cleared." : "A partial amount leaves the rest of the instalment outstanding."}</p>
    </Modal>
  );
}

const R_TONE = { received: "blue", cleared: "green", bounced: "red", replaced: "gray" } as const;

function ReceiptsTable() {
  const s = useStore();
  const h = useHref();
  const [replacing, setReplacing] = useState<Receipt | null>(null);
  const [ref, setRef] = useState("");
  const rows = [...s.receipts].sort((a, b) => b.date.localeCompare(a.date));
  const fin = s.canApprove(9) || s.can("payments", "edit");
  return (
    <>
      <Table head={["Date", "Property / tenant", "#", "Method", "Reference", "Amount", "Status", ""]} empty={!rows.length}>
        {rows.map((r) => { const i = s.installments.find((x) => x.id === r.installment_id); const c = i && s.contract(i.contract_id); return (
          <tr key={r.id}>
            <Td>{fmtDate(r.date)}</Td>
            <Td>{c ? s.propLabel(c.property_id) : "—"}<div className="text-xs text-muted-foreground">{c ? s.tenantName(c.tenant_id) : ""}</div></Td>
            <Td>{c ? <L to={h.contract(c.id)}>#{i?.no}</L> : i?.no}</Td><Td>{r.method}</Td>
            <Td>{r.reference}<div className="text-xs text-muted-foreground">{r.bank}{r.replaces_id ? ` · replaces ${s.receipts.find((x) => x.id === r.replaces_id)?.reference}` : ""}</div></Td>
            <Td className="tabular-nums">{aed(r.amount)}</Td>
            <Td><Pill tone={R_TONE[r.status]}>{r.status}</Pill>{r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}</Td>
            <Td>{fin && <div className="flex gap-1">
              {r.status === "received" && <><Button size="sm" className="rounded-full" onClick={() => s.setReceiptStatus(r.id, "cleared")}>Cleared</Button><Button size="sm" variant="outline" className="rounded-full" onClick={() => s.setReceiptStatus(r.id, "bounced", "Returned by bank")}>Bounced</Button></>}
              {r.status === "cleared" && r.method === "Cheque" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => s.setReceiptStatus(r.id, "bounced", "Returned by bank")}>Mark bounced</Button>}
              {r.status === "bounced" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setReplacing(r); setRef(""); }}>Replacement cheque</Button>}
            </div>}</Td>
          </tr>); })}
      </Table>
      {replacing && (
        <Modal open onClose={() => setReplacing(null)} title={`Replace cheque ${replacing.reference}`}
          footer={<><Button variant="ghost" onClick={() => setReplacing(null)}>Cancel</Button><Button disabled={!ref} onClick={() => { s.addReceipt({ installment_id: replacing.installment_id, amount: replacing.amount, method: "Cheque", reference: ref, bank: replacing.bank, date: today(), replaces_id: replacing.id }); setReplacing(null); }}>Record replacement</Button></>}>
          <Field label="New cheque no."><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
          <p className="text-xs text-muted-foreground">The bounced cheque is kept in history as "replaced" so it is never counted twice.</p>
        </Modal>)}
    </>
  );
}

export function PaymentLinkDialog({ inst, onClose }: { inst: Installment | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  if (!inst) return null;
  const c = s.contract(inst.contract_id)!;
  const t = s.tenant(c.tenant_id);
  const link = payLink(inst);
  const text = `Dear ${s.tenantName(c.tenant_id)}, please pay AED ${s.balance(inst).toLocaleString()} for ${s.propLabel(c.property_id)} (instalment #${inst.no}) here: ${link}`;
  return (
    <Modal open onClose={onClose} title="Payment link (AED)"
      footer={<><Button variant="outline" onClick={() => { navigator.clipboard?.writeText(link); s.notify("Copied", "Payment link copied"); }}>Copy link</Button>
        <Button onClick={() => { s.sendMessage({ channel: "whatsapp", tenant_id: c.tenant_id, landlord_id: null, kind: "Payment link", body: text, status: "delivered" }); s.notify("Sent on WhatsApp", `to ${t?.phone}`); onClose(); }}><Send className="h-4 w-4" />Send via WhatsApp</Button></>}>
      <div className="space-y-2 text-sm">
        <Input readOnly value={link} />
        <p className="rounded-2xl bg-muted p-3 text-muted-foreground">{text}</p>
      </div>
    </Modal>
  );
}

/** Public tenant-facing checkout page (gateway placeholder). */
export function PayPage({ id }: { id: number }) {
  const s = useStore();
  const h = useHref();
  const [done, setDone] = useState(false);
  const inst = s.installments.find((i) => i.id === id);
  if (!inst) return <div className="p-10 text-center">Payment link not found.</div>;
  const c = s.contract(inst.contract_id)!;
  const bal = s.balance(inst);
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="text-sm text-muted-foreground">Rent payment</div>
        <div className="text-3xl font-semibold tabular-nums">{aed(bal)}</div>
        <div className="text-sm"><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L> · instalment #{inst.no}<br /><span className="text-muted-foreground">Due {fmtDate(inst.due_date)} · <L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></span></div>
        {done || bal <= 0 ? <Pill tone="green">Paid — thank you</Pill> :
          <Button className="w-full" onClick={() => { s.recordPayment(inst.id, bal, "Payment link"); setDone(true); }}>Pay {aed(bal)}</Button>}
        <p className="text-xs text-muted-foreground">Payments are processed in UAE dirhams (AED) only.</p>
      </div>
    </div>
  );
}

// ── Utility billing ──────────────────────────────────────────────────

export function UtilitiesPage() {
  const s = useStore();
  const h = useHref();
  const [editing, setEditing] = useState<Partial<UtilityBill> | null>(null);
  const [paying, setPaying] = useState<UtilityBill | null>(null);
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [importing, setImporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const edit = s.can("utilities", "edit");
  const rows = s.utilities.filter((u) => (type === "all" || u.type === type) && (status === "all" || (status === "receipts" ? u.status === "unpaid" && u.receipt_status === "submitted" : u.status === status))).sort((a, b) => b.period.localeCompare(a.period));
  const billsFor = (u: UtilityBill) => s.docs.filter((d) => d.entity === "utility" && d.entity_id === u.id);
  const month = (p: string) => new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const unpaid = s.utilities.filter((u) => u.status === "unpaid");
  const toCheck = s.utilities.filter((u) => u.status === "unpaid" && u.receipt_status === "submitted");
  return (
    <Page title="Utility billing" meta="Electricity & water charges per tenancy"
      actions={edit && <><Button variant="outline" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import bills</Button><Button variant="outline" onClick={() => setRecording(true)}><ReceiptIcon className="h-4 w-4" />Record payment</Button><Button variant="outline" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add charge</Button></>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receipts to check" value={toCheck.length} sub="uploaded by tenants" tone={toCheck.length ? "warn" : undefined} onClick={() => setStatus(status === "receipts" ? "all" : "receipts")} active={status === "receipts"} />
        <Stat label="Unpaid bills" value={aed(unpaid.reduce((t, u) => t + u.amount, 0))} sub={`${unpaid.length} bills`} tone="bad" onClick={() => setStatus(status === "unpaid" ? "all" : "unpaid")} active={status === "unpaid"} />
        <Stat label="Paid bills" value={s.utilities.filter((u) => u.status === "paid").length} tone="good" onClick={() => setStatus(status === "paid" ? "all" : "paid")} active={status === "paid"} />
        <Stat label="All bills" value={s.utilities.length} onClick={() => { setStatus("all"); setType("all"); }} active={status === "all" && type === "all"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <NSelect className="w-44" value={type} onChange={setType} options={[{ value: "all", label: "All utilities" }, { value: "electricity", label: "Electricity" }, { value: "water", label: "Water" }, { value: "combined", label: "Electricity & water" }]} />
        <NSelect className="w-40" value={status} onChange={setStatus} options={[{ value: "all", label: "Paid & unpaid" }, { value: "unpaid", label: "Unpaid" }, { value: "receipts", label: "Receipts to check" }, { value: "paid", label: "Paid" }]} />
      </div>
      <Table head={["Property", "Tenant", "Utility", "Provider · account", "Period", "Amount", "Status", "Bill", ""]} empty={!rows.length}>
        {rows.map((u) => { const c = s.contract(u.contract_id); const bills = billsFor(u); return (
          <tr key={u.id}>
            <Td className="font-medium">{c ? <L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L> : "—"}</Td>
            <Td>{c ? <L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L> : "—"}</Td>
            <Td><Pill tone={u.type === "electricity" ? "amber" : u.type === "water" ? "blue" : "violet"}>{UTIL_LABEL[u.type]}</Pill></Td>
            <Td>{u.provider}<div className="text-xs tabular-nums text-muted-foreground">Acc. {c?.dewa_account || "—"}</div></Td>
            <Td>{month(u.period)}</Td>
            <Td className="tabular-nums">{aed(u.amount)}</Td>
            <Td>{u.status === "paid"
              ? <div><Pill tone="green">Paid</Pill><div className="mt-0.5 text-xs text-muted-foreground">{fmtDate(u.paid_on)}{u.paid_ref ? ` · ${u.paid_ref}` : ""}</div>{u.paid_by && <div className="text-xs text-muted-foreground">by {u.paid_by}</div>}</div>
              : u.receipt_status === "submitted"
                ? <div className="space-y-1"><Pill tone="blue">Tenant receipt to check</Pill>
                    <div className="flex flex-wrap gap-1">
                      <button className="text-xs hover:underline" onClick={() => setViewing(s.docs.find((x) => x.id === u.receipt_doc_id) ?? null)}>View receipt</button>
                      {edit && <><button className="text-xs font-medium text-[#1f3d2b] hover:underline dark:text-[#8fb89a]" onClick={() => { s.saveUtility({ ...u, status: "paid", receipt_status: "approved", paid_on: today(), paid_method: "Paid by tenant to provider", paid_ref: "Tenant receipt", paid_by: s.me.name }); s.notify("Receipt approved", `${UTIL_LABEL[u.type]} ${month(u.period)} marked paid`); }}>Approve</button>
                      <button className="text-xs text-[#9a3f22] hover:underline" onClick={() => { s.saveUtility({ ...u, receipt_status: "rejected" }); s.notify("Receipt rejected", "The bill stays unpaid."); }}>Reject</button></>}
                    </div></div>
                : <div><Pill tone="red">Unpaid</Pill>{u.due_date && <div className="mt-0.5 text-xs text-muted-foreground">due {fmtDate(u.due_date)}</div>}{u.receipt_status === "rejected" && <div className="text-xs text-[#9a3f22]">receipt rejected</div>}</div>}</Td>
            <Td>{bills.length
              ? <button className="inline-flex items-center gap-1 text-sm hover:underline" onClick={() => setViewing(bills[bills.length - 1])}><Paperclip className="h-3.5 w-3.5" />View{bills.length > 1 ? ` (${bills.length})` : ""}</button>
              : edit ? <BillUpload bill={u} /> : <span className="text-xs text-muted-foreground">—</span>}</Td>
            <Td>{u.status === "unpaid" && <div className="flex flex-wrap gap-1">
              <PayBillButton contractId={u.contract_id} amount={u.amount} />
              {edit && <Button size="sm" variant="outline" onClick={() => setPaying(u)}>Mark paid</Button>}
              <NotifyButton event={{ kind: "utility", billId: u.id }} />
            </div>}</Td>
          </tr>); })}
      </Table>
      <UtilityDialog value={editing} onClose={() => setEditing(null)} />
      <MarkUtilityPaid bill={paying} onClose={() => setPaying(null)} />
      {importing && <BillImportDialog onClose={() => setImporting(false)} />}
      {recording && <ReportPaymentDialog onClose={() => setRecording(false)} />}
      <DocViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}

/** Attach the provider's bill (PDF or photo) to a charge already recorded. */
function BillUpload({ bill }: { bill: UtilityBill }) {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        if (f.size > 10 * 1024 * 1024) { s.notify("File too large", `${f.name} is over 10 MB.`); return; }
        const r = new FileReader();
        r.onload = () => attachUploads(s, "utility", bill.id, [{ name: f.name, mime: f.type || "application/octet-stream", url: String(r.result), size: f.size, category: "utility_bill" }]);
        r.readAsDataURL(f); e.target.value = "";
      }} />
      <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => ref.current?.click()}><Upload className="h-3.5 w-3.5" />Upload</button>
    </>
  );
}

function MarkUtilityPaid({ bill, onClose }: { bill: UtilityBill | null; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ paid_on: today(), paid_method: "Paid by tenant to provider", paid_ref: "" });
  const [last, setLast] = useState<unknown>(null);
  if (bill !== last) { setLast(bill); if (bill) setF({ paid_on: today(), paid_method: "Paid by tenant to provider", paid_ref: "" }); }
  if (!bill) return null;
  const c = s.contract(bill.contract_id);
  return (
    <Modal open onClose={onClose} title="Mark utility bill paid"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!f.paid_on} onClick={() => { s.saveUtility({ ...bill, status: "paid", ...f, paid_by: s.me.name }); s.notify("Utility bill paid", `${bill.provider} ${UTIL_LABEL[bill.type]} · ${aed(bill.amount)}`); onClose(); }}>Mark paid</Button></>}>
      <p className="text-sm text-muted-foreground">{c ? `${s.propLabel(c.property_id)} · ${s.tenantName(c.tenant_id)} · ` : ""}{bill.provider} {UTIL_LABEL[bill.type]} · {aed(bill.amount)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment date"><Input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        <Field label="How it was paid"><NSelect value={f.paid_method} onChange={(v) => setF({ ...f, paid_method: v })} options={["Paid by tenant to provider", "Bank transfer", "Cash", "Card", "Deducted from deposit"]} /></Field>
        <Field label="Receipt / reference no." className="col-span-2"><Input value={f.paid_ref} onChange={(e) => setF({ ...f, paid_ref: e.target.value })} placeholder="e.g. DEWA receipt number" /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Recorded as marked paid by {s.me.name}.</p>
    </Modal>
  );
}

function UtilityDialog({ value, onClose }: { value: Partial<UtilityBill> | null; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState<Partial<UtilityBill>>({});
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [last, setLast] = useState<unknown>(null);
  const active = s.contracts.filter((c) => c.status === "active");
  // The provider follows the emirate of the tenancy's property.
  const providerFor = (contractId?: number) => PROVIDER_BY_EMIRATE[s.property(s.contract(contractId ?? 0)?.property_id ?? 0)?.emirate ?? ""] ?? "Other";
  if (value !== last) {
    setLast(value);
    if (value) { setF({ type: "electricity", period: today().slice(0, 7), amount: 0, status: "unpaid", contract_id: active[0]?.id, provider: providerFor(active[0]?.id), ...value }); setFiles([]); }
  }
  const set = (k: keyof UtilityBill, v: unknown) => setF((x) => ({ ...x, [k]: v, ...(k === "contract_id" ? { provider: providerFor(Number(v)) } : {}) }));
  const c = s.contract(f.contract_id ?? 0);
  return (
    <Modal open={!!value} onClose={onClose} title="Add utility charge"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!f.contract_id || !f.amount} onClick={() => { const saved = s.saveUtility(f as UtilityBill); attachUploads(s, "utility", saved.id, files); onClose(); }}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tenancy" className="col-span-2"><NSelect value={f.contract_id ?? ""} onChange={(v) => set("contract_id", Number(v))} options={active.map((x) => ({ value: x.id, label: `${s.propLabel(x.property_id)} — ${s.tenantName(x.tenant_id)}` }))} /></Field>
        {c && <p className="col-span-2 -mt-1 text-xs text-muted-foreground">Utility account no. {c.dewa_account || "not recorded — add it under Ejari & DEWA"}</p>}
        <Field label="Utility"><NSelect value={f.type ?? ""} onChange={(v) => set("type", v)} options={[{ value: "electricity", label: "Electricity" }, { value: "water", label: "Water" }, { value: "combined", label: "Electricity & water" }]} /></Field>
        <Field label="Provider"><NSelect value={f.provider ?? ""} onChange={(v) => set("provider", v)} options={["DEWA", "ADDC", "AADC", "SEWA", "FEWA", "Etihad WE", "Other"]} /></Field>
        <Field label="Billing month"><Input type="month" value={f.period ?? ""} onChange={(e) => set("period", e.target.value)} /></Field>
        <Field label="Amount (AED)"><Input type="number" value={f.amount ?? 0} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
        <div className="col-span-2"><PendingUploads files={files} onChange={setFiles} categories={["utility_bill"]} title="The bill (PDF or photo)" /></div>
      </div>
    </Modal>
  );
}
