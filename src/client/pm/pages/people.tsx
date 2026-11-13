import { useState } from "react";
import { Pencil, Plus, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aed, daysUntil, fmtDate, NATIONALITIES, type KycStatus, type Landlord, type Tenant, agreementRef } from "../data";
import { useStore } from "../store";
import { L, useHref } from "../nav";
import { NotifyButton } from "./notify";
import { attachUploads, Card, DocumentsPanel, PendingUploads, Field, Modal, NSelect, Page, Pill, SearchBox, StatusPill, Table, Td, type PendingFile } from "../ui";

// ── Landlords ──────────────────────────────────────────────────────

export function LandlordsPage({ go }: { go: (to: string) => void }) {
  const s = useStore();
  const h = useHref();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Landlord> | null>(null);
  const rows = s.landlords.filter((l) => `${l.name} ${l.email} ${l.phone}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Landlords" meta={`${s.landlords.length} landlords`} actions={s.can("landlords", "edit") && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add landlord</Button>}>
      <SearchBox value={q} onChange={setQ} />
      <Table head={["Landlord", "Contact", "Nationality", "Properties", "Portal login"]} empty={!rows.length}>
        {rows.map((l) => { const n = s.properties.filter((p) => p.landlord_id === l.id).length; const login = s.users.find((u) => u.landlord_id === l.id); return (
          <tr key={l.id} className="cursor-pointer hover:bg-muted/40" onClick={() => go(`/landlords/${l.id}`)}>
            <Td className="font-medium">{l.name} {l.own_portfolio && <Pill tone="blue">Own portfolio</Pill>}</Td>
            <Td>{l.email}<div className="text-xs text-muted-foreground">{l.phone}</div></Td><Td>{l.nationality}</Td><Td>{n}</Td>
            <Td>{login ? <Pill tone="green">{login.email}</Pill> : <Pill>None</Pill>}</Td>
          </tr>); })}
      </Table>
      <LandlordDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function LandlordDialog({ value, onClose }: { value: Partial<Landlord> | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState<Partial<Landlord>>({});
  const [createLogin, setCreateLogin] = useState(true);
  const [last, setLast] = useState<unknown>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  if (value !== last) { setLast(value); if (value) { setF({ nationality: "Emirati", own_portfolio: false, ...value }); setFiles([]); } }
  const set = (k: keyof Landlord, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  function save() {
    const l = s.saveLandlord(f as Landlord);
    attachUploads(s, "landlord", l.id, files);
    if (!value?.id && createLogin && f.email) s.saveUser({ name: f.name!, email: f.email, role: "landlord", landlord_id: l.id, active: true });
    s.notify("Landlord saved", f.name ?? ""); onClose();
  }
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit landlord" : "Add landlord"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!f.name} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name / company" className="col-span-2"><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone / WhatsApp"><Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+971 5x xxx xxxx" /></Field>
        <Field label="Nationality"><NSelect value={f.nationality ?? ""} onChange={(v) => set("nationality", v)} options={NATIONALITIES} /></Field>
        <Field label="Emirates ID"><Input value={f.emirates_id ?? ""} onChange={(e) => set("emirates_id", e.target.value)} placeholder="784-XXXX-XXXXXXX-X" /></Field>
        <Field label="Passport no."><Input value={f.passport_no ?? ""} onChange={(e) => set("passport_no", e.target.value)} /></Field>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={!!f.own_portfolio} onChange={(e) => set("own_portfolio", e.target.checked)} />Own portfolio</label>
        {!value?.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />Create an individual portal login for this landlord (invite sent to email)</label>}
        <div className="col-span-2"><PendingUploads files={files} onChange={setFiles} categories={["emirates_id", "passport", "kyc", "other"]} title="Owner documents (Emirates ID, passport, KYC)" withExpiry={["emirates_id", "passport"]} /></div>
      </div>
    </Modal>
  );
}

export function LandlordDetail({ id, go }: { id: number; go: (to: string) => void }) {
  const s = useStore();
  const h = useHref();
  const [editing, setEditing] = useState<Landlord | null>(null);
  const l = s.landlord(id);
  if (!l) return <Page title="Not found"><p>Landlord not found.</p></Page>;
  const props = s.properties.filter((p) => p.landlord_id === id);
  return (
    <Page title={l.name} meta={`${props.length} properties`} actions={<><Button variant="ghost" onClick={() => go("/landlords")}>Back</Button>{s.can("landlords", "edit") && <Button variant="outline" onClick={() => setEditing(l)}><Pencil className="h-4 w-4" />Edit</Button>}</>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile & KYC">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            {[["Email", l.email], ["Phone", l.phone], ["Nationality", l.nationality], ["Emirates ID", l.emirates_id], ["Passport", l.passport_no]].map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Card>
        <DocumentsPanel entity="landlord" entityId={id} categories={["emirates_id", "passport", "kyc", "other"]} title="Owner KYC documents" canUpload={s.can("landlords", "edit")} canDelete={s.can("landlords", "edit")} />
      </div>
      <Card title="Properties">
        <Table head={["Property", "Location", "Status", "Rental value"]} empty={!props.length}>
          {props.map((p) => <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => go(`/properties/${p.id}`)}><Td className="font-medium">{p.name} · {p.unit_no}</Td><Td>{p.community}, {p.emirate}</Td><Td><StatusPill status={p.status} /></Td><Td className="tabular-nums">{aed(p.rental_value)}</Td></tr>)}
        </Table>
      </Card>
      <LandlordDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

// ── Tenants ────────────────────────────────────────────────────────

export function TenantsPage({ go }: { go: (to: string) => void }) {
  const s = useStore();
  const h = useHref();
  const [q, setQ] = useState("");
  const [kyc, setKyc] = useState(() => new URLSearchParams(location.search).get("kyc") ?? "all");
  const [editing, setEditing] = useState<Partial<Tenant> | null>(null);
  const activeTenants = new Set(s.contracts.filter((c) => c.status === "active").map((c) => c.tenant_id));
  // Same rule as the dashboard's KYC alerts: not approved, ID expiring within 60 days, or required items missing.
  const isAlert = (t: Tenant) => activeTenants.has(t.id) && (t.kyc_status !== "approved" || daysUntil(t.emirates_id_expiry) <= 60 ||
    kycChecklist(t, (cat) => s.docs.some((d) => d.entity === "tenant" && d.entity_id === t.id && d.category === cat)).some((x) => x.required && !x.done));
  const rows = s.tenants.filter((t) => (kyc === "all" || (kyc === "alerts" ? isAlert(t) : t.kyc_status === kyc)) &&
    `${t.first_name} ${t.last_name} ${t.email} ${t.phone} ${t.emirates_id}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Tenants" meta={`${s.tenants.length} tenants`} actions={s.can("tenants", "edit") && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add tenant</Button>}>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, Emirates ID…" />
        <NSelect className="w-48" value={kyc} onChange={setKyc} options={[{ value: "all", label: "All KYC statuses" }, { value: "alerts", label: `KYC alerts (${s.tenants.filter(isAlert).length})` }, { value: "approved", label: "Approved" }, { value: "pending", label: "In review" }, { value: "missing", label: "Documents missing" }, { value: "rejected", label: "Rejected" }]} />
      </div>
      <Table head={["Tenant", "Contact", "Nationality", "Emirates ID", "Property", "KYC"]} empty={!rows.length}>
        {rows.map((t) => { const c = s.contracts.find((x) => x.tenant_id === t.id && x.status === "active"); const exp = daysUntil(t.emirates_id_expiry); return (
          <tr key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => go(`/tenants/${t.id}`)}>
            <Td className="font-medium">{t.first_name} {t.last_name}</Td><Td>{t.phone}<div className="text-xs text-muted-foreground">{t.email}</div></Td><Td>{t.nationality}</Td>
            <Td>{t.emirates_id}<div className={exp < 60 ? "text-xs text-[#b4532f]" : "text-xs text-muted-foreground"}>exp. {fmtDate(t.emirates_id_expiry)}</div></Td>
            <Td>{c ? s.propLabel(c.property_id) : "—"}{c?.role === "sub_tenant" && <> <Pill tone="violet">Sub-tenant</Pill></>}</Td>
            <Td><KycPill t={t} /></Td>
          </tr>); })}
      </Table>
      <TenantDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function TenantDialog({ value, onClose }: { value: Partial<Tenant> | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState<Partial<Tenant>>({});
  const [createLogin, setCreateLogin] = useState(true);
  const [last, setLast] = useState<unknown>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  if (value !== last) { setLast(value); if (value) { setF({ nationality: "Emirati", kyc_verified: false, kyc_status: "missing", driving_licence: "", driving_licence_expiry: "", ...value }); setFiles([]); } }
  const set = (k: keyof Tenant, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  function save() {
    const t = s.saveTenant(f as Tenant);
    // An ID copy without its own expiry takes the expiry typed in the form.
    attachUploads(s, "tenant", t.id, files.map((x) => ({ ...x, expiry: x.expiry || (x.category === "emirates_id" ? f.emirates_id_expiry : x.category === "passport" ? f.passport_expiry : undefined) })));
    if (!value?.id && createLogin && f.email) s.saveUser({ name: `${f.first_name} ${f.last_name}`, email: f.email, role: "tenant", tenant_id: t.id, active: true });
    s.notify("Tenant saved", `${f.first_name} ${f.last_name}`); onClose();
  }
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit tenant" : "Add tenant"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!f.first_name || !f.last_name} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name / company"><Input value={f.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} /></Field>
        <Field label="Last name"><Input value={f.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Mobile / WhatsApp"><Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+9715xxxxxxxx" /></Field>
        <Field label="Nationality" className="col-span-2"><NSelect value={f.nationality ?? ""} onChange={(v) => set("nationality", v)} options={NATIONALITIES} /></Field>
        <Field label="Emirates ID no."><Input value={f.emirates_id ?? ""} onChange={(e) => set("emirates_id", e.target.value)} placeholder="784-XXXX-XXXXXXX-X" /></Field>
        <Field label="Emirates ID expiry"><Input type="date" value={f.emirates_id_expiry ?? ""} onChange={(e) => set("emirates_id_expiry", e.target.value)} /></Field>
        <Field label="Passport no."><Input value={f.passport_no ?? ""} onChange={(e) => set("passport_no", e.target.value)} /></Field>
        <Field label="Passport expiry"><Input type="date" value={f.passport_expiry ?? ""} onChange={(e) => set("passport_expiry", e.target.value)} /></Field>
        <Field label="Driving licence no. (optional)"><Input value={f.driving_licence ?? ""} onChange={(e) => set("driving_licence", e.target.value)} /></Field>
        <Field label="Driving licence expiry"><Input type="date" value={f.driving_licence_expiry ?? ""} onChange={(e) => set("driving_licence_expiry", e.target.value)} /></Field>
        <p className="col-span-2 text-xs text-muted-foreground">A driving licence does not replace the Emirates ID / passport identity requirement.</p>
        {!value?.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />Create tenant portal login</label>}
        <div className="col-span-2"><PendingUploads files={files} onChange={setFiles} categories={["emirates_id", "passport", "kyc", "other"]} title="Emirates ID, passport & KYC documents" withExpiry={["emirates_id", "passport"]} /></div>
      </div>
    </Modal>
  );
}

export function TenantDetail({ id, go }: { id: number; go: (to: string) => void }) {
  const s = useStore();
  const h = useHref();
  const [editing, setEditing] = useState<Tenant | null>(null);
  const t = s.tenant(id);
  if (!t) return <Page title="Not found"><p>Tenant not found.</p></Page>;
  const contracts = s.contracts.filter((c) => c.tenant_id === id);
  const msgs = s.messages.filter((m) => m.tenant_id === id);
  return (
    <Page title={`${t.first_name} ${t.last_name}`} meta={<KycPill t={t} />}
      actions={<><Button variant="ghost" onClick={() => go("/tenants")}>Back</Button>{s.can("tenants", "edit") && <Button variant="outline" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" />Edit</Button>}</>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Contact & ID details">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            {[["Phone", t.phone], ["Email", t.email], ["Nationality", t.nationality], ["Emirates ID", t.emirates_id], ["EID expiry", fmtDate(t.emirates_id_expiry)], ["Passport", t.passport_no], ["Passport expiry", fmtDate(t.passport_expiry)], ["Driving licence", t.driving_licence || "—"], ["DL expiry", fmtDate(t.driving_licence_expiry)]].map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Card>
        <DocumentsPanel entity="tenant" entityId={id} categories={["emirates_id", "passport", "kyc", "other"]} title="Emirates ID, passport & KYC" canUpload={s.can("tenants", "edit")} canDelete={s.can("tenants", "edit")} />
      </div>
      <ExpiringDocs tenant={t} />
      <KycReview tenant={t} />
      <Card title="Contracts">
        <Table head={["Contract", "Property", "Period", "Annual rent", "Status"]} empty={!contracts.length}>
          {contracts.map((c) => <tr key={c.id}><Td><L to={h.contract(c.id)} className="font-medium">{agreementRef(c)}</L></Td><Td><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L></Td><Td>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</Td><Td className="tabular-nums">{aed(c.annual_rent)}</Td><Td><Pill tone={c.status === "active" ? "green" : "gray"}>{c.status}</Pill></Td></tr>)}
        </Table>
      </Card>
      <Card title="Communication history">
        {msgs.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> :
          <ul className="divide-y divide-border text-sm">{msgs.map((m) => <li key={m.id} className="py-2"><div className="flex gap-2"><Pill tone="green">{m.channel}</Pill><span className="font-medium">{m.kind}</span><span className="ml-auto text-xs text-muted-foreground">{m.at.replace("T", " ")}</span></div><p className="mt-1 text-muted-foreground">{m.body}</p></li>)}</ul>}
      </Card>
      <TenantDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function ExpiringDocs({ tenant: t }: { tenant: Tenant }) {
  const rows = ([["Emirates ID", t.emirates_id_expiry], ["passport", t.passport_expiry], ["driving licence", t.driving_licence ? t.driving_licence_expiry : ""]] as [string, string][])
    .filter(([, d]) => d && daysUntil(d) <= 90);
  if (!rows.length) return null;
  return (
    <Card title="Expiring documents">
      <ul className="divide-y divide-border/70 text-sm">{rows.map(([doc, d]) => { const n = daysUntil(d); return (
        <li key={doc} className="flex items-center gap-3 py-2"><span className="flex-1 capitalize">{doc}</span>
          <Pill tone={n <= 30 ? "red" : "amber"}>{n < 0 ? `expired ${-n} days ago` : `${n} days left`}</Pill>
          <NotifyButton event={{ kind: "document", tenantId: t.id, document: doc, expiry: d }} /></li>); })}
      </ul>
    </Card>
  );
}

// ── KYC (workflow step 4) ─────────────────────────────────────────

const KYC_TONE = { approved: "green", pending: "amber", missing: "red", rejected: "red" } as const;
export function KycPill({ t }: { t: Tenant }) {
  return <Pill tone={KYC_TONE[t.kyc_status]}>{t.kyc_status === "approved" ? "KYC approved" : t.kyc_status === "pending" ? "In review" : t.kyc_status === "missing" ? "Documents missing" : "Rejected"}</Pill>;
}

/** Checklist: required items must be present and in date; licence is optional. */
export function kycChecklist(t: Tenant, hasDoc: (cat: string) => boolean) {
  const ok = (iso: string) => !!iso && daysUntil(iso) > 0;
  return [
    { label: "Emirates ID number", required: true, done: !!t.emirates_id },
    { label: "Emirates ID copy uploaded", required: true, done: hasDoc("emirates_id") },
    { label: "Emirates ID in date", required: true, done: ok(t.emirates_id_expiry) },
    { label: "Passport copy uploaded", required: true, done: hasDoc("passport") || t.passport_no === "—" },
    { label: "Passport in date", required: true, done: ok(t.passport_expiry) || t.passport_no === "—" },
    { label: "Driving licence (optional)", required: false, done: !!t.driving_licence },
  ];
}

function KycReview({ tenant: t }: { tenant: Tenant }) {
  const s = useStore();
  const h = useHref();
  const [note, setNote] = useState(t.kyc_note ?? "");
  const list = kycChecklist(t, (cat) => s.docs.some((d) => d.entity === "tenant" && d.entity_id === t.id && d.category === cat));
  const missing = list.filter((i) => i.required && !i.done);
  const setStatus = (kyc_status: KycStatus) => { s.saveTenant({ ...t, kyc_status, kyc_verified: kyc_status === "approved", kyc_note: note }); s.notify("KYC updated", `${t.first_name} ${t.last_name}: ${kyc_status}`); };
  return (
    <Card title="KYC review" actions={<KycPill t={t} />}>
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="space-y-1.5 text-sm">{list.map((i) => (
          <li key={i.label} className="flex items-center gap-2">{i.done ? <ShieldCheck className="h-4 w-4 text-[#1f3d2b] dark:text-[#8fb89a]" /> : <ShieldAlert className={i.required ? "h-4 w-4 text-[#b4532f]" : "h-4 w-4 text-muted-foreground"} />}<span className={i.done ? "" : "text-muted-foreground"}>{i.label}</span></li>))}
        </ul>
        <div className="space-y-2">
          <Input placeholder="Review note (e.g. passport copy unclear)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {t.kyc_status === "missing" && <Button variant="outline" disabled={missing.length > 0} onClick={() => setStatus("pending")}>Submit for review</Button>}
            {s.canApprove(4) && <Button disabled={missing.length > 0} onClick={() => setStatus("approved")}>Approve KYC</Button>}
            {s.canApprove(4) && <Button variant="outline" onClick={() => setStatus("rejected")}>Reject</Button>}
          </div>
          {missing.length > 0 && <p className="text-xs text-[#b4532f]">Missing: {missing.map((m) => m.label).join(", ")}</p>}
        </div>
      </div>
    </Card>
  );
}
