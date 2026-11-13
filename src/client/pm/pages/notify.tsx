import { useState } from "react";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aed, daysUntil, fmtDate, RECIPIENT_LABEL, VIA_LABEL, type Channel, type Recipient, type RecipientType, type SendVia, agreementRef, UTIL_LABEL } from "../data";
import { useStore, type Store } from "../store";
import { Field, Modal, NSelect, Pill, ViaPicker } from "../ui";
import { payLink } from "./finance";

/** What the alert is about. */
export type NotifyEvent =
  | { kind: "expiry"; contractId: number }
  | { kind: "payment"; installmentId: number }
  | { kind: "document"; tenantId: number; document: string; expiry: string }
  | { kind: "utility"; billId: number };

type Ctx = {
  name: string; property: string; tenant: string; landlord: string; date: string; days: number;
  amount: string; no: string; link: string; document: string; ejari: string; account: string;
};

// ── Templates: one per alert type and recipient type ──────────────────
const T: Record<NotifyEvent["kind"], Record<RecipientType, { subject: string; body: string }>> = {
  expiry: {
    tenant: { subject: "Your tenancy at {property} ends on {date}", body: "Dear {name},\n\nYour tenancy agreement {ejari} for {property} expires on {date} ({days} days from today).\n\nPlease let us know whether you would like to renew so we can prepare the new agreement and Ejari in good time.\n\nKind regards,\nProperty Management" },
    landlord: { subject: "Tenancy expiring: {property}", body: "Dear {name},\n\nThe tenancy of {tenant} at your property {property} expires on {date} ({days} days).\n\nPlease confirm whether you agree to a renewal and any change to the annual rent, or whether you would like the unit to be re-marketed.\n\nKind regards,\nProperty Management" },
    broker: { subject: "Upcoming vacancy: {property}", body: "Hi {name},\n\nThe agreement for {property} (tenant {tenant}) expires on {date}. Renewal is not yet confirmed.\n\nPlease be ready to market the unit and arrange viewings if the tenant does not renew.\n\nThanks" },
    manager: { subject: "Action: renewal for {property}", body: "Hi {name},\n\nAgreement {ejari} for {property} ({tenant}) expires on {date} — {days} days left.\n\nPlease contact the tenant and landlord about renewal, and update Ejari once terms are agreed.\n\nThanks" },
    finance: { subject: "Expiring agreement: {property}", body: "Hi {name},\n\nAgreement {ejari} for {property} ({tenant}) expires on {date}. Please review outstanding balances and the security deposit ahead of renewal or closure.\n\nThanks" },
  },
  payment: {
    tenant: { subject: "Rent instalment {no} for {property}", body: "Dear {name},\n\nThis is a reminder that rent instalment #{no} of {amount} for {property} is due on {date}{late}.\n\nYou can pay securely here: {link}\n\nIf you have already paid, please ignore this message.\n\nKind regards,\nProperty Management" },
    landlord: { subject: "Rent status: {property}", body: "Dear {name},\n\nInstalment #{no} of {amount} from {tenant} for {property} is due on {date}{late}. We are following up with the tenant and will update you once it is received.\n\nKind regards,\nProperty Management" },
    broker: { subject: "Rent follow-up: {property}", body: "Hi {name},\n\nInstalment #{no} of {amount} from {tenant} for {property} is due on {date}{late}. As the broker on this unit, please help us follow up with the tenant.\n\nThanks" },
    manager: { subject: "Collect: {property} instalment {no}", body: "Hi {name},\n\nInstalment #{no} of {amount} from {tenant} for {property} is due on {date}{late}.\n\nPlease follow up with the tenant and record the receipt once received.\n\nThanks" },
    finance: { subject: "Payment due: {property} instalment {no}", body: "Hi {name},\n\nInstalment #{no} of {amount} from {tenant} for {property} is due on {date}{late}. Please watch for the receipt and confirm clearance.\n\nThanks" },
  },
  utility: {
    tenant: { subject: "Unpaid {document} bill for {property}", body: "Dear {name},\n\nOur records show the {document} bill of {amount} for {property} (account {account}, {date}) is still unpaid.\n\nPlease settle it with the provider and send us the receipt, so the supply is not interrupted and nothing is deducted from your deposit.\n\nKind regards,\nProperty Management" },
    landlord: { subject: "Unpaid utility bill: {property}", body: "Dear {name},\n\nThe {document} bill of {amount} for {property} ({date}) is unpaid by the tenant {tenant}. We are following up and will update you.\n\nKind regards,\nProperty Management" },
    broker: { subject: "Unpaid utility bill: {property}", body: "Hi {name},\n\nThe {document} bill of {amount} for {property} ({date}) is unpaid by {tenant}. Please help us follow up.\n\nThanks" },
    manager: { subject: "Follow up: {document} bill for {property}", body: "Hi {name},\n\nThe {document} bill of {amount} for {property} (account {account}, {date}) is unpaid by {tenant}. Please follow up and mark it paid once the receipt is received.\n\nThanks" },
    finance: { subject: "Unpaid utility bill: {property}", body: "Hi {name},\n\nThe {document} bill of {amount} for {property} ({date}) is unpaid by {tenant}. If it is not settled before move-out, include it in the final dues.\n\nThanks" },
  },
  document: {
    tenant: { subject: "Please renew your {document}", body: "Dear {name},\n\nOur records show your {document} expires on {date}{late}.\n\nPlease send us a copy of the renewed {document} so we can keep your tenancy file up to date.\n\nKind regards,\nProperty Management" },
    landlord: { subject: "Tenant document expiring: {tenant}", body: "Dear {name},\n\nThe {document} of your tenant {tenant} ({property}) expires on {date}{late}. We have asked the tenant for a renewed copy.\n\nKind regards,\nProperty Management" },
    broker: { subject: "Tenant document expiring: {tenant}", body: "Hi {name},\n\nThe {document} of {tenant} ({property}) expires on {date}{late}. Please help us collect the renewed copy.\n\nThanks" },
    manager: { subject: "KYC: {tenant} — {document} expiring", body: "Hi {name},\n\nThe {document} of {tenant} ({property}) expires on {date}{late}. Please request the renewed document and update the KYC review.\n\nThanks" },
    finance: { subject: "KYC: {tenant} — {document} expiring", body: "Hi {name},\n\nThe {document} of {tenant} ({property}) expires on {date}{late}. FYI for the tenancy file.\n\nThanks" },
  },
};

const fill = (text: string, c: Ctx) =>
  text.replace(/\{(\w+)\}/g, (_, k) => (k === "late" ? (c.days < 0 ? ` (${-c.days} days ago)` : "") : String((c as Record<string, unknown>)[k] ?? "")));

/** Who is concerned by this alert, by recipient type. */
function partiesFor(s: Store, ev: NotifyEvent) {
  const contract = ev.kind === "utility" ? s.contract(s.utilities.find((u) => u.id === ev.billId)?.contract_id ?? 0)
    : ev.kind === "expiry" ? s.contract(ev.contractId)
    : ev.kind === "payment" ? s.contract(s.installments.find((i) => i.id === ev.installmentId)?.contract_id ?? 0)
    : s.contracts.find((c) => c.tenant_id === ev.tenantId && c.status === "active");
  const tenantId = ev.kind === "document" ? ev.tenantId : contract?.tenant_id;
  const property = contract ? s.property(contract.property_id) : undefined;
  const brokerIds = new Set(s.users.filter((u) => u.role === "broker" && (u.id === property?.broker_user_id || (property && u.property_ids?.includes(property.id)))).map((u) => u.id));
  const out: Partial<Record<RecipientType, Recipient[]>> = {
    tenant: s.recipients("tenant").filter((r) => r.id === tenantId),
    landlord: s.recipients("landlord").filter((r) => r.id === property?.landlord_id),
    broker: s.recipients("broker").filter((r) => brokerIds.has(r.id)),
    manager: s.recipients("manager"),
    finance: ev.kind === "payment" || ev.kind === "utility" ? s.recipients("finance") : [],
  };
  return { contract, property, tenantId, parties: out };
}

function contextFor(s: Store, ev: NotifyEvent, who: Recipient | undefined): Ctx {
  const { contract, property, tenantId } = partiesFor(s, ev);
  const inst = ev.kind === "payment" ? s.installments.find((i) => i.id === ev.installmentId) : undefined;
  const bill = ev.kind === "utility" ? s.utilities.find((u) => u.id === ev.billId) : undefined;
  const date = ev.kind === "expiry" ? contract?.end_date ?? "" : ev.kind === "payment" ? inst?.due_date ?? "" : ev.kind === "utility" ? `${bill?.period}-01` : ev.expiry;
  return {
    name: who?.name ?? "", property: property ? s.propLabel(property.id) : "your property", tenant: s.tenantName(tenantId),
    landlord: s.landlord(property?.landlord_id)?.name ?? "", date: bill ? new Date(date + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) + " bill" : fmtDate(date), days: bill ? 0 : daysUntil(date),
    amount: inst ? aed(s.balance(inst)) : bill ? aed(bill.amount) : "", no: inst ? String(inst.no) : "", link: inst ? payLink(inst) : "",
    document: ev.kind === "document" ? ev.document : bill ? `${bill.provider} ${UTIL_LABEL[bill.type].toLowerCase()}` : "", account: contract?.dewa_account || "—", ejari: (contract ? agreementRef(contract) : "") ?? "",
  };
}

export function NotifyDialog({ event, onClose }: { event: NotifyEvent; onClose: () => void }) {
  const s = useStore();
  const { parties } = partiesFor(s, event);
  const types = (Object.keys(RECIPIENT_LABEL) as RecipientType[]).filter((t) => parties[t]?.length);
  const [type, setType] = useState<RecipientType>(types[0] ?? "tenant");
  const list = parties[type] ?? [];
  const [toId, setToId] = useState(0);
  const to = list.find((r) => r.id === toId) ?? list[0];
  const [via, setVia] = useState<SendVia>("both");
  const tpl = T[event.kind][type];
  const ctx = contextFor(s, event, to);
  const [subject, setSubject] = useState(() => fill(tpl.subject, ctx));
  const [body, setBody] = useState(() => fill(tpl.body, ctx));
  const chs: Channel[] = s.viaChannels(via, to);

  // Changing the recipient loads that recipient's template.
  function pick(nextType: RecipientType, nextId?: number) {
    const nextList = parties[nextType] ?? [];
    const who = nextList.find((r) => r.id === nextId) ?? nextList[0];
    setType(nextType); setToId(who?.id ?? 0);
    const c = contextFor(s, event, who);
    setSubject(fill(T[event.kind][nextType].subject, c)); setBody(fill(T[event.kind][nextType].body, c));
  }

  const title = event.kind === "utility" ? "Unpaid utility bill" : event.kind === "expiry" ? "Agreement expiring" : event.kind === "payment" ? "Payment due" : `${event.kind === "document" ? event.document : "Document"} expiring`;
  const kindLabel = event.kind === "utility" ? "Utility bill reminder" : event.kind === "expiry" ? "Expiry notice" : event.kind === "payment" ? "Payment reminder" : "Document expiry";

  function send() {
    if (!to) return;
    for (const ch of chs) s.sendMessage({
      channel: ch, tenant_id: type === "tenant" ? to.id : null, landlord_id: type === "landlord" ? to.id : null,
      recipient_type: type, recipient_name: to.name, kind: kindLabel,
      body: ch === "email" ? `Subject: ${subject}\n\n${body}` : body, status: ch === "whatsapp" ? "delivered" : "sent",
    });
    s.notify("Message sent", `${VIA_LABEL[via]} to ${to.name} (${RECIPIENT_LABEL[type]})`);
    onClose();
  }

  return (
    <Modal wide open onClose={onClose} title={`Notify · ${title}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!to || !chs.length || !body.trim()} onClick={send}><Send className="h-4 w-4" />Send</Button></>}>
      <p className="text-sm text-muted-foreground">{ctx.property}{ctx.tenant !== "—" && ` · ${ctx.tenant}`} · {ctx.date}{event.kind === "utility" ? ` · ${ctx.amount}` : ctx.days < 0 ? ` (${-ctx.days} days ago)` : ` (in ${ctx.days} days)`}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Send to">
          <NSelect value={type} onChange={(v) => pick(v as RecipientType)} options={types.map((t) => ({ value: t, label: `${RECIPIENT_LABEL[t]} (${parties[t]!.length})` }))} />
        </Field>
        <Field label={RECIPIENT_LABEL[type]}>
          <NSelect value={to?.id ?? ""} onChange={(v) => pick(type, Number(v))} options={list.map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        {to && <p className="text-xs text-muted-foreground sm:col-span-2">WhatsApp {to.phone || "—"} · Email {to.email || "—"}</p>}
        <Field label="Send via" className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <ViaPicker value={via} onChange={setVia} options={(["whatsapp", "email", "both"] as SendVia[]).map((v) => ({ value: v, label: VIA_LABEL[v] }))} />
            {chs.length ? chs.map((c) => <Pill key={c} tone={c === "whatsapp" ? "green" : "blue"}>{c === "whatsapp" ? "WhatsApp" : "Email"}</Pill>) : <Pill tone="red">No contact for this channel</Pill>}
          </div>
        </Field>
        {chs.includes("email") && <Field label="Email subject" className="sm:col-span-2"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label={`Message · ${RECIPIENT_LABEL[type]} template`} className="sm:col-span-2"><Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">The template changes with the recipient type. You can edit the text before sending.</p>
    </Modal>
  );
}

/** Small button that opens the notify dialog for one alert. */
export function NotifyButton({ event, label = "Notify", size = "sm" }: { event: NotifyEvent; label?: string; size?: "sm" | "icon" }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  if (!s.can("communications", "edit")) return null;
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={label}>
        <BellRing className="h-3.5 w-3.5" />{size === "sm" && label}
      </Button>
      {open && <span onClick={(e) => e.stopPropagation()}><NotifyDialog event={event} onClose={() => setOpen(false)} /></span>}
    </>
  );
}
