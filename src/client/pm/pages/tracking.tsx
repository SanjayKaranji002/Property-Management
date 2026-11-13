import { useRef, useState } from "react";
import { CheckCircle2, Circle, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { daysUntil, fmtDate, type Contract, agreementRef } from "../data";
import { useStore } from "../store";
import { L, useHref } from "../nav";
import { Card, Modal, NSelect, Page, Pill, SearchBox, Stat, Table, Td } from "../ui";
import { DEWA_LABEL, EjariDewaForm, EjariPill } from "./contracts";
import { ejariStatus } from "../data";

// ── Steps 6 & 7: Ejari and DEWA tracking ──────────────────────────────

export function EjariDewaPage() {
  const s = useStore();
  const h = useHref();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("attention");
  const [open, setOpen] = useState<Contract | null>(null);
  const visible = new Set(s.visibleProperties.map((p) => p.id));
  const base = s.contracts.filter((c) => visible.has(c.property_id) && c.status !== "renewed");
  const needs = (c: Contract) => c.status === "active" && (ejariStatus(c) !== "registered" || c.dewa_status !== "active" || !c.dewa_deposit_confirmed || daysUntil(c.ejari_expiry) <= 60);
  const FILTERS: Record<string, (c: Contract) => boolean> = {
    attention: needs, all: () => true, closed: (c) => c.status !== "active",
    ejari_registered: (c) => c.status === "active" && ejariStatus(c) === "registered",
    ejari_renewal: (c) => c.status === "active" && ejariStatus(c) === "renewal_pending",
    dewa_active: (c) => c.status === "active" && c.dewa_status === "active",
    dewa_waiting: (c) => c.status === "active" && c.dewa_status !== "active",
  };
  // Clicking a tile filters the list; clicking it again goes back to "Needs attention".
  const pick = (f: string) => setFilter((cur) => (cur === f ? "attention" : f));
  const rows = base.filter((c) => (FILTERS[filter] ?? needs)(c) &&
    `${s.propLabel(c.property_id)} ${s.tenantName(c.tenant_id)} ${c.ejari_no} ${c.dewa_account}`.toLowerCase().includes(q.toLowerCase()));
  const active = base.filter((c) => c.status === "active");

  return (
    <Page title="Ejari & DEWA" meta="Registration, renewal, cancellation and move-in activation">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ejari registered" value={`${active.filter((c) => ejariStatus(c) === "registered").length}/${active.length}`} tone="good" onClick={() => pick("ejari_registered")} active={filter === "ejari_registered"} />
        <Stat label="Ejari renewal pending" value={active.filter((c) => ejariStatus(c) === "renewal_pending").length} tone="warn" onClick={() => pick("ejari_renewal")} active={filter === "ejari_renewal"} />
        <Stat label="DEWA active" value={`${active.filter((c) => c.dewa_status === "active").length}/${active.length}`} onClick={() => pick("dewa_active")} active={filter === "dewa_active"} />
        <Stat label="Awaiting DEWA activation" value={active.filter((c) => c.dewa_status !== "active").length} tone="bad" onClick={() => pick("dewa_waiting")} active={filter === "dewa_waiting"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <NSelect className="w-52" value={filter} onChange={setFilter} options={[{ value: "attention", label: "Needs attention" }, { value: "all", label: "All agreements" }, { value: "ejari_registered", label: "Ejari registered" }, { value: "ejari_renewal", label: "Ejari renewal pending" }, { value: "dewa_active", label: "DEWA active" }, { value: "dewa_waiting", label: "Awaiting DEWA activation" }, { value: "closed", label: "Closed / cancelled" }]} />
        <div className="flex-1" /><SearchBox value={q} onChange={setQ} placeholder="Ejari, DEWA account, tenant…" />
      </div>
      <Table head={["Agreement", "Property / premise", "Tenant", "Ejari", "Valid until", "DEWA account", "DEWA", "Move-in"]} empty={!rows.length}>
        {rows.map((c) => { const p = s.property(c.property_id); const d = daysUntil(c.ejari_expiry); return (
          <tr key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(c)}>
            <Td className="font-medium">{agreementRef(c)}</Td>
            <Td><L to={h.property(c.property_id)}>{s.propLabel(c.property_id)}</L><div className="text-xs text-muted-foreground">Premise {p?.dewa_premise_no || "—"}</div></Td>
            <Td><L to={h.tenant(c.tenant_id)}>{s.tenantName(c.tenant_id)}</L></Td>
            <Td><EjariPill c={c} /></Td>
            <Td>{fmtDate(c.ejari_expiry)}{c.status === "active" && d <= 60 && <div className="text-xs text-[#b4532f]">{d} days</div>}</Td>
            <Td className="tabular-nums">{c.dewa_account || "—"}</Td>
            <Td><Pill tone={DEWA_LABEL[c.dewa_status][1]}>{DEWA_LABEL[c.dewa_status][0]}</Pill>{!c.dewa_deposit_confirmed && c.status === "active" && <div className="text-xs text-muted-foreground">deposit unconfirmed</div>}</Td>
            <Td>{fmtDate(c.move_in_date)}</Td>
          </tr>); })}
      </Table>
      {open && <Modal wide open onClose={() => setOpen(null)} title={`${agreementRef(open)} · ${s.propLabel(open.property_id)}`}><EjariDewaForm contract={s.contract(open.id)!} /></Modal>}
    </Page>
  );
}
