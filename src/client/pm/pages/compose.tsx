import { useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { daysUntil, fmtDate, RECIPIENT_LABEL, VIA_LABEL, type Channel, type RecipientType, type SendVia } from "../data";
import { useStore } from "../store";
import { Field, Modal, NSelect, Pill, ViaPicker } from "../ui";

// ── Message templates: one per message type and recipient type ──────
// {placeholders} are filled from the selected person's records; parts in
// [square brackets] are left for the sender to complete.

export const MESSAGE_TYPES = ["General notice", "Payment follow-up", "Renewal", "Maintenance", "Document request", "Viewing / handover"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

const SIGN = "\n\nKind regards,\n{sender}";
const TEMPLATES: Record<MessageType, Record<RecipientType, string>> = {
  "General notice": {
    tenant: "Dear {name},\n\nWe would like to inform you about {property}: [write the notice here]." + SIGN,
    landlord: "Dear {name},\n\nAn update regarding your portfolio ({count}): [write the notice here]." + SIGN,
    broker: "Hi {name},\n\nQuick update for you: [write the notice here].\n\nThanks",
    manager: "Hi {name},\n\nFor your attention: [write the notice here].\n\nThanks",
    finance: "Hi {name},\n\nFor your attention: [write the notice here].\n\nThanks",
  },
  "Payment follow-up": {
    tenant: "Dear {name},\n\nThis is a reminder that rent instalment #{no} of {amount} for {property} is due on {due}{late}.\n\nYou can pay securely here: {link}\n\nIf you have already paid, please ignore this message." + SIGN,
    landlord: "Dear {name},\n\nPayment status for your properties: {overdue} is currently overdue. We are following up with the tenants and will update you once payments are received." + SIGN,
    broker: "Hi {name},\n\nSome tenants on your assigned units have overdue rent. Please help us follow up with them.\n\nThanks",
    manager: "Hi {name},\n\n{overdue} in rent is currently overdue across the portfolio. Please follow up with the tenants and record receipts once received.\n\nThanks",
    finance: "Hi {name},\n\n{overdue} in rent is currently overdue. Please review the outstanding balances and confirm any cleared cheques.\n\nThanks",
  },
  "Renewal": {
    tenant: "Dear {name},\n\nYour tenancy for {property} expires on {end}. Please let us know whether you would like to renew so we can prepare the new agreement and Ejari in good time." + SIGN,
    landlord: "Dear {name},\n\nSome tenancies in your portfolio are coming up for renewal. Please confirm whether you agree to renew and any change to the annual rent." + SIGN,
    broker: "Hi {name},\n\nSome agreements on your assigned units expire soon. Please be ready to market any unit where the tenant does not renew.\n\nThanks",
    manager: "Hi {name},\n\nPlease review the agreements expiring in the next 90 days, contact the tenants and landlords about renewal, and update Ejari once terms are agreed.\n\nThanks",
    finance: "Hi {name},\n\nPlease review outstanding balances and deposits for the agreements expiring in the next 90 days.\n\nThanks",
  },
  "Maintenance": {
    tenant: "Dear {name},\n\nWe would like to arrange maintenance at {property} on [date] between [time]. Please confirm someone will be available to provide access." + SIGN,
    landlord: "Dear {name},\n\nMaintenance is required at one of your properties: [describe the work]. The estimated cost is AED [amount]. Please confirm your approval." + SIGN,
    broker: "Hi {name},\n\nMaintenance is scheduled at [property] on [date]. Please avoid booking viewings during that time.\n\nThanks",
    manager: "Hi {name},\n\nPlease arrange maintenance at [property]: [describe the work].\n\nThanks",
    finance: "Hi {name},\n\nPlease process the maintenance cost of AED [amount] for [property].\n\nThanks",
  },
  "Document request": {
    tenant: "Dear {name},\n\nTo keep your tenancy file up to date, please send us a copy of your {document}. You can reply to this message with a photo or PDF." + SIGN,
    landlord: "Dear {name},\n\nPlease send us a copy of your [title deed / Emirates ID / passport] so we can complete your owner file." + SIGN,
    broker: "Hi {name},\n\nPlease send us the [document] for [property / tenant].\n\nThanks",
    manager: "Hi {name},\n\nPlease collect the missing KYC documents from the tenants flagged on the dashboard.\n\nThanks",
    finance: "Hi {name},\n\nPlease send us the [receipt / statement] for [reference].\n\nThanks",
  },
  "Viewing / handover": {
    tenant: "Dear {name},\n\nWe would like to arrange a [viewing / handover inspection] at {property} on [date] at [time]. Please confirm this suits you." + SIGN,
    landlord: "Dear {name},\n\nA [viewing / handover] is scheduled at your property on [date] at [time]. We will share the outcome with you afterwards." + SIGN,
    broker: "Hi {name},\n\nPlease arrange a viewing at [property] on [date] at [time] for [client name].\n\nThanks",
    manager: "Hi {name},\n\nPlease attend the [viewing / handover] at [property] on [date] at [time] and complete the inspection checklist.\n\nThanks",
    finance: "Hi {name},\n\nA handover is scheduled at [property] on [date]. Please prepare the final dues and deposit settlement.\n\nThanks",
  },
};

function ChannelTags({ chs }: { chs: Channel[] }) {
  if (!chs.length) return <Pill tone="red">No contact</Pill>;
  return <>{chs.map((c) => <Pill key={c} tone={c === "whatsapp" ? "green" : "blue"}>{c === "whatsapp" ? "WhatsApp" : "Email"}</Pill>)}</>;
}

export function ComposeDialog({ open, onClose, tenantIds, fromLandlord }: { open: boolean; onClose: () => void; tenantIds?: number[]; fromLandlord?: number }) {
  const s = useStore();
  // Landlords may only write to their own tenants; staff can write to anyone.
  const types: RecipientType[] = fromLandlord ? ["tenant"] : ["tenant", "landlord", "broker", "manager", "finance"];
  const listFor = (t: RecipientType) => s.recipients(t).filter((r) => t !== "tenant" || !tenantIds || tenantIds.includes(r.id));
  const [type, setType] = useState<RecipientType>("tenant");
  const list = listFor(type);
  const [toId, setToId] = useState(0);
  const to = list.find((r) => r.id === toId) ?? list[0];
  const [via, setVia] = useState<SendVia>(fromLandlord ? "email" : "both");
  const chs = s.viaChannels(via, to);
  const [kind, setKind] = useState<MessageType>("Payment follow-up");
  const [body, setBody] = useState("");
  const [auto, setAuto] = useState(""); // last template text filled in, to tell it apart from typing
  const [wasOpen, setWasOpen] = useState(false);

  /** The template for this message type and recipient, filled with their details. */
  function render(k: MessageType, t: RecipientType, who = listFor(t)[0]): string {
    const c = t === "tenant" && who ? s.contracts.find((x) => x.tenant_id === who.id && x.status === "active") : undefined;
    const inst = c ? s.installments.filter((i) => i.contract_id === c.id && s.balance(i) > 0).sort((x, y) => x.due_date.localeCompare(y.due_date))[0] : undefined;
    const tenant = t === "tenant" && who ? s.tenant(who.id) : undefined;
    const doc = tenant ? (daysUntil(tenant.emirates_id_expiry || "9999-12-31") <= daysUntil(tenant.passport_expiry || "9999-12-31") ? "renewed Emirates ID" : "renewed passport") : "documents";
    const myProps = t === "landlord" && who ? s.properties.filter((p) => p.landlord_id === who.id) : [];
    const ids = new Set(s.contracts.filter((x) => t !== "landlord" || myProps.some((p) => p.id === x.property_id)).map((x) => x.id));
    const overdue = s.installments.filter((i) => ids.has(i.contract_id) && s.isOverdue(i)).reduce((sum, i) => sum + s.balance(i), 0);
    const d = inst ? daysUntil(inst.due_date) : 0;
    const v: Record<string, string> = {
      name: who?.name ?? "[name]", property: c ? s.propLabel(c.property_id) : "your property", end: c ? fmtDate(c.end_date) : "[date]",
      no: inst ? String(inst.no) : "[no]", amount: inst ? `AED ${s.balance(inst).toLocaleString()}` : "AED [amount]", due: inst ? fmtDate(inst.due_date) : "[date]",
      late: d < 0 ? ` (${-d} days overdue)` : "", link: inst ? `${location.origin}/pay/${inst.id}` : "[payment link]",
      document: doc, count: `${myProps.length} properties`, overdue: `AED ${overdue.toLocaleString()}`,
      sender: fromLandlord ? s.landlord(fromLandlord)?.name ?? "Your landlord" : "Property Management",
    };
    return TEMPLATES[k][t].replace(/\{(\w+)\}/g, (_, key: string) => v[key] ?? "");
  }
  function fill(text: string) { setBody(text); setAuto(text); }
  /** Swaps in a new template, but never overwrites a message the user has written. */
  function load(k: MessageType, t: RecipientType, who?: (typeof list)[number]) {
    if (body.trim() && body !== auto) return;
    fill(render(k, t, who));
  }

  // Fill the template each time the window opens.
  if (open && !wasOpen) { setWasOpen(true); fill(render(kind, type, to)); }
  if (!open && wasOpen) setWasOpen(false);

  function send() {
    if (!to) return;
    for (const ch of chs) s.sendMessage({
      channel: ch, tenant_id: type === "tenant" ? to.id : null, landlord_id: fromLandlord ?? (type === "landlord" ? to.id : null),
      recipient_type: type, recipient_name: to.name, kind, body, status: ch === "whatsapp" ? "delivered" : "sent",
    });
    s.notify("Message sent", `${VIA_LABEL[via]} to ${to.name} (${RECIPIENT_LABEL[type]})`);
    onClose();
  }

  const edited = body.trim() !== "" && body !== auto;
  return (
    <Modal open={open} onClose={onClose} title={fromLandlord ? "Email / follow up with tenant" : "New message"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!body.trim() || !to || !chs.length} onClick={send}><Send className="h-4 w-4" />Send</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Send to">
          <NSelect value={type} onChange={(v) => { const t = v as RecipientType; setType(t); setToId(0); load(kind, t, listFor(t)[0]); }} options={types.map((t) => ({ value: t, label: RECIPIENT_LABEL[t] }))} />
        </Field>
        <Field label={RECIPIENT_LABEL[type]}>
          <NSelect value={to?.id ?? ""} onChange={(v) => { setToId(Number(v)); load(kind, type, list.find((r) => r.id === Number(v))); }}
            options={list.length ? list.map((r) => ({ value: r.id, label: r.name })) : [{ value: "", label: `No ${RECIPIENT_LABEL[type].toLowerCase()} users` }]} />
        </Field>
        {to && <p className="col-span-2 -mt-1 text-xs text-muted-foreground">{to.detail} · WhatsApp {to.phone || "—"} · Email {to.email || "—"}</p>}
        <Field label="Send via" className="col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <ViaPicker value={via} onChange={setVia} options={(["whatsapp", "email", "both"] as SendVia[]).map((v) => ({ value: v, label: VIA_LABEL[v] }))} /><ChannelTags chs={chs} />
          </div>
        </Field>
        <Field label="Type"><NSelect value={kind} onChange={(v) => { setKind(v as MessageType); load(v as MessageType, type, to); }} options={[...MESSAGE_TYPES]} /></Field>
        <div className="flex items-end justify-end">
          {edited && <Button type="button" size="sm" variant="ghost" onClick={() => fill(render(kind, type, to))}><RotateCcw className="h-3.5 w-3.5" />Reset to template</Button>}
        </div>
        <Field label={`Message · ${kind} template for ${RECIPIENT_LABEL[type].toLowerCase()}`} className="col-span-2">
          <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {body.includes("[") && <p className="col-span-2 -mt-1 text-xs text-[#9a3f22]">Replace the parts in [square brackets] before sending.</p>}
        {edited && <p className="col-span-2 -mt-1 text-xs text-muted-foreground">You've edited the message, so changing the type or recipient won't replace it. Use "Reset to template" to start again.</p>}
      </div>
    </Modal>
  );
}
