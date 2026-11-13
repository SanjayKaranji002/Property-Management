import { useState, useRef } from "react";
import { Mail, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aed, daysUntil, fmtDate, type Contract, agreementRef, UTIL_LABEL, today, type UtilityBill } from "../data";
import { useStore } from "../store";
import { L, useHref } from "../nav";
import { Card, DocumentsPanel, Page, Pill, Stat, StatusPill, Table, Td } from "../ui";
import { ContractView } from "./contracts";
import { ComposeDialog } from "./admin";
import { PayBillButton, ReportPaymentDialog, useUtilityAccount } from "./utility-pay";
import { payLink } from "./finance";

// ── Landlord portal: own properties only ─────────────────────────────

export function LandlordContracts({ landlordId, openId }: { landlordId: number; openId?: number }) {
  const s = useStore();
  const h = useHref();
  const [viewing, setViewing] = useState<Contract | null>(() => (openId ? s.contract(openId) ?? null : null));
  const ids = new Set(s.properties.filter((p) => p.landlord_id === landlordId).map((p) => p.id));
  const rows = s.contracts.filter((c) => ids.has(c.property_id));
  return (
    <Page title="Contracts" meta="Contract status for your properties">
      <Table head={["Contract", "Property", "Tenant", "Period", "Annual rent", "Status"]} empty={!rows.length}>
        {rows.map((c) => { const d = daysUntil(c.end_date); return (
          <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setViewing(c)}>
            <Td className="font-medium">{agreementRef(c)}</Td><Td><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L></Td><Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td>
            <Td>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</Td><Td className="tabular-nums">{aed(c.annual_rent)}</Td>
            <Td>{c.status !== "active" ? <Pill>{c.status}</Pill> : d <= 90 ? <Pill tone="amber">Expiring in {d}d</Pill> : <Pill tone="green">Active</Pill>}</Td>
          </tr>); })}
      </Table>
      <ContractView contract={viewing} onClose={() => setViewing(null)} portal />
    </Page>
  );
}

export function LandlordPayments({ landlordId }: { landlordId: number }) {
  const s = useStore();
  const h = useHref();
  const [compose, setCompose] = useState(false);
  const ids = new Set(s.properties.filter((p) => p.landlord_id === landlordId).map((p) => p.id));
  const contracts = s.contracts.filter((c) => ids.has(c.property_id) && c.status === "active");
  const cids = new Set(contracts.map((c) => c.id));
  const inst = s.installments.filter((i) => cids.has(i.contract_id));
  const received = inst.filter((i) => i.paid > 0).sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""));
  const pending = inst.filter((i) => s.balance(i) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const tenantIds = [...new Set(contracts.map((c) => c.tenant_id))];
  return (
    <Page title="Payments" meta="Received and pending rent"
      actions={s.settings.landlord_access.email_tenants && <Button onClick={() => setCompose(true)}><Mail className="h-4 w-4" />Email a tenant</Button>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Received" value={aed(received.reduce((t, i) => t + i.paid, 0))} tone="good" />
        <Stat label="Overdue" value={aed(pending.filter(s.isOverdue).reduce((t, i) => t + s.balance(i), 0))} tone="bad" />
        <Stat label="Still to come" value={aed(pending.filter((i) => !s.isOverdue(i)).reduce((t, i) => t + s.balance(i), 0))} />
      </div>
      <Card title="Pending & overdue">
        <Table head={["Property", "Tenant", "#", "Due", "Balance", "Status", ""]} empty={!pending.length}>
          {pending.map((i) => { const c = s.contract(i.contract_id)!; return (
            <tr key={i.id}><Td><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L></Td><Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td><Td>{i.no}</Td><Td>{fmtDate(i.due_date)}</Td><Td className="tabular-nums">{aed(s.balance(i))}</Td>
              <Td>{s.isOverdue(i) ? <Pill tone="red">Overdue</Pill> : <Pill>Upcoming</Pill>}</Td>
              <Td>{s.isOverdue(i) && s.settings.landlord_access.email_tenants && <Button size="sm" variant="outline" onClick={() => { s.sendMessage({ channel: "email", tenant_id: c.tenant_id, landlord_id: landlordId, kind: "Landlord follow-up", body: `Dear ${s.tenantName(c.tenant_id)}, instalment #${i.no} (AED ${s.balance(i).toLocaleString()}) for ${s.propLabel(c.property_id)} is overdue. Please pay here: ${payLink(i)}` }); s.notify("Follow-up sent", s.tenantName(c.tenant_id)); }}>Follow up</Button>}</Td>
            </tr>); })}
        </Table>
      </Card>
      <Card title="Received payments">
        <Table head={["Date", "Property", "Tenant", "#", "Amount", "Method"]} empty={!received.length}>
          {received.map((i) => { const c = s.contract(i.contract_id)!; return <tr key={i.id}><Td>{fmtDate(i.paid_on)}</Td><Td><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L></Td><Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td><Td>{i.no}</Td><Td className="tabular-nums">{aed(i.paid)}</Td><Td>{i.method}</Td></tr>; })}
        </Table>
      </Card>
      <ComposeDialog open={compose} onClose={() => setCompose(false)} tenantIds={tenantIds} fromLandlord={landlordId} />
    </Page>
  );
}

export function LandlordDocuments({ landlordId }: { landlordId: number }) {
  const s = useStore();
  const h = useHref();
  const props = s.properties.filter((p) => p.landlord_id === landlordId);
  return (
    <Page title="Documents" meta="Your KYC, title deeds and property photos">
      <DocumentsPanel entity="landlord" entityId={landlordId} categories={["emirates_id", "passport", "kyc"]} title="My KYC documents" canUpload={s.settings.landlord_access.upload} canDelete={false} />
      {props.map((p) => <DocumentsPanel key={p.id} entity="property" entityId={p.id} categories={["title_deed", "photo"]} title={s.propLabel(p.id)} canUpload={s.settings.landlord_access.upload} canDelete={false} />)}
    </Page>
  );
}

// ── Tenant portal: own property, upcoming rent, documents ────────────

export function TenantHome({ tenantId }: { tenantId: number }) {
  const s = useStore();
  const h = useHref();
  const acc = s.settings.tenant_access;
  const t = s.tenant(tenantId);
  const c = s.contracts.find((x) => x.tenant_id === tenantId && x.status === "active");
  if (!t) return null;
  if (!c) return <Page title={`Welcome, ${t.first_name}`}><p className="text-sm text-muted-foreground">You have no active tenancy.</p></Page>;
  const p = s.property(c.property_id)!;
  const inst = s.installments.filter((i) => i.contract_id === c.id && s.balance(i) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const next = inst[0];
  const bills = s.utilities.filter((u) => u.contract_id === c.id);
  return (
    <Page title={`Welcome, ${t.first_name}`} meta="Your tenancy at a glance">
      {acc.upcoming_rent && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Next rent due" value={next ? aed(s.balance(next)) : "Nothing due"} sub={next ? `${fmtDate(next.due_date)} · instalment #${next.no}` : undefined} tone={next && s.isOverdue(next) ? "bad" : undefined} />
          <Stat label="Tenancy ends" value={fmtDate(c.end_date)} sub={`${daysUntil(c.end_date)} days left`} />
          <div className="flex items-center rounded-xl border border-border bg-card p-4">{next && <a className="w-full" href={`/pay/${next.id}`}><Button className="w-full">Pay now (AED)</Button></a>}</div>
        </div>)}
      {acc.property && (
        <Card title="My property">
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{p.name} · {p.unit_no}</span><StatusPill status={p.status} /><span className="text-muted-foreground">{p.community}, {p.emirate} · {p.type}{p.bedrooms ? ` · ${p.bedrooms} BR` : ""}</span></div>
          {acc.contract && <p className="mt-2 text-sm">Contract {agreementRef(c)}: {fmtDate(c.start_date)} → {fmtDate(c.end_date)} · {aed(c.annual_rent)}/yr · paid {c.frequency.replace("_", "-")}</p>}
        </Card>)}
      {acc.upcoming_rent && (
        <Card title="Upcoming rent">
          <Table head={["#", "Due date", "Amount", "Status", ""]} empty={!inst.length}>
            {inst.map((i) => <tr key={i.id}><Td>{i.no}</Td><Td>{fmtDate(i.due_date)}</Td><Td className="tabular-nums">{aed(s.balance(i))}</Td><Td>{s.isOverdue(i) ? <Pill tone="red">Overdue</Pill> : <Pill>Upcoming</Pill>}</Td><Td><a href={`/pay/${i.id}`}><Button size="sm" variant="outline">Pay</Button></a></Td></tr>)}
          </Table>
        </Card>)}
      {acc.utilities && <TenantUtilities contractId={c.id} bills={bills} />}
      {acc.documents && <>
        <DocumentsPanel entity="tenant" entityId={tenantId} categories={["emirates_id", "passport", "kyc"]} title="My documents" canUpload={acc.upload} canDelete={false} />
        {acc.contract && <DocumentsPanel entity="contract" entityId={c.id} categories={["tenancy_contract"]} title="Tenancy agreement" canUpload={false} canDelete={false} />}
      </>}
    </Page>
  );
}

/** A tenant's utility bill: they can upload the payment receipt for staff to check. */
function TenantBillRow({ bill: u }: { bill: UtilityBill }) {
  const s = useStore();
  const ref = useRef<HTMLInputElement>(null);
  const month = new Date(`${u.period}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  function upload(f: File | undefined) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { s.notify("File too large", `${f.name} is over 10 MB.`); return; }
    const r = new FileReader();
    r.onload = () => {
      const doc = s.saveDoc({ entity: "utility", entity_id: u.id, category: "utility_receipt", name: f.name, mime: f.type || "application/octet-stream", url: String(r.result), uploaded_on: today() });
      s.saveUtility({ ...u, receipt_doc_id: doc.id, receipt_status: "submitted" });
      s.notify("Receipt sent", "Thank you. We'll check it and mark the bill paid.");
    };
    r.readAsDataURL(f);
  }
  return (
    <tr>
      <Td>{UTIL_LABEL[u.type]}</Td><Td>{month}</Td><Td>{aed(u.amount)}</Td>
      <Td>{u.status === "paid" ? <Pill tone="green">Paid</Pill> : u.receipt_status === "submitted" ? <Pill tone="blue">Receipt being checked</Pill> : <Pill tone="red">Unpaid</Pill>}
        {u.receipt_status === "rejected" && u.status !== "paid" && <div className="text-xs text-[#9a3f22]">Receipt not accepted, please upload again</div>}</Td>
      <Td>{u.status === "unpaid" && u.receipt_status !== "submitted" && <>
        <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />I've paid — upload receipt</Button></>}</Td>
    </tr>
  );
}

/** The tenant's utility account: pay the provider, report a paid bill, see every bill. */
function TenantUtilities({ contractId, bills }: { contractId: number; bills: UtilityBill[] }) {
  const { provider, account } = useUtilityAccount(contractId);
  const [reporting, setReporting] = useState(false);
  const unpaid = bills.filter((b) => b.status === "unpaid" && b.receipt_status !== "submitted");
  return (
    <Card title="Electricity & water" actions={<span />}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{provider} account {account || "—"}</div>
          <div className="text-xs text-muted-foreground">{unpaid.length ? `${unpaid.length} unpaid · ${aed(unpaid.reduce((t, b) => t + b.amount, 0))}` : "No unpaid bills on record"}</div>
        </div>
        <PayBillButton contractId={contractId} amount={unpaid.length ? unpaid.reduce((t, b) => t + b.amount, 0) : undefined} />
        <Button size="sm" onClick={() => setReporting(true)}><Upload className="h-4 w-4" />I've paid a bill</Button>
      </div>
      {bills.length > 0 && <div className="mt-4"><Table head={["Utility", "Month", "Amount", "Status", ""]}>{bills.map((u) => <TenantBillRow key={u.id} bill={u} />)}</Table></div>}
      {reporting && <ReportPaymentDialog contractId={contractId} asTenant onClose={() => setReporting(false)} />}
    </Card>
  );
}
