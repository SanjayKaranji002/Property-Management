import { useState } from "react";
import { ArrowRight, Minus, Plus, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { aed, addMonthsIso, daysUntil, fmtDate, today } from "../data";
import { useStore } from "../store";
import { Card, NSelect, Page, Pill, StatusPill, Table, Td } from "../ui";
import { Segmented } from "./contracts";
import { kycChecklist } from "./people";
import { NotifyButton } from "./notify";
import { CsvImportDialog } from "./import-csv";
import { Button } from "@/components/ui/button";
import { clickable, L, useGo, useHref } from "../nav";


const GREEN = "#1f3d2b";

/** Thick rounded progress ring like the reference overview card. */
function Ring({ pct, label, size = 150 }: { pct: number; label: string; size?: number }) {
  const r = 58, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" role="img" aria-label={`${pct}% ${label}`}>
      <circle cx="75" cy="75" r={r} fill="none" stroke="currentColor" className="text-muted" strokeWidth="14" />
      <circle cx="75" cy="75" r={r} fill="none" stroke="currentColor" className="text-[#1f3d2b] dark:text-[#8fb89a]" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 75 75)" />
      <text x="75" y="78" textAnchor="middle" className="fill-foreground text-[30px] font-light">{pct}%</text>
      <text x="75" y="100" textAnchor="middle" className="fill-muted-foreground text-[11px]">{label}</text>
    </svg>
  );
}

function PillBars({ data, format }: { data: { label: string; value: number; highlight?: boolean }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-44 items-end justify-between gap-2 pt-6">
      {data.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${d.label}: ${format(d.value)}`}>
          {d.highlight && <span className="text-xs font-medium tabular-nums">{format(d.value)}</span>}
          <div className={cn("w-full max-w-7 rounded-full", d.highlight ? "bg-[#1f3d2b] dark:bg-[#8fb89a]" : "bg-muted")} style={{ height: `${Math.max(14, (d.value / max) * 100)}%` }} />
          <span className="text-[10px] uppercase text-muted-foreground">{d.label}</span>
        </div>))}
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values), w = 110, h = 34;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return <svg width={w} height={h + 2} className="text-[#1f3d2b] dark:text-[#8fb89a]"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

/** Occupancy & portfolio dashboard (step 11). `landlordId` locks it to one landlord (portal use). */
export function Dashboard({ landlordId, go }: { landlordId?: number; go: (to: string) => void }) {
  const s = useStore();
  const h = useHref();
  const nav = useGo();
  const tile = (to: string | null, extra = "") => { const c = clickable(nav, to); return { ...c, className: `${extra} rounded-2xl ${c.className ?? ""}` }; };
  const propsLink = (st: string) => (landlordId ? null : h.page(`/properties?status=${st}`, "properties"));
  const payLinkTab = (t: string) => (landlordId ? h.payments() : h.page(`/payments?tab=${t}`, "payments"));
  const [filter, setFilter] = useState<string>("all");
  const [focus, setFocus] = useState<"expiring" | "overdue" | "kyc">("expiring");
  const [shift, setShift] = useState(0);
  const [importing, setImporting] = useState(false);
  const lid = landlordId ?? (filter === "all" ? null : Number(filter));

  const props = s.visibleProperties.filter((p) => lid == null || p.landlord_id === lid);
  const propIds = new Set(props.map((p) => p.id));
  const contracts = s.contracts.filter((c) => propIds.has(c.property_id));
  const active = contracts.filter((c) => c.status === "active");
  const cIds = new Set(contracts.map((c) => c.id));
  const inst = s.installments.filter((i) => cIds.has(i.contract_id));

  const count = (st: string) => props.filter((p) => p.status === st).length;
  const rented = count("rented"), occupied = count("occupied"), vacant = count("vacant");
  const occRate = props.length ? Math.round(((rented + occupied) / props.length) * 100) : 0;
  const overdue = inst.filter(s.isOverdue);
  const overdueTotal = overdue.reduce((t, i) => t + s.balance(i), 0);
  const dueToDate = inst.filter((i) => i.due_date <= today());
  const collectedToDate = dueToDate.reduce((t, i) => t + i.paid, 0);
  const billedToDate = dueToDate.reduce((t, i) => t + i.amount, 0);
  const collectRate = billedToDate ? Math.round((collectedToDate / billedToDate) * 100) : 100;
  const upcoming = inst.filter((i) => s.balance(i) > 0 && daysUntil(i.due_date) >= 0 && daysUntil(i.due_date) <= 30).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const expiring = active.filter((c) => daysUntil(c.end_date) <= 90).sort((a, b) => a.end_date.localeCompare(b.end_date));
  const tenantIds = new Set(active.map((c) => c.tenant_id));
  const kycAlerts = s.tenants.filter((t) => tenantIds.has(t.id)).map((t) => {
    const missing = kycChecklist(t, (cat) => s.docs.some((d) => d.entity === "tenant" && d.entity_id === t.id && d.category === cat)).filter((x) => x.required && !x.done);
    const eid = daysUntil(t.emirates_id_expiry);
    const issue = t.kyc_status !== "approved" ? `KYC ${t.kyc_status}` : eid <= 60 ? `Emirates ID expires in ${eid} days` : missing.length ? `${missing.length} items missing` : null;
    return issue ? { t, issue } : null;
  }).filter(Boolean) as { t: (typeof s.tenants)[number]; issue: string }[];

  // Collections per month: four back, current, one ahead (shiftable).
  const months = Array.from({ length: 6 }, (_, k) => addMonthsIso(today().slice(0, 8) + "01", k - 4 + shift).slice(0, 7));
  const monthNow = today().slice(0, 7);
  const bars = months.map((m) => ({ label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" }), value: inst.filter((i) => i.due_date.startsWith(m)).reduce((t, i) => t + i.amount, 0), highlight: m === monthNow }));
  const sparkMonths = Array.from({ length: 8 }, (_, k) => addMonthsIso(today().slice(0, 8) + "01", k - 7).slice(0, 7));
  const yearCollected = inst.filter((i) => (i.paid_on ?? "") >= addMonthsIso(today(), -12)).reduce((t, i) => t + i.paid, 0);

  const landlordRows = s.landlords.filter((l) => lid == null || l.id === lid).map((l) => {
    const lp = props.filter((p) => p.landlord_id === l.id);
    const ids = new Set(s.contracts.filter((c) => lp.some((p) => p.id === c.property_id)).map((c) => c.id));
    const li = s.installments.filter((i) => ids.has(i.contract_id));
    return { l, total: lp.length, let: lp.filter((p) => p.status !== "vacant").length, overdue: li.filter(s.isOverdue).reduce((t, i) => t + s.balance(i), 0), collected: li.reduce((t, i) => t + i.paid, 0) };
  }).filter((r) => r.total > 0);

  const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

  return (
    <Page title={landlordId ? "My portfolio" : "Dashboard"} meta={`${props.length} properties · ${active.length} active agreements`}
      actions={!landlordId && <>
        {s.can("migration", "edit") && <Button variant="outline" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import CSV</Button>}
        <NSelect className="w-56" value={filter} onChange={setFilter} options={[{ value: "all", label: "All landlords" }, ...s.landlords.map((l) => ({ value: l.id, label: l.name }))]} />
      </>}>
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Overview */}
        <Card title="Overview">
          <p className="mb-3 text-[13px] leading-snug text-muted-foreground">{occRate}% of the portfolio is currently let or owner-occupied.</p>
          <div className="flex items-center gap-5">
            <div {...tile(propsLink("all"), "-m-1 p-1 !rounded-full")}><Ring pct={occRate} label="Occupied" /></div>
            <div className="space-y-4 border-l border-border pl-5">
              <div {...tile(propsLink("vacant"), "-m-2 p-2")}><div className="text-2xl font-light tabular-nums">{vacant}</div><div className="text-xs text-muted-foreground">Vacant now</div></div>
              <div {...tile(propsLink("rented"), "-m-2 p-2")}><div className="text-2xl font-light tabular-nums">{rented + occupied}</div><div className="text-xs text-muted-foreground">Let / occupied</div></div>
            </div>
          </div>
        </Card>

        {/* Collection status */}
        <Card title="Collection Status">
          <div className="flex items-start justify-between">
            <div {...tile(payLinkTab("all"), "-m-1 px-2 py-1")}><div className="text-5xl font-light tracking-tight tabular-nums">{collectRate}%</div></div>
            <span {...(() => { const c = clickable(nav, overdue.length ? payLinkTab("overdue") : null); return { ...c, className: undefined }; })()} className={cn("rounded-full px-3 py-1 text-xs font-medium", overdue.length ? "cursor-pointer hover:brightness-95" : "",  overdue.length ? "bg-[#f6e1d8] text-[#9a3f22]" : "bg-[#1f3d2b] text-[#f4f1ea]")}>{overdue.length ? `${overdue.length} overdue` : "On track"}</span>
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground">Rent collected to date</div>
          <p className="mt-5 text-[11px] uppercase leading-relaxed tracking-wide text-muted-foreground">{aed(overdueTotal)} overdue · {aed(upcoming.reduce((t, i) => t + s.balance(i), 0))} due in the next 30 days</p>
          <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-2xl bg-muted/60 py-3 text-center">
            <div {...tile(landlordId ? null : h.page("/properties", "properties"), "mx-1 py-1")}><div className="text-xl font-light tabular-nums">{props.length}</div><div className="text-[11px] text-muted-foreground">Properties</div></div>
            <div {...tile(landlordId ? h.page("/portal/contracts") : h.page("/contracts?tab=expiring", "contracts"), "mx-1 py-1")}><div className="text-xl font-light tabular-nums">{expiring.length}</div><div className="text-[11px] text-muted-foreground">Expiring</div></div>
            <div {...tile(landlordId ? null : h.page("/tenants?kyc=alerts", "tenants"), "mx-1 py-1")}><div className="text-xl font-light tabular-nums">{kycAlerts.length}</div><div className="text-[11px] text-muted-foreground">KYC alerts</div></div>
          </div>
        </Card>

        {/* Attention */}
        <Card title="Needs attention" actions={<span />} className="lg:row-span-2">
          <Segmented value={focus} onChange={setFocus} options={[{ value: "expiring", label: "Expiring" }, { value: "overdue", label: "Overdue" }, { value: "kyc", label: "KYC" }]} />
          <ul className="mt-4 space-y-3">
            {focus === "expiring" && (expiring.length ? expiring.slice(0, 6).map((c) => { const d = daysUntil(c.end_date); return (
              <li key={c.id} {...tile(h.contract(c.id), "bg-muted/50 p-3")}>
                <div className="flex items-center gap-2"><span className="flex-1 text-sm font-medium">{s.propLabel(c.property_id)}</span><Pill tone={d <= 60 ? "red" : "amber"}>{d} days</Pill></div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><span className="flex-1">{s.tenantName(c.tenant_id)} · ends {fmtDate(c.end_date)}</span>{!landlordId && <NotifyButton event={{ kind: "expiry", contractId: c.id }} />}</div>
              </li>); }) : <Empty />)}
            {focus === "overdue" && (overdue.length ? overdue.slice(0, 6).map((i) => { const c = s.contract(i.contract_id)!; return (
              <li key={i.id} {...tile(h.contract(i.contract_id), "bg-muted/50 p-3")}>
                <div className="flex items-center gap-2"><span className="flex-1 text-sm font-medium">{s.propLabel(c.property_id)}</span><span className="text-sm tabular-nums">{aed(s.balance(i))}</span></div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><span className="flex-1">{s.tenantName(c.tenant_id)} · #{i.no} · {-daysUntil(i.due_date)} days late</span>{!landlordId && <NotifyButton event={{ kind: "payment", installmentId: i.id }} />}</div>
              </li>); }) : <Empty />)}
            {focus === "kyc" && (kycAlerts.length ? kycAlerts.map(({ t, issue }) => (
              <li key={t.id} {...tile(h.tenant(t.id), "bg-muted/50 p-3")}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.first_name} {t.last_name}</div>
                    <div className="mt-0.5 text-xs text-[#b4532f]">{issue}</div>
                  </div>
                  {!landlordId && <NotifyButton event={docEvent(t)} />}
                </div>
              </li>)) : <Empty />)}
          </ul>
          {!landlordId && <button className="mt-4 flex w-full items-center justify-between rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => go(focus === "overdue" ? "/payments" : focus === "kyc" ? "/tenants" : "/contracts")}>
            View all <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground/15"><ArrowRight className="h-3.5 w-3.5" /></span></button>}
        </Card>

        {/* Rent by month */}
        <Card title="Rent schedule by month" actions={<div className="flex gap-1"><IconBtn onClick={() => setShift((x) => x - 1)}><Minus className="h-3.5 w-3.5" /></IconBtn><IconBtn onClick={() => setShift((x) => x + 1)}><Plus className="h-3.5 w-3.5" /></IconBtn></div>}>
          <div {...tile(payLinkTab("all"), "-m-2 p-2")}><PillBars data={bars} format={(n) => `AED ${k(n)}`} /></div>
        </Card>

        <div className="grid grid-cols-2 gap-5">
          <div {...tile(payLinkTab("paid"), "pm-card !rounded-[1.75rem] border border-border/70 bg-card p-5")}>
            <div className="text-[13px] text-muted-foreground">Collected (12 mo)</div>
            <div className="mt-2 text-2xl font-light tabular-nums">AED {k(yearCollected)}</div>
            <div className="mt-3"><Spark values={sparkMonths.map((m) => inst.filter((i) => (i.paid_on ?? "").startsWith(m)).reduce((t, i) => t + i.paid, 0))} /></div>
          </div>
          <div {...tile(payLinkTab("overdue"), "pm-card !rounded-[1.75rem] border border-border/70 bg-card p-5")}>
            <div className="text-[13px] text-muted-foreground">Overdue</div>
            <div className="mt-2 flex items-baseline justify-between"><span className="text-2xl font-light tabular-nums">AED {k(overdueTotal)}</span><span className="text-sm tabular-nums">{overdue.length}</span></div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${100 - collectRate}%`, background: GREEN }} /></div>
          </div>
        </div>
      </div>

      <Card title="Payment schedule · next 30 days">
        {upcoming.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-border/70 text-sm">{upcoming.map((i) => { const c = s.contract(i.contract_id)!; return (
            <li key={i.id} className="flex items-center gap-3 py-2.5"><span className="min-w-0 flex-1 truncate"><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L> <span className="text-muted-foreground">· <L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L> · <L to={h.contract(c.id)}>#{i.no}</L></span></span><span className="tabular-nums">{aed(s.balance(i))}</span><span className="w-24 text-right text-xs text-muted-foreground">{fmtDate(i.due_date)}</span>{!landlordId && <NotifyButton event={{ kind: "payment", installmentId: i.id }} />}</li>); })}</ul>)}
      </Card>

      {!landlordId && (
        <div>
          <h2 className="mb-2 px-1 text-[15px] font-medium">Landlord-wise</h2>
          <Table head={["Landlord", "Properties", "Let", "Collected", "Overdue"]} empty={!landlordRows.length}>
            {landlordRows.map((r) => (
              <tr key={r.l.id} className="cursor-pointer hover:bg-muted/40" onClick={() => go(`/landlords/${r.l.id}`)}>
                <Td className="font-medium">{r.l.name} {r.l.own_portfolio && <Pill tone="blue">Own</Pill>}</Td><Td>{r.total}</Td><Td>{r.let}/{r.total}</Td>
                <Td className="tabular-nums">{aed(r.collected)}</Td><Td className={r.overdue ? "tabular-nums text-[#b4532f]" : "tabular-nums"}>{aed(r.overdue)}</Td>
              </tr>))}
          </Table>
        </div>)}

      <div>
        <h2 className="mb-2 px-1 text-[15px] font-medium">Property-wise</h2>
        <Table head={["Property", "Location", "Status", "Rental value", "Tenant"]} empty={!props.length}>
          {props.map((p) => { const c = s.activeContractFor(p.id); return (
            <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => go(landlordId ? `/portal/property/${p.id}` : `/properties/${p.id}`)}>
              <Td className="font-medium">{p.name} · {p.unit_no}</Td><Td>{p.community}, {p.emirate}</Td><Td><StatusPill status={p.status} /></Td>
              <Td className="tabular-nums">{aed(p.rental_value)}/yr</Td><Td>{c ? s.tenantName(c.tenant_id) : "—"}</Td>
            </tr>); })}
        </Table>
      </div>
      {importing && <CsvImportDialog onClose={() => setImporting(false)} />}
    </Page>
  );
}

/** The tenant document that most needs renewing (soonest expiry). */
function docEvent(t: { id: number; emirates_id_expiry: string; passport_expiry: string; driving_licence: string; driving_licence_expiry: string }) {
  const docs = [["Emirates ID", t.emirates_id_expiry], ["passport", t.passport_expiry], ...(t.driving_licence ? [["driving licence", t.driving_licence_expiry]] : [])].filter(([, d]) => d) as [string, string][];
  const [document, expiry] = docs.sort((a, b) => a[1].localeCompare(b[1]))[0] ?? ["Emirates ID", t.emirates_id_expiry];
  return { kind: "document" as const, tenantId: t.id, document, expiry };
}

const Empty = () => <li className="list-none text-sm text-muted-foreground">Nothing here.</li>;
const IconBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) =>
  <button onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card hover:bg-muted">{children}</button>;
