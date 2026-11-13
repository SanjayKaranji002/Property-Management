import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, LogOut, Plus, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addMonthsIso, aed, calcInstallments, daysUntil, fmtDate, FREQUENCIES, iso8601, today, type Closure, type Contract, type DewaStatus, type EjariStatus, agreementRef, EJARI_HELP, ejariStatus } from "../data";
import { useStore } from "../store";
import { L, useHref } from "../nav";
import { NotifyButton } from "./notify";
import { Card, DocumentsPanel, Field, Modal, NSelect, Page, Pill, SearchBox, Table, Td, type Tone } from "../ui";

const endFor = (start: string, years: number) => { const d = new Date(`${addMonthsIso(start, years * 12)}T00:00:00`); d.setDate(d.getDate() - 1); return iso8601(d); };

export const EJARI_LABEL: Record<EjariStatus, [string, Tone]> = {
  not_registered: ["Not registered", "red"], registered: ["Registered", "green"], renewal_pending: ["Renewal pending", "amber"], renewed: ["Renewed", "green"], cancelled: ["Cancelled", "gray"],
};
/** Ejari status badge, worked out from the agreement (never picked by hand). */
export function EjariPill({ c }: { c: Pick<Contract, "status" | "ejari_no" | "ejari_reg_date" | "ejari_expiry" | "end_date"> }) {
  const st = ejariStatus(c);
  return <span title={EJARI_HELP[st]}><Pill tone={EJARI_LABEL[st][1]}>{EJARI_LABEL[st][0]}</Pill></span>;
}

export const DEWA_LABEL: Record<DewaStatus, [string, Tone]> = {
  not_linked: ["Not linked", "red"], applied: ["Applied", "amber"], deposit_paid: ["Deposit paid", "blue"], active: ["Active", "green"], closed: ["Closed", "gray"],
};
const APPROVAL_TONE = { draft: "gray", pending: "amber", approved: "green", rejected: "red" } as const;

const BLANK: Partial<Contract> = {
  usage: "residential", term_years: 1, frequency: "quarterly", role: "direct", parent_contract_id: null, status: "active",
  annual_rent: 0, deposit: 0, broker_fee: 0, other_charges: 0, prorate_first: false, custom_amounts: null,
  ejari_no: "", ejari_status: "not_registered", ejari_reg_date: "", ejari_expiry: "",
  dewa_account: "", dewa_status: "not_linked", dewa_deposit_confirmed: false, move_in_date: "", closure: null, agreement_versions: 1,
};

export function ContractsPage({ openId }: { openId?: number } = {}) {
  const s = useStore();
  const h = useHref();
  const [tab, setTab] = useState<"current" | "approval" | "expiring" | "history">(() => (new URLSearchParams(location.search).get("tab") as "expiring") ?? "current");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Contract> | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(openId ?? null);
  const [closing, setClosing] = useState<Contract | null>(null);
  const visible = new Set(s.visibleProperties.map((p) => p.id));
  const mine = s.contracts.filter((c) => visible.has(c.property_id));
  const counts = {
    approval: mine.filter((c) => c.approval === "pending").length,
    expiring: mine.filter((c) => c.status === "active" && daysUntil(c.end_date) <= 90).length,
  };

  const rows = mine.filter((c) => {
    if (!`${s.propLabel(c.property_id)} ${s.tenantName(c.tenant_id)} ${c.ejari_no}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (tab === "current") return c.status === "active";
    if (tab === "approval") return c.approval === "pending";
    if (tab === "expiring") return c.status === "active" && daysUntil(c.end_date) <= 90;
    return c.status !== "active";
  }).sort((a, b) => a.end_date.localeCompare(b.end_date));

  // Step 12 — renewal returns to agreement setup (step 5) with the old terms prefilled.
  function renew(c: Contract) {
    const d = new Date(`${c.end_date}T00:00:00`); d.setDate(d.getDate() + 1);
    const start = iso8601(d);
    s.patchContract(c.id, { status: "renewed" });
    setEditing({ ...c, id: undefined, start_date: start, end_date: endFor(start, c.term_years), status: "active", approval: "draft", ejari_no: c.ejari_no, ejari_reg_date: "", ejari_expiry: "", closure: null, agreement_versions: 1, custom_amounts: null, prorate_first: false });
  }

  const tabs = [
    ["current", "Current"], ["approval", `Awaiting approval (${counts.approval})`], ["expiring", `Expiring ≤ 90 days (${counts.expiring})`], ["history", "History"],
  ] as const;

  return (
    <Page title="Rental agreements" meta={`${mine.filter((c) => c.status === "active").length} active · AED`}
      actions={s.can("contracts", "edit") && <Button className="rounded-full" onClick={() => setEditing({ ...BLANK })}><Plus className="h-4 w-4" />New agreement</Button>}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={tabs.map(([v, l]) => ({ value: v, label: l }))} />
        <div className="flex-1" /><SearchBox value={q} onChange={setQ} />
      </div>
      <Table head={["Agreement", "Property", "Tenant", "Type", "Annual rent", "Ejari", "Approval", "Expiry", ""]} empty={!rows.length}>
        {rows.map((c) => { const d = daysUntil(c.end_date); return (
          <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setViewingId(c.id)}>
            <Td className="font-medium">{agreementRef(c)}</Td><Td><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L></Td><Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td>
            <Td><div className="flex flex-wrap gap-1"><Pill tone={c.usage === "commercial" ? "violet" : "gray"}>{c.usage}</Pill>{c.role !== "direct" && <Pill tone="blue">{c.role === "lessee" ? "Lessee" : "Sub-tenant"}</Pill>}</div></Td>
            <Td className="tabular-nums">{aed(c.annual_rent)}<div className="text-xs text-muted-foreground">{c.term_years} yr · {c.frequency.replace("_", "-")}</div></Td>
            <Td><EjariPill c={c} /></Td>
            <Td><Pill tone={APPROVAL_TONE[c.approval]}>{c.approval}</Pill></Td>
            <Td>{fmtDate(c.end_date)}{c.status === "active" && d <= 90 && <div><Pill tone={d <= 60 ? "red" : "amber"}>{d} days left</Pill></div>}</Td>
            <Td onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-1">
                {c.approval === "pending" && s.canApprove(5) && <Button size="sm" className="rounded-full" onClick={() => { s.patchContract(c.id, { approval: "approved" }); s.notify("Agreement approved", agreementRef(c)); }}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>}
                {c.status === "active" && d <= 90 && <NotifyButton event={{ kind: "expiry", contractId: c.id }} />}
                {c.status === "active" && c.approval === "approved" && d <= 90 && s.can("contracts", "edit") && <Button size="sm" variant="outline" className="rounded-full" onClick={() => renew(c)}><RefreshCw className="h-3.5 w-3.5" />Renew</Button>}
                {c.status === "active" && c.approval === "approved" && s.can("contracts", "edit") && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setClosing(c)}><LogOut className="h-3.5 w-3.5" />Close</Button>}
              </div>
            </Td>
          </tr>); })}
      </Table>
      <ContractDialog value={editing} onClose={() => setEditing(null)} />
      <ContractView contract={viewingId ? s.contract(viewingId) ?? null : null} onClose={() => setViewingId(null)} onEdit={(c) => { setViewingId(null); setEditing(c); }} />
      <ClosureDialog contract={closing} onClose={() => setClosing(null)} />
    </Page>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-border/70 bg-card p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3.5 py-1.5 text-sm transition-colors", value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>))}
    </div>
  );
}

// ── Step 5 + 8: agreement setup and calculations ──────────────────────

function ContractDialog({ value, onClose }: { value: Partial<Contract> | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState<Partial<Contract>>({});
  const [custom, setCustom] = useState(false);
  const [files, setFiles] = useState<{ name: string; mime: string; url: string; size: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  function addFiles(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      if (file.size > 10 * 1024 * 1024) { s.notify("File too large", `${file.name} is over 10 MB.`); continue; }
      const r = new FileReader();
      r.onload = () => setFiles((fs) => [...fs, { name: file.name, mime: file.type || "application/octet-stream", url: String(r.result), size: file.size }]);
      r.readAsDataURL(file);
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  const [last, setLast] = useState<unknown>(null);
  if (value !== last) {
    setLast(value);
    if (value) {
      setFiles([]);
      const start = today();
      const p0 = s.visibleProperties.find((p) => p.status === "vacant") ?? s.visibleProperties[0];
      const rent = value.annual_rent || p0?.rental_value || 0;
      setF({ ...BLANK, start_date: start, end_date: endFor(start, 1), property_id: p0?.id, usage: p0?.usage ?? "residential", tenant_id: s.tenants[0]?.id, annual_rent: rent, deposit: Math.round(rent * 0.05), broker_fee: Math.round(rent * 0.05), ...value, ...(value.annual_rent ? {} : { annual_rent: rent }) });
      setCustom(!!value.custom_amounts);
    }
  }
  const set = (k: keyof Contract, v: unknown) => setF((x) => {
    const n = { ...x, [k]: v };
    if (k === "start_date" || k === "term_years") n.end_date = endFor(n.start_date!, n.term_years!);
    if (k === "property_id") { const p = s.property(Number(v)); if (p) { n.usage = p.usage; if (!x.annual_rent) n.annual_rent = p.rental_value; } }
    if (k === "annual_rent" && !x.id) { n.deposit = Math.round(Number(v) * 0.05); n.broker_fee = Math.round(Number(v) * 0.05); }
    if (k === "frequency" || k === "term_years" || k === "annual_rent") n.custom_amounts = null;
    return n;
  });
  const equal = useMemo(() => f.start_date && f.annual_rent ? calcInstallments({ ...(f as Contract), custom_amounts: null }, s.settings.commercial_vat_pct) : [], [f, s.settings.commercial_vat_pct]);
  const preview = useMemo(() => f.start_date && f.annual_rent ? calcInstallments(f as Contract, s.settings.commercial_vat_pct) : [], [f, s.settings.commercial_vat_pct]);
  const regular = preview.filter((i) => i.no > 0);
  const rentTotal = preview.reduce((t, i) => t + i.amount, 0);
  const expected = equal.filter((i) => i.no > 0).reduce((t, i) => t + i.amount, 0);
  const customOff = custom && Math.abs(regular.reduce((t, i) => t + i.amount, 0) - expected) > 0.5;
  const parents = s.contracts.filter((c) => c.status === "active" && c.role !== "sub_tenant" && c.id !== f.id);
  const overlap = f.property_id && f.start_date && f.end_date ? s.overlapFor(f as Contract) : null;
  const tenant = s.tenant(f.tenant_id);
  const approver = s.canApprove(5);

  function save(submit: boolean) {
    const approval = submit ? (approver ? "approved" : "pending") : "draft";
    const saved = s.saveContract({ ...(f as Contract), ejari_no: (f.ejari_no ?? "").trim(), approval, custom_amounts: custom ? regular.map((i) => i.amount) : null,
      agreement_versions: (f.agreement_versions ?? 1) + (f.id && files.length ? 1 : 0) });
    for (const file of files) s.saveDoc({ entity: "contract", entity_id: saved.id, category: "tenancy_contract", name: file.name, mime: file.mime, url: file.url, uploaded_on: today() });
    if (files.length) s.notify("Agreement document uploaded", files.map((x) => x.name).join(", "));
    s.notify(approval === "approved" ? "Agreement approved" : approval === "pending" ? "Sent for approval" : "Draft saved", `${preview.length} instalments scheduled`);
    onClose();
  }

  return (
    <Modal wide open={!!value} onClose={onClose} title={value?.id ? "Edit rental agreement" : "New rental agreement"}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={!f.property_id || !f.tenant_id} onClick={() => save(false)}>Save draft</Button>
        <Button disabled={!f.property_id || !f.tenant_id || !f.annual_rent || !!overlap || customOff} onClick={() => save(true)}>{approver ? "Approve & activate" : "Submit for approval"}</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 content-start gap-3">
          <Field label="Property" className="col-span-2"><NSelect value={f.property_id ?? ""} onChange={(v) => set("property_id", Number(v))} options={s.visibleProperties.map((p) => ({ value: p.id, label: `${s.propLabel(p.id)} (${p.status})` }))} /></Field>
          <Field label="Tenant" className="col-span-2"><NSelect value={f.tenant_id ?? ""} onChange={(v) => set("tenant_id", Number(v))} options={s.tenants.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}${t.kyc_status !== "approved" ? " — KYC " + t.kyc_status : ""}` }))} /></Field>
          {tenant && tenant.kyc_status !== "approved" && <p className="col-span-2 rounded-2xl bg-[#f3e8d3] px-3 py-2 text-xs text-[#7a5a24]">This tenant's KYC is not approved yet.</p>}
          <Field label="Tenancy type"><NSelect value={f.usage ?? ""} onChange={(v) => set("usage", v)} options={[{ value: "residential", label: "Residential" }, { value: "commercial", label: "Commercial" }]} /></Field>
          <Field label="Arrangement"><NSelect value={f.role ?? ""} onChange={(v) => set("role", v)} options={[{ value: "direct", label: "Owner → tenant" }, { value: "lessee", label: "Owner → lessee" }, { value: "sub_tenant", label: "Lessee → sub-tenant" }]} /></Field>
          {f.role === "sub_tenant" && <Field label="Head lease" className="col-span-2"><NSelect value={f.parent_contract_id ?? ""} onChange={(v) => set("parent_contract_id", Number(v))} options={[{ value: "", label: "Select…" }, ...parents.map((c) => ({ value: c.id, label: `${agreementRef(c)} · ${s.propLabel(c.property_id)} · ${s.tenantName(c.tenant_id)}` }))]} /></Field>}
          <Field label="Start date"><Input type="date" value={f.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label="Term"><NSelect value={f.term_years ?? 1} onChange={(v) => set("term_years", Number(v))} options={[{ value: 1, label: "1 year" }, { value: 2, label: "2 years" }]} /></Field>
          <Field label="End date"><Input type="date" value={f.end_date ?? ""} onChange={(e) => set("end_date", e.target.value)} /></Field>
          <Field label="Ejari no."><Input value={f.ejari_no ?? ""} onChange={(e) => set("ejari_no", e.target.value)} placeholder="Leave empty until registered" /></Field>
          {overlap && <p className="col-span-2 rounded-2xl bg-[#f6e1d8] px-3 py-2 text-xs text-[#9a3f22]">{overlap}</p>}
          <Field label="Annual rent (AED)"><Input type="number" value={f.annual_rent ?? 0} onChange={(e) => set("annual_rent", Number(e.target.value))} /></Field>
          <Field label="Payment terms"><NSelect value={f.frequency ?? ""} onChange={(v) => set("frequency", v)} options={FREQUENCIES.map((x) => ({ value: x.value, label: x.label }))} /></Field>
          <Field label="Security deposit (held separately)"><Input type="number" value={f.deposit ?? 0} onChange={(e) => set("deposit", Number(e.target.value))} /></Field>
          <Field label="Broker charge (AED)"><Input type="number" value={f.broker_fee ?? 0} onChange={(e) => set("broker_fee", Number(e.target.value))} /></Field>
          <Field label="Other agreed charges (AED)"><Input type="number" value={f.other_charges ?? 0} onChange={(e) => set("other_charges", Number(e.target.value))} /></Field>
          <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.prorate_first} onChange={(e) => set("prorate_first", e.target.checked)} />Prorate the first part-month</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={custom} onChange={(e) => { setCustom(e.target.checked); if (!e.target.checked) set("custom_amounts", null); }} />Customise instalment amounts</label>
          </div>
          <div className="col-span-2 rounded-[1.25rem] border border-dashed border-border p-3"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm">Signed agreement {f.id ? "(new version)" : ""}</span>
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload</Button>
            </div>
            {files.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">PDF or image, up to 10 MB. Drag and drop works too.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{files.map((x, i) => (
                <li key={i} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{x.name}</span><span className="text-xs text-muted-foreground">{Math.ceil(x.size / 1024)} KB</span>
                  <button type="button" aria-label={`Remove ${x.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button></li>))}
              </ul>)}
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-muted/60 p-4">
          <div className="text-sm font-medium">Payment schedule</div>
          <p className="mb-2 text-xs text-muted-foreground">AED {Number(f.annual_rent || 0).toLocaleString()} ÷ {FREQUENCIES.find((x) => x.value === f.frequency)?.payments} = AED {(Number(f.annual_rent || 0) / (FREQUENCIES.find((x) => x.value === f.frequency)?.payments ?? 1)).toLocaleString()} per instalment{f.usage === "commercial" ? ` + ${s.settings.commercial_vat_pct}% VAT` : ""}.</p>
          <ul className="max-h-64 divide-y divide-border/70 overflow-auto text-sm">
            {preview.map((i, idx) => (
              <li key={`${i.no}-${idx}`} className="flex items-center justify-between gap-2 py-1.5">
                <span>{i.no === 0 ? "Prorated" : `#${i.no}`} · {fmtDate(i.due_date)}</span>
                {custom && i.no > 0
                  ? <Input type="number" className="h-8 w-32 rounded-full text-right" value={i.amount} onChange={(e) => { const a = regular.map((x) => x.amount); a[i.no - 1] = Number(e.target.value); setF((x) => ({ ...x, custom_amounts: a })); }} />
                  : <span className="tabular-nums">{aed(i.amount)}</span>}
              </li>))}
          </ul>
          {customOff && <p className="mt-1 text-xs text-[#b4532f]">Custom amounts must add up to {aed(expected)}.</p>}
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between font-medium"><dt>Rent ({preview.length} payments)</dt><dd className="tabular-nums">{aed(rentTotal)}</dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>Broker + other charges</dt><dd className="tabular-nums">{aed((f.broker_fee ?? 0) + (f.other_charges ?? 0))}</dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>Deposit (refundable, separate)</dt><dd className="tabular-nums">{aed(f.deposit ?? 0)}</dd></div>
          </dl>
        </div>
      </div>
    </Modal>
  );
}

// ── Agreement view: instalments, Ejari / DEWA, closure, versions ───────

export function ContractView({ contract, onClose, onEdit, portal }: { contract: Contract | null; onClose: () => void; onEdit?: (c: Contract) => void; portal?: boolean }) {
  const s = useStore();
  const h = useHref();
  const [tab, setTab] = useState<"overview" | "schedule" | "ejari" | "closure">("overview");
  if (!contract) return null;
  const c = contract;
  const inst = s.installments.filter((i) => i.contract_id === c.id).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const parent = c.parent_contract_id ? s.contract(c.parent_contract_id) : null;
  const subs = s.contracts.filter((x) => x.parent_contract_id === c.id);
  const tabs = [{ value: "overview", label: "Overview" }, { value: "schedule", label: "Schedule" }, ...(portal ? [] : [{ value: "ejari", label: "Ejari & DEWA" }]), ...(c.closure ? [{ value: "closure", label: "Closure" }] : [])] as { value: typeof tab; label: string }[];
  return (
    <Modal wide open onClose={onClose} title={`Agreement ${agreementRef(c)}`}
      footer={<>{onEdit && s.can("contracts", "edit") && c.status === "active" && <Button variant="outline" onClick={() => onEdit(c)}>Edit</Button>}<Button onClick={onClose}>Close</Button></>}>
      <Segmented value={tab} onChange={setTab} options={tabs} />
      {tab === "overview" && (
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <dl className="grid grid-cols-2 gap-y-1.5">
            {[["Property", s.propLabel(c.property_id)], ["Landlord", s.landlord(s.property(c.property_id)?.landlord_id)?.name], ["Tenant", s.tenantName(c.tenant_id)], ["Tenancy type", c.usage], ["Period", `${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}`], ["Annual rent", aed(c.annual_rent)], ["Payment terms", c.frequency.replace("_", "-")], ["Deposit", aed(c.deposit)], ["Broker charge", aed(c.broker_fee)], ["Other charges", aed(c.other_charges)], ["Approval", c.approval], ["Status", c.status]].map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="capitalize">{v}</dd></div>)}
            {parent && <><dt className="text-muted-foreground">Head lease</dt><dd>{agreementRef(parent)} (<L to={h.tenant(parent.tenant_id)}>{s.tenantName(parent.tenant_id)}</L>)</dd></>}
            {subs.length > 0 && <><dt className="text-muted-foreground">Sub-tenants</dt><dd>{subs.map((x) => s.tenantName(x.tenant_id)).join(", ")}</dd></>}
          </dl>
          <div className="space-y-2">
            <DocumentsPanel entity="contract" entityId={c.id} categories={["tenancy_contract", "other"]} title={`Signed agreement · v${c.agreement_versions}`} canUpload={!portal && s.can("contracts", "edit")} canDelete={!portal && s.can("contracts", "edit")} />
            {!portal && <p className="text-xs text-muted-foreground">Uploading a new signed copy keeps earlier versions in the list.</p>}
          </div>
        </div>)}
      {tab === "schedule" && (
        <ul className="divide-y divide-border/70 text-sm">
          {inst.map((i) => <li key={i.id} className="flex items-center gap-2 py-2"><span className="flex-1">{i.no === 0 ? "Prorated" : `#${i.no}`} · {fmtDate(i.due_date)}</span><span className="tabular-nums">{aed(i.amount)}</span>
            {s.balance(i) <= 0 ? <Pill tone="green">Paid</Pill> : i.paid > 0 ? <Pill tone="amber">Part-paid</Pill> : s.isOverdue(i) ? <Pill tone="red">Overdue</Pill> : <Pill>Due</Pill>}</li>)}
        </ul>)}
      {tab === "ejari" && <EjariDewaForm contract={c} />}
      {tab === "closure" && c.closure && (
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          {[["Move-out", fmtDate(c.closure.move_out_date)], ["Final dues", aed(c.closure.final_dues)], ["Deductions", `${aed(c.closure.deductions)} ${c.closure.deduction_note}`], ["Deposit refund", aed(c.closure.deposit_refund)], ["Ejari cancellation", c.closure.ejari_cancel_ref], ["DEWA final bill", c.closure.dewa_final_ref], ["Finance approval", c.closure.approved_by_finance ? "Approved" : "Pending"]].map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
        </dl>)}
    </Modal>
  );
}

/** Steps 6 and 7: Ejari registration and DEWA move-in linkage (manual capture). */
export function EjariDewaForm({ contract: c }: { contract: Contract }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState(c);
  const editable = s.can("ejari_dewa", "edit");
  const p = s.property(c.property_id);
  const set = (k: keyof Contract, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 content-start gap-3 rounded-[1.5rem] bg-muted/60 p-4">
          <div className="col-span-2 text-sm font-medium">Ejari</div>
          <Field label="Ejari number"><Input disabled={!editable} value={f.ejari_no} onChange={(e) => set("ejari_no", e.target.value)} /></Field>
          <Field label="Status (automatic)"><div className="flex h-10 items-center"><EjariPill c={f} /></div></Field>
          <Field label="Registration date"><Input disabled={!editable} type="date" value={f.ejari_reg_date} onChange={(e) => set("ejari_reg_date", e.target.value)} /></Field>
          <Field label="Valid until"><Input disabled={!editable} type="date" value={f.ejari_expiry} onChange={(e) => set("ejari_expiry", e.target.value)} /></Field>
          <p className="col-span-2 rounded-2xl bg-card px-3 py-2 text-xs text-muted-foreground">{EJARI_HELP[ejariStatus(f)]}</p>
          <details className="col-span-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">What do the statuses mean?</summary>
            <ul className="mt-2 space-y-1.5">{(Object.keys(EJARI_HELP) as EjariStatus[]).map((k) => (
              <li key={k} className="flex gap-2"><span className="w-28 shrink-0"><Pill tone={EJARI_LABEL[k][1]}>{EJARI_LABEL[k][0]}</Pill></span><span>{EJARI_HELP[k]}</span></li>))}
            </ul>
          </details>
        </div>
        <div className="grid grid-cols-2 content-start gap-3 rounded-[1.5rem] bg-muted/60 p-4">
          <div className="col-span-2 text-sm font-medium">DEWA linkage & move-in</div>
          <Field label="Premise no. (from property)"><Input disabled value={p?.dewa_premise_no || "Not set on property"} /></Field>
          <Field label="Tenant contract account"><Input disabled={!editable} value={f.dewa_account} onChange={(e) => set("dewa_account", e.target.value)} /></Field>
          <Field label="Activation status"><NSelect value={f.dewa_status} onChange={(v) => set("dewa_status", v as DewaStatus)} options={Object.entries(DEWA_LABEL).map(([value, [label]]) => ({ value, label }))} /></Field>
          <Field label="Move-in date"><Input disabled={!editable} type="date" value={f.move_in_date} onChange={(e) => set("move_in_date", e.target.value)} /></Field>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={f.dewa_deposit_confirmed} onChange={(e) => set("dewa_deposit_confirmed", e.target.checked)} />DEWA deposit payment confirmed</label>
        </div>
      </div>
      <DocumentsPanel entity="contract" entityId={c.id} categories={["other"]} title="Ejari certificate & DEWA documents" canUpload={editable} canDelete={editable} />
      <p className="text-xs text-muted-foreground">Captured manually. A direct DLD/Ejari or DEWA integration needs confirmed authorisation and a feasibility check first.</p>
      {editable && <div className="flex justify-end"><Button onClick={() => { s.patchContract(c.id, f); s.notify("Ejari / DEWA updated", agreementRef(c)); }}>Save</Button></div>}
    </div>
  );
}

// ── Step 12: closure ─────────────────────────────────────────────────

export function ClosureDialog({ contract, onClose }: { contract: Contract | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState<Closure | null>(null);
  const [last, setLast] = useState<unknown>(null);
  if (contract !== last) {
    setLast(contract);
    if (contract) {
      const due = s.installments.filter((i) => i.contract_id === contract.id && i.due_date <= today()).reduce((t, i) => t + s.balance(i), 0);
      const bills = s.utilities.filter((u) => u.contract_id === contract.id && u.status === "unpaid").reduce((t, u) => t + u.amount, 0);
      setF({ move_out_date: today(), final_dues: due + bills, deductions: 0, deduction_note: "", deposit_refund: Math.max(0, contract.deposit - due - bills), ejari_cancel_ref: "", dewa_final_ref: "", approved_by_finance: false });
    }
  }
  if (!contract || !f) return null;
  const set = (k: keyof Closure, v: unknown) => setF((x) => {
    const n = { ...x!, [k]: v };
    if (k === "deductions" || k === "final_dues") n.deposit_refund = Math.max(0, contract.deposit - n.final_dues - n.deductions);
    return n;
  });
  const finance = s.canApprove(12) && (s.me.role === "finance" || s.me.role === "admin");
  return (
    <Modal open onClose={onClose} title={`Close tenancy ${agreementRef(contract)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!f.approved_by_finance} onClick={() => { s.closeContract(contract.id, f); onClose(); }}>Close tenancy</Button></>}>
      <p className="text-sm text-muted-foreground"><L to={h.property(contract.property_id)}>{s.propLabel(contract.property_id)}</L> — <L to={h.tenant(contract.tenant_id)}>{s.tenantName(contract.tenant_id)}</L> · deposit held {aed(contract.deposit)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Move-out date"><Input type="date" value={f.move_out_date} onChange={(e) => set("move_out_date", e.target.value)} /></Field>
        <Field label="Final dues (rent + utilities)"><Input type="number" value={f.final_dues} onChange={(e) => set("final_dues", Number(e.target.value))} /></Field>
        <Field label="Approved deductions"><Input type="number" value={f.deductions} onChange={(e) => set("deductions", Number(e.target.value))} /></Field>
        <Field label="Deduction reason"><Input value={f.deduction_note} onChange={(e) => set("deduction_note", e.target.value)} placeholder="e.g. repainting" /></Field>
        <Field label="Deposit refund"><Input type="number" value={f.deposit_refund} onChange={(e) => set("deposit_refund", Number(e.target.value))} /></Field>
        <Field label="Ejari cancellation ref."><Input value={f.ejari_cancel_ref} onChange={(e) => set("ejari_cancel_ref", e.target.value)} /></Field>
        <Field label="DEWA final bill / closure ref." className="col-span-2"><Input value={f.dewa_final_ref} onChange={(e) => set("dewa_final_ref", e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!finance} checked={f.approved_by_finance} onChange={(e) => set("approved_by_finance", e.target.checked)} />
          Finance approves the settlement and deposit refund{!finance && " (Finance or Administrator only)"}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Closing marks the property vacant, cancels Ejari and closes the DEWA linkage on the dashboard.</p>
    </Modal>
  );
}
