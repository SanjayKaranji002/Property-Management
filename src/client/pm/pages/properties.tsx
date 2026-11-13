import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aed, EMIRATES, fmtDate, type Property, type PropertyStatus, agreementRef } from "../data";
import { useStore } from "../store";
import { L, useHref } from "../nav";
import { attachUploads, Card, DocumentsPanel, PendingUploads, Field, Modal, NSelect, Page, Pill, SearchBox, StatusPill, Table, Td, type PendingFile } from "../ui";

export function PropertiesPage({ go }: { go: (to: string) => void }) {
  const s = useStore();
  const h = useHref();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(() => new URLSearchParams(location.search).get("status") ?? "all");
  const [landlord, setLandlord] = useState("all");
  const [editing, setEditing] = useState<Partial<Property> | null>(null);
  const rows = s.visibleProperties.filter((p) =>
    (status === "all" || p.status === status) && (landlord === "all" || p.landlord_id === Number(landlord)) &&
    `${p.name} ${p.unit_no} ${p.community} ${p.emirate}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page title="Properties" meta={`${rows.length} of ${s.visibleProperties.length} properties`}
      actions={s.can("properties", "edit") && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add property</Button>}>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, unit, community…" />
        <NSelect className="w-40" value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, "rented", "occupied", "vacant"].map((o) => typeof o === "string" ? { value: o, label: o[0].toUpperCase() + o.slice(1) } : o)} />
        <NSelect className="w-56" value={landlord} onChange={setLandlord} options={[{ value: "all", label: "All landlords" }, ...s.landlords.map((l) => ({ value: l.id, label: l.name }))]} />
      </div>
      <Table head={["Property", "Usage", "Location", "Landlord", "Status", "Rental value", "Current tenant"]} empty={!rows.length}>
        {rows.map((p) => { const c = s.activeContractFor(p.id); return (
          <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => go(`/properties/${p.id}`)}>
            <Td className="font-medium">{p.name} · {p.unit_no}<div className="text-xs font-normal text-muted-foreground">{p.type}{p.bedrooms ? ` · ${p.bedrooms} BR` : ""} · {p.size_sqft} sqft</div></Td>
            <Td><Pill tone={p.usage === "commercial" ? "violet" : "gray"}>{p.usage}</Pill></Td>
            <Td>{p.community}, {p.emirate}</Td><Td><L to={h.landlord(p.landlord_id)}>{s.landlord(p.landlord_id)?.name}</L></Td>
            <Td><StatusPill status={p.status} /></Td><Td className="tabular-nums">{aed(p.rental_value)}/yr</Td>
            <Td>{c ? s.tenantName(c.tenant_id) : "—"}</Td>
          </tr>); })}
      </Table>
      <PropertyDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

export function PropertyDialog({ value, onClose }: { value: Partial<Property> | null; onClose: () => void }) {
  const s = useStore();
  const h = useHref();
  const [f, setF] = useState<Partial<Property>>({});
  const [lastOpen, setLastOpen] = useState<unknown>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  if (value !== lastOpen) { setLastOpen(value); if (value) { setF({ usage: "residential", type: "Apartment", emirate: "Dubai", status: "vacant", landlord_id: s.landlords[0]?.id, bedrooms: 1, size_sqft: 0, rental_value: 0, ...value }); setFiles([]); } }
  const set = (k: keyof Property, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  // Step 3 control: property/unit IDs must be unique.
  const dup = s.properties.find((p) => p.id !== f.id && p.name.trim().toLowerCase() === (f.name ?? "").trim().toLowerCase() && p.unit_no.trim().toLowerCase() === (f.unit_no ?? "").trim().toLowerCase());
  const dupDewa = f.dewa_premise_no ? s.properties.find((p) => p.id !== f.id && p.dewa_premise_no === f.dewa_premise_no) : undefined;
  const valid = f.name && f.unit_no && f.landlord_id && !dup && !dupDewa;
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit property" : "Add property"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => { const saved = s.saveProperty(f as Property); attachUploads(s, "property", saved.id, files); s.notify("Property saved", `${f.name} · ${f.unit_no}`); onClose(); }}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Building / property name" className="col-span-2"><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Unit no."><Input value={f.unit_no ?? ""} onChange={(e) => set("unit_no", e.target.value)} /></Field>
        <Field label="Landlord"><NSelect value={f.landlord_id ?? ""} onChange={(v) => set("landlord_id", Number(v))} options={s.landlords.map((l) => ({ value: l.id, label: l.name }))} /></Field>
        <Field label="Usage"><NSelect value={f.usage ?? ""} onChange={(v) => set("usage", v)} options={[{ value: "residential", label: "Residential" }, { value: "commercial", label: "Commercial" }]} /></Field>
        <Field label="Type"><NSelect value={f.type ?? ""} onChange={(v) => set("type", v)} options={["Apartment", "Villa", "Townhouse", "Office", "Retail", "Warehouse", "Other"]} /></Field>
        <Field label="Community / area"><Input value={f.community ?? ""} onChange={(e) => set("community", e.target.value)} /></Field>
        <Field label="Emirate"><NSelect value={f.emirate ?? ""} onChange={(v) => set("emirate", v)} options={EMIRATES} /></Field>
        <Field label="Title deed no."><Input value={f.title_deed_no ?? ""} onChange={(e) => set("title_deed_no", e.target.value)} /></Field>
        <Field label="DEWA premise no."><Input value={f.dewa_premise_no ?? ""} onChange={(e) => set("dewa_premise_no", e.target.value)} placeholder="9 digits" /></Field>
        <Field label="Assigned broker"><NSelect value={f.broker_user_id ?? ""} onChange={(v) => set("broker_user_id", v ? Number(v) : null)} options={[{ value: "", label: "None" }, ...s.users.filter((u) => u.role === "broker").map((u) => ({ value: u.id, label: u.name }))]} /></Field>
        {(dup || dupDewa) && <p className="col-span-2 rounded-2xl bg-[#f6e1d8] px-3 py-2 text-xs text-[#9a3f22]">{dup ? `${dup.name} · ${dup.unit_no} is already registered.` : `DEWA premise ${f.dewa_premise_no} is already linked to ${dupDewa!.name} · ${dupDewa!.unit_no}.`}</p>}
        <Field label="Status"><NSelect value={f.status ?? ""} onChange={(v) => set("status", v as PropertyStatus)} options={[{ value: "vacant", label: "Vacant" }, { value: "rented", label: "Rented" }, { value: "occupied", label: "Occupied (owner)" }]} /></Field>
        <Field label="Bedrooms"><Input type="number" value={f.bedrooms ?? 0} onChange={(e) => set("bedrooms", Number(e.target.value))} /></Field>
        <Field label="Size (sqft)"><Input type="number" value={f.size_sqft ?? 0} onChange={(e) => set("size_sqft", Number(e.target.value))} /></Field>
        <Field label="Annual rental value (AED)" className="col-span-2"><Input type="number" value={f.rental_value ?? 0} onChange={(e) => set("rental_value", Number(e.target.value))} /></Field>
        <div className="col-span-2"><PendingUploads files={files} onChange={setFiles} categories={["photo", "title_deed", "other"]} title="Photos & title documents" /></div>
      </div>
    </Modal>
  );
}

export function PropertyDetail({ id, go, portal }: { id: number; go: (to: string) => void; portal?: boolean }) {
  const s = useStore();
  const h = useHref();
  const [editing, setEditing] = useState<Property | null>(null);
  const p = s.property(id);
  if (!p) return <Page title="Not found"><p>Property not found.</p></Page>;
  const history = s.contracts.filter((c) => c.property_id === id).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const current = s.activeContractFor(id);
  const tenant = current ? s.tenant(current.tenant_id) : undefined;
  return (
    <Page title={`${p.name} · ${p.unit_no}`} meta={<StatusPill status={p.status} />}
      actions={<>{!portal && <Button variant="ghost" onClick={() => go("/properties")}>Back</Button>}{!portal && s.can("properties", "edit") && <Button variant="outline" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" />Edit</Button>}</>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Profile">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            {[["Landlord", s.landlord(p.landlord_id)?.name], ["Usage", p.usage], ["Type", p.type], ["Location", `${p.community}, ${p.emirate}`], ["Title deed", p.title_deed_no], ["DEWA premise", p.dewa_premise_no || "—"], ["Bedrooms", p.bedrooms || "—"], ["Size", `${p.size_sqft} sqft`], ["Rental value", `${aed(p.rental_value)}/yr`]].map(([k, v]) => (
              <div key={String(k)} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="capitalize">{v}</dd></div>))}
          </dl>
        </Card>
        <Card title="Current occupant">
          {tenant && current ? (
            <div className="space-y-1 text-sm">
              <button className="font-medium hover:underline" onClick={() => !portal && go(`/tenants/${tenant.id}`)}>{tenant.first_name} {tenant.last_name}</button>
              <div className="text-muted-foreground">{tenant.phone} · {tenant.email}</div>
              <div>Contract {agreementRef(current)}: {fmtDate(current.start_date)} → {fmtDate(current.end_date)}</div>
              <div>{aed(current.annual_rent)}/yr · {current.frequency.replace("_", "-")}</div>
            </div>) : <p className="text-sm text-muted-foreground">Vacant — no active contract.</p>}
        </Card>
        <DocumentsPanel entity="property" entityId={id} categories={["photo", "title_deed", "other"]} title="Photos & title documents" canUpload={portal ? s.settings.landlord_access.upload : s.can("properties", "edit")} canDelete={!portal && s.can("properties", "edit")} />
      </div>
      <Card title="Tenancy history">
        <Table head={["Contract", "Tenant", "Period", "Annual rent", "Type", "Status"]} empty={!history.length}>
          {history.map((c) => (
            <tr key={c.id}><Td><L to={h.contract(c.id)} className="font-medium">{agreementRef(c)}</L></Td><Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td><Td>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</Td>
              <Td className="tabular-nums">{aed(c.annual_rent)}</Td><Td>{c.role === "sub_tenant" ? <Pill tone="violet">Sub-let</Pill> : <Pill>{c.usage}</Pill>}</Td>
              <Td><Pill tone={c.status === "active" ? "green" : "gray"}>{c.status}</Pill></Td></tr>))}
        </Table>
      </Card>
      <PropertyDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}
