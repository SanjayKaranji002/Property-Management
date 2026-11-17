import { useState } from "react";
import { Mail, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECIPIENT_LABEL, VIA_LABEL, type Recipient, type RecipientType, type SendVia } from "../data";
import { useStore } from "../store";
import { Card, Pill } from "../ui";

type Choice = SendVia | "default";
const CHOICES: Choice[] = ["default", "whatsapp", "email", "both"];
const TYPES: RecipientType[] = ["tenant", "landlord", "manager", "broker", "finance"];
const PLURAL: Record<RecipientType, string> = { tenant: "Tenants", landlord: "Landlords", manager: "Property Managers", broker: "Brokers", finance: "Finance" };

/**
 * Who gets reminders and messages how: one choice per person, which
 * overrides the default for the reminder type. Used by automatic reminders,
 * Notify and New message.
 */
export function ContactPreferences() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RecipientType | "all">("tenant");
  const canEdit = s.can("communications", "edit");
  const prefs = s.settings.contact_via;

  const everyone: (Recipient & { type: RecipientType })[] = TYPES.flatMap((t) => s.recipients(t).map((r) => ({ ...r, type: t })));
  const query = q.trim().toLowerCase();
  const matches = (r: Recipient) => !query || `${r.name} ${r.email} ${r.phone} ${r.detail}`.toLowerCase().includes(query);
  const rows = everyone.filter((r) => (role === "all" || r.type === role) && matches(r));
  const count = (t: RecipientType | "all") => everyone.filter((r) => (t === "all" || r.type === t) && matches(r)).length;

  const choiceOf = (r: { type: RecipientType; id: number }): Choice => prefs[`${r.type}-${r.id}`] ?? "default";
  function setChoice(list: { type: RecipientType; id: number }[], c: Choice) {
    const next = { ...prefs };
    for (const r of list) { if (c === "default") delete next[`${r.type}-${r.id}`]; else next[`${r.type}-${r.id}`] = c; }
    s.setSettings({ ...s.settings, contact_via: next });
  }
  const customised = rows.filter((r) => choiceOf(r) !== "default").length;

  return (
    <Card title="Reminder preferences" actions={<span className="text-xs text-muted-foreground">{Object.keys(prefs).length} people with their own choice</span>}>
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">Choose how each person receives reminders and messages. <b>Default</b> follows Settings → Reminder channels.</p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email"
          className="h-11 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist">
        {(["all", ...TYPES] as const).map((t) => (
          <button key={t} role="tab" aria-selected={role === t} onClick={() => setRole(t)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm transition-colors", role === t ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground")}>
            {t === "all" ? "Everyone" : PLURAL[t]} <span className="ml-1 tabular-nums opacity-70">{count(t)}</span>
          </button>))}
      </div>

      {canEdit && rows.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Set all {rows.length} shown to:</span>
          {CHOICES.map((c) => <button key={c} onClick={() => setChoice(rows, c)} className="rounded-full border border-border bg-card px-2.5 py-1 hover:text-foreground">{c === "default" ? "Default" : VIA_LABEL[c]}</button>)}
          {customised > 0 && <span className="ml-auto">{customised} of these have their own choice</span>}
        </div>)}

      <ul className="mt-3 max-h-[28rem] divide-y divide-border/70 overflow-auto rounded-2xl border border-border/70">
        {rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">No one matches "{q}".</li>}
        {rows.map((r) => {
          const c = choiceOf(r);
          const rv = s.settings.reminder_via;
          const fallback = rv.upcoming;
          const sameDefault = rv.upcoming === rv.overdue && rv.overdue === rv.renewal;
          const effective = c === "default" ? fallback : c;
          const missing = (effective !== "email" && !r.phone) || (effective !== "whatsapp" && !r.email);
          return (
            <li key={`${r.type}-${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.name}</span>{role === "all" && <Pill tone="gray">{RECIPIENT_LABEL[r.type]}</Pill>}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{r.phone || "no number"}</span>
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.email || "no email"}</span>
                  <span>{r.detail}</span>
                </div>
                {missing && <div className="mt-0.5 text-xs text-[#9a3f22]">{!r.phone && effective !== "email" ? "No WhatsApp number — WhatsApp messages will be skipped." : "No email address — emails will be skipped."}</div>}
              </div>
              <div role="radiogroup" aria-label={`How ${r.name} gets reminders`} className="inline-flex flex-wrap gap-1 rounded-full border border-border/70 bg-card p-1">
                {CHOICES.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={c === o} disabled={!canEdit} onClick={() => setChoice([r], o)}
                    title={o === "default" ? `Default (${VIA_LABEL[fallback]})` : undefined}
                    className={cn("rounded-full px-3 py-1 text-xs transition-colors disabled:cursor-default", c === o ? (o === "default" ? "bg-muted font-medium text-foreground" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground")}>
                    {o === "default" ? (sameDefault ? `Default · ${VIA_LABEL[fallback]}` : "Default") : VIA_LABEL[o]}
                  </button>))}
              </div>
            </li>);
        })}
      </ul>
      {!canEdit && <p className="mt-2 text-xs text-muted-foreground">You can view preferences; changing them needs edit access to WhatsApp.</p>}
    </Card>
  );
}
