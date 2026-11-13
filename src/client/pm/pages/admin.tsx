import { useState } from "react";
import { Eye, Download, Plus, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NotifyButton } from "./notify";
import { L, useHref } from "../nav";
import { daysUntil, DOC_LABELS, fmtDate, RECIPIENT_LABEL, REMINDER_LABEL, type RecipientType, ROLE_LABEL, VIA_LABEL, type ReminderType, type SendVia, type Channel, type Doc, type DocCategory, type Role, type Settings, type Template, type User, agreementRef, UTIL_LABEL } from "../data";
import { PermissionsPanel } from "./access";
import { Segmented } from "./contracts";
import { useStore } from "../store";
import { Card, DocViewer, Field, Modal, NSelect, Page, Pill, SearchBox, Table, Td, ViaPicker } from "../ui";

// ── Document management (central) ────────────────────────────────────

export function DocumentsPage({ go }: { go: (to: string) => void }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [viewing, setViewing] = useState<Doc | null>(null);
  const owner = (d: Doc) => d.entity === "utility" ? (() => { const u = s.utilities.find((x) => x.id === d.entity_id); const c = u && s.contract(u.contract_id); return u && c ? `${UTIL_LABEL[u.type]} ${u.period} · ${s.propLabel(c.property_id)}` : "Utility bill"; })() : d.entity === "tenant" ? s.tenantName(d.entity_id) : d.entity === "landlord" ? s.landlord(d.entity_id)?.name : d.entity === "property" ? s.propLabel(d.entity_id) : (() => { const c = s.contract(d.entity_id); return c ? `Agreement ${agreementRef(c)}` : "Agreement"; })();
  const link = (d: Doc) => d.entity === "utility" ? "/utilities" : d.entity === "tenant" ? `/tenants/${d.entity_id}` : d.entity === "landlord" ? `/landlords/${d.entity_id}` : d.entity === "property" ? `/properties/${d.entity_id}` : "/contracts";
  const rows = s.docs.filter((d) => (cat === "all" || d.category === cat) && `${d.name} ${owner(d)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Documents" meta={`${s.docs.length} files · agreements, Emirates IDs, KYC, title deeds, photos`}>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} />
        <NSelect className="w-48" value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...Object.entries(DOC_LABELS).map(([value, label]) => ({ value, label }))]} />
      </div>
      <p className="text-xs text-muted-foreground">Upload documents from a property, tenant, landlord or contract profile.</p>
      <Table head={["Document", "Category", "Belongs to", "Uploaded", "Expiry", ""]} empty={!rows.length}>
        {rows.map((d) => (
          <tr key={d.id}>
            <Td className="font-medium">{d.name}</Td><Td><Pill tone="violet">{DOC_LABELS[d.category as DocCategory]}</Pill></Td>
            <Td><button className="hover:underline" onClick={() => go(link(d))}>{owner(d)}</button> <span className="text-xs capitalize text-muted-foreground">({d.entity})</span></Td>
            <Td>{fmtDate(d.uploaded_on)}</Td><Td>{d.expiry ? <div className="flex items-center gap-2"><span className={daysUntil(d.expiry) <= 60 ? "text-[#b4532f]" : ""}>{fmtDate(d.expiry)}</span>{d.entity === "tenant" && daysUntil(d.expiry) <= 90 && <NotifyButton event={{ kind: "document", tenantId: d.entity_id, document: DOC_LABELS[d.category as DocCategory], expiry: d.expiry }} />}</div> : "—"}</Td>
            <Td><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setViewing(d)} aria-label="View"><Eye className="h-4 w-4" /></Button><a href={d.url} download={d.name}><Button size="sm" variant="ghost" aria-label="Download"><Download className="h-4 w-4" /></Button></a></div></Td>
          </tr>))}
      </Table>
      <DocViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}

// ── WhatsApp & communications ────────────────────────────────────────

const CH_TONE = { whatsapp: "green", email: "blue", sms: "amber", in_app: "violet" } as const;

export function CommunicationsPage() {
  const s = useStore();
  const h = useHref();
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [ch, setCh] = useState("all");
  const rows = s.messages.filter((m) => ch === "all" || m.channel === ch);
  return (
    <Page title="WhatsApp & notifications" meta="Automated reminders and communication history"
      actions={s.can("communications", "edit") && <><Button variant="outline" onClick={() => setComposing(true)}><Plus className="h-4 w-4" />New message</Button><Button disabled={!s.dueReminders.length} onClick={() => setSending(true)}><Zap className="h-4 w-4" />Send due reminders ({s.dueReminders.length})</Button></>}>
      <Card title={`Due today by schedule (${s.dueReminders.length})`}>
        {s.dueReminders.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due.</p> :
          <ul className="divide-y divide-border text-sm">{s.dueReminders.map((r) => <li key={r.key} className="py-2"><div className="flex flex-wrap gap-2"><ChannelTags chs={s.reminderChannels(s.settings.reminder_via[r.type], r.tenant_id)} /><L to={h.contract(r.contract_id)} className="text-xs text-muted-foreground">Open agreement</L><Pill tone={r.kind.startsWith("Overdue") ? "red" : r.kind.startsWith("Renewal") ? "violet" : "amber"}>{r.kind}</Pill><span className="font-medium">{s.tenantName(r.tenant_id)}</span></div><p className="mt-1 text-muted-foreground">{r.body}</p></li>)}</ul>}
        <p className="mt-3 text-xs text-muted-foreground">The scheduler sends these every morning by WhatsApp, email or both, as set per reminder type in Settings.</p>
      </Card>
      <TemplatesCard />
      <div className="flex items-center gap-2"><h2 className="flex-1 text-sm font-semibold">Communication history</h2>
        <NSelect className="w-40" value={ch} onChange={setCh} options={[{ value: "all", label: "All channels" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "sms", label: "SMS" }]} /></div>
      <Table head={["When", "Channel", "To", "Type", "Message", "Status"]} empty={!rows.length}>
        {rows.map((m) => (
          <tr key={m.id}><Td className="whitespace-nowrap">{m.at.replace("T", " ")}</Td><Td><Pill tone={CH_TONE[m.channel]}>{m.channel}</Pill></Td>
            <Td><L to={m.recipient_type === "landlord" || (!m.tenant_id && m.landlord_id) ? h.landlord(m.landlord_id) : m.tenant_id ? h.tenant(m.tenant_id) : h.page("/users", "users")}>{m.recipient_name ?? s.tenantName(m.tenant_id)}</L><div className="text-xs text-muted-foreground">{RECIPIENT_LABEL[m.recipient_type ?? "tenant"]}{m.landlord_id && m.recipient_type !== "landlord" ? ` · from ${s.landlord(m.landlord_id)?.name}` : ""}</div></Td><Td>{m.kind}</Td>
            <Td className="max-w-md"><span className="line-clamp-2">{m.body}</span></Td>
            <Td><Pill tone={m.status === "failed" ? "red" : m.status === "delivered" ? "green" : "gray"}>{m.status}</Pill></Td></tr>))}
      </Table>
      <ComposeDialog open={composing} onClose={() => setComposing(false)} />
      {sending && <SendRemindersDialog onClose={() => setSending(false)} />}
    </Page>
  );
}

function TemplatesCard() {
  const s = useStore();
  const [editing, setEditing] = useState<Template | null>(null);
  const save = (t: Template) => s.setSettings({ ...s.settings, templates: s.settings.templates.map((x) => (x.id === t.id ? t : x)) });
  return (
    <Card title="WhatsApp templates">
      <ul className="divide-y divide-border/70 text-sm">
        {s.settings.templates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <code className="text-xs">{t.name}</code><Pill tone="gray">{t.trigger}</Pill>
            {t.approved ? <Pill tone="green">Approved</Pill> : <Pill tone="amber">Awaiting approval</Pill>}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.body}</span>
            {s.canApprove(10) && !t.approved && <Button size="sm" variant="outline" onClick={() => save({ ...t, approved: true })}>Approve</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
          </li>))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Only approved templates are sent. Editing a template sends it back for approval.</p>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Template: ${editing.name}`}
          footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => { save({ ...editing, approved: false }); setEditing(null); }}>Save</Button></>}>
          <Textarea rows={5} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          <p className="text-xs text-muted-foreground">Placeholders: {"{{tenant}} {{property}} {{amount}} {{no}} {{due_date}} {{days}} {{end_date}} {{link}} {{ref}}"}</p>
        </Modal>)}
    </Card>
  );
}

function ChannelTags({ chs }: { chs: Channel[] }) {
  if (!chs.length) return <Pill tone="red">No contact</Pill>;
  return <>{chs.map((c) => <Pill key={c} tone={c === "whatsapp" ? "green" : "blue"}>{c === "whatsapp" ? "WhatsApp" : "Email"}</Pill>)}</>;
}

function SendRemindersDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [via, setVia] = useState<SendVia | "default">("default");
  const [picked, setPicked] = useState<string[]>(() => s.dueReminders.map((r) => r.key));
  const chsFor = (r: (typeof s.dueReminders)[number]) => s.reminderChannels(via === "default" ? s.settings.reminder_via[r.type] : via, r.tenant_id);
  const total = s.dueReminders.filter((r) => picked.includes(r.key)).reduce((t, r) => t + chsFor(r).length, 0);
  return (
    <Modal wide open onClose={onClose} title="Send due reminders"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!total} onClick={() => { s.runAutomation(via === "default" ? undefined : via, picked); onClose(); }}><Send className="h-4 w-4" />Send {total} messages</Button></>}>
      <div className="space-y-1.5">
        <div className="text-xs font-medium">Send via</div>
        <ViaPicker value={via} onChange={setVia} options={[{ value: "default", label: "As set per reminder" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "both", label: "Both" }]} />
      </div>
      <ul className="max-h-80 divide-y divide-border/70 overflow-auto text-sm">
        {s.dueReminders.map((r) => (
          <li key={r.key} className="flex items-start gap-3 py-2.5">
            <input type="checkbox" className="mt-1" checked={picked.includes(r.key)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.key] : p.filter((k) => k !== r.key)))} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{s.tenantName(r.tenant_id)}</span><span className="text-muted-foreground">{r.kind}</span><span className="ml-auto flex gap-1"><ChannelTags chs={chsFor(r)} /></span></div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.body}</p>
            </div>
          </li>))}
      </ul>
      <p className="text-xs text-muted-foreground">A channel is skipped for a tenant with no phone number (WhatsApp) or email address.</p>
    </Modal>
  );
}

export { ComposeDialog } from "./compose";
import { ComposeDialog } from "./compose";

// ── Users, roles & access ────────────────────────────────────────────

export function UsersPage() {
  const s = useStore();
  const [tab, setTab] = useState<"roles" | "people">("roles");
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  return (
    <Page title="Users & access" meta="Roles, permissions and logins"
      actions={<>
        <Segmented value={tab} onChange={setTab} options={[{ value: "roles", label: "Roles & permissions" }, { value: "people", label: `Users (${s.users.length})` }]} />
        <Button onClick={() => setEditing({ role: "manager", active: true })}><Plus className="h-4 w-4" />Add user</Button>
      </>}>
      {tab === "roles" ? <PermissionsPanel /> : (
        <Table head={["Name", "Email", "Role", "Linked to", "Status"]}>
          {s.users.map((u) => (
            <tr key={u.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setEditing(u)}>
              <Td className="font-medium">{u.name}</Td><Td>{u.email}</Td><Td><Pill tone={u.role === "admin" ? "green" : u.role === "landlord" ? "violet" : u.role === "tenant" ? "gray" : "blue"}>{ROLE_LABEL[u.role]}</Pill></Td>
              <Td>{u.landlord_id ? s.landlord(u.landlord_id)?.name : u.tenant_id ? s.tenantName(u.tenant_id) : u.property_ids ? `${u.property_ids.length} assigned properties` : u.approval_limit ? `Approves up to AED ${u.approval_limit.toLocaleString()}` : "All records"}</Td><Td>{u.active ? <Pill tone="green">Active</Pill> : <Pill>Disabled</Pill>}</Td>
            </tr>))}
        </Table>)}
      <UserDialog value={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function UserDialog({ value, onClose }: { value: Partial<User> | null; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState<Partial<User>>({});
  const [last, setLast] = useState<unknown>(null);
  if (value !== last) { setLast(value); if (value) setF(value); }
  const set = (k: keyof User, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Edit user" : "Add user"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!f.name || !f.email} onClick={() => { s.saveUser(f as User); s.notify("User saved", value?.id ? "" : `Invitation emailed to ${f.email}`); onClose(); }}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Email (login)"><Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Role"><NSelect value={f.role ?? "manager"} onChange={(v) => set("role", v as Role)} options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
        {f.role === "finance" && <Field label="Approval limit (AED)"><Input type="number" value={f.approval_limit ?? 0} onChange={(e) => set("approval_limit", Number(e.target.value))} /></Field>}
        {f.role === "broker" && (
          <Field label="Assigned properties" className="col-span-2">
            <div className="grid max-h-40 grid-cols-1 gap-1 overflow-auto rounded-2xl border border-input p-2 text-sm sm:grid-cols-2">
              {s.properties.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={!!f.property_ids?.includes(p.id)} onChange={(e) => set("property_ids", e.target.checked ? [...(f.property_ids ?? []), p.id] : (f.property_ids ?? []).filter((x) => x !== p.id))} />{s.propLabel(p.id)}</label>)}
            </div>
          </Field>)}
        {f.role === "landlord" && <Field label="Landlord"><NSelect value={f.landlord_id ?? ""} onChange={(v) => set("landlord_id", Number(v))} options={[{ value: "", label: "Select…" }, ...s.landlords.map((l) => ({ value: l.id, label: l.name }))]} /></Field>}
        {f.role === "tenant" && <Field label="Tenant"><NSelect value={f.tenant_id ?? ""} onChange={(v) => set("tenant_id", Number(v))} options={[{ value: "", label: "Select…" }, ...s.tenants.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` }))]} /></Field>}
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={(e) => set("active", e.target.checked)} />Active</label>
      </div>
    </Modal>
  );
}

// ── Notification settings ────────────────────────────────────────────

export function SettingsPage() {
  const s = useStore();
  const st = s.settings;
  const set = (patch: Partial<Settings>) => s.setSettings({ ...st, ...patch });
  return (
    <Page title="Settings" meta="Notifications, reminders and rent calculation">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reminder channels">
          <ul className="space-y-3 text-sm">{(Object.keys(REMINDER_LABEL) as ReminderType[]).map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2"><span>{REMINDER_LABEL[k]}</span>
              <ViaPicker size="sm" value={st.reminder_via[k]} onChange={(v) => set({ reminder_via: { ...st.reminder_via, [k]: v } })} options={(["whatsapp", "email", "both"] as SendVia[]).map((v) => ({ value: v, label: VIA_LABEL[v] }))} /></li>))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Used by the daily scheduler. You can still pick a different option each time you send by hand.</p>
        </Card>
        <Card title="Notification channels">
          <ul className="space-y-2 text-sm">{(["whatsapp", "email", "sms", "in_app"] as Channel[]).map((c) => (
            <li key={c}><label className="flex items-center gap-2"><input type="checkbox" checked={st.channels[c]} onChange={(e) => set({ channels: { ...st.channels, [c]: e.target.checked } })} />{c === "in_app" ? "In-app pop-ups" : c === "sms" ? "SMS" : c[0].toUpperCase() + c.slice(1)}</label></li>))}</ul>
          <p className="mt-3 text-xs text-muted-foreground">WhatsApp uses the WhatsApp Business API; email and SMS go through the configured gateways.</p>
        </Card>
        <Card title="Reminder schedule">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Renewal reminders (months before expiry)"><Input value={st.renewal_months_before.join(", ")} onChange={(e) => set({ renewal_months_before: e.target.value.split(",").map((x) => parseInt(x)).filter((x) => x > 0) })} /></Field>
            <Field label="Repeat renewal reminder every (days)"><Input type="number" min={1} value={st.renewal_frequency_days} onChange={(e) => set({ renewal_frequency_days: Number(e.target.value) })} /></Field>
            <Field label="Upcoming rent reminder (days before)"><Input type="number" min={0} value={st.rent_days_before} onChange={(e) => set({ rent_days_before: Number(e.target.value) })} /></Field>
            <Field label="Overdue reminder every (days)"><Input type="number" min={1} value={st.overdue_every_days} onChange={(e) => set({ overdue_every_days: Number(e.target.value) })} /></Field>
          </div>
        </Card>
        <Card title="Rent calculation">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency"><Input value="AED (UAE dirham)" readOnly /></Field>
            <Field label="VAT on commercial rent (%)"><Input type="number" value={st.commercial_vat_pct} onChange={(e) => set({ commercial_vat_pct: Number(e.target.value) })} /></Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Instalment = annual rent ÷ payments per year (yearly 1, half-yearly 2, quarterly 4, monthly 12), plus VAT for commercial units.</p>
        </Card>
      </div>
    </Page>
  );
}
