import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dueRemindersFor } from "./reminders";
import {
  buildInstallments, buildReceipts, calcInstallments, daysUntil, defaultSettings, today,
  seedContracts, seedDocs, seedLandlords, seedMessages, seedProperties, seedTenants, seedUsers, seedUtilities,
  type Channel, type Contract, type Recipient, type RecipientType, type ReminderType, type SendVia, type Doc, type Installment, type Landlord, type Message, type Module,
  type Property, type Role, type Receipt, type ReceiptStatus, type Closure, type Settings, type Tenant, type User, type UtilityBill, agreementRef, canSeeProperty, isRestricted } from "./data";

export interface Toast { id: number; title: string; body: string }

/** Who a notification is for. Anyone matching any field sees it. */
export interface Audience { users?: number[]; roles?: Role[]; tenants?: number[]; landlords?: number[];
  /** Limits role-based delivery to staff who can see this property. */
  property?: number }
interface InboxItem extends Toast { at: string; readBy: number[]; to: Audience }

const isFor = (to: Audience, u: User) =>
  !!(to.users?.includes(u.id) || (to.roles?.includes(u.role) && (to.property == null || canSeeProperty(u, to.property)))
    || (u.tenant_id && to.tenants?.includes(u.tenant_id)) || (u.landlord_id && to.landlords?.includes(u.landlord_id)));

function useStoreValue() {
  const [landlords, setLandlords] = useState<Landlord[]>(seedLandlords);
  const [properties, setProperties] = useState<Property[]>(seedProperties);
  const [tenants, setTenants] = useState<Tenant[]>(seedTenants);
  const [contracts, setContracts] = useState<Contract[]>(seedContracts);
  const [installments, setInstallments] = useState<Installment[]>(() => buildInstallments(seedContracts, defaultSettings.commercial_vat_pct));
  const [receipts, setReceipts] = useState<Receipt[]>(() => buildReceipts(buildInstallments(seedContracts, defaultSettings.commercial_vat_pct)));
  const [utilities, setUtilities] = useState<UtilityBill[]>(seedUtilities);
  const [docs, setDocs] = useState<Doc[]>(seedDocs);
  const [messages, setMessages] = useState<Message[]>(seedMessages);
  const [users, setUsers] = useState<User[]>(seedUsers);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [currentUserId, setCurrentUserId] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Every notification says who it is for; the bell only shows the signed-in person's own.
  const [inbox, setInbox] = useState<InboxItem[]>([
    { id: 1, title: "Emirates ID expiring", body: "Maria Santos' Emirates ID expires in 25 days.", at: today(), readBy: [], to: { roles: ["admin", "manager"] } },
    { id: 2, title: "Overdue rent", body: "2 instalments are overdue.", at: today(), readBy: [], to: { roles: ["admin", "manager", "finance"] } },
  ]);
  const meRef = useRef(currentUserId);
  meRef.current = currentUserId;

  const me = users.find((u) => u.id === currentUserId) ?? users[0];

  const nextId = <T extends { id: number }>(rows: T[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  /** Adds a notification to the bell of the people in `to` (no pop-up for the person acting). */
  const alert = useCallback((title: string, body: string, to: Audience) => {
    setInbox((i) => [{ id: Date.now() + Math.random(), title, body, at: today(), readBy: [], to }, ...i]);
  }, []);
  /**
   * Pop-up for the person acting. It is also kept in their own bell, plus the
   * bell of anyone in `alsoTo` — never everyone's.
   */
  const notify = useCallback((title: string, body: string, alsoTo?: Audience) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body }]);
    const to: Audience = { ...alsoTo, users: [...(alsoTo?.users ?? []), meRef.current] };
    setInbox((i) => [{ id, title, body, at: today(), readBy: [meRef.current], to }, ...i]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  // Generic upsert helper.
  // Ids are handed out synchronously, so a caller can use the new record's id
  // straight away (e.g. to attach uploads), even for several saves in one tick.
  const idSeq = useRef<Record<string, number>>({});
  function upsert<T extends { id: number }>(table: string, rows: T[], set: React.Dispatch<React.SetStateAction<T[]>>) {
    return (row: Omit<T, "id"> & { id?: number }): T => {
      if (row.id) { const saved = row as T; set((rs) => rs.map((r) => (r.id === saved.id ? saved : r))); return saved; }
      const id = Math.max(nextId(rows), idSeq.current[table] ?? 0);
      idSeq.current[table] = id + 1;
      const saved = { ...row, id } as T;
      set((rs) => [...rs, saved]);
      return saved;
    };
  }

  /** Returns an error message when another active lease already covers the unit for those dates. */
  const overlapFor = (row: Pick<Contract, "property_id" | "start_date" | "end_date" | "role"> & { id?: number }) => {
    if (row.role === "sub_tenant") return null;
    const clash = contracts.find((c) => c.id !== row.id && c.property_id === row.property_id && c.status === "active" && c.role !== "sub_tenant" && c.start_date <= row.end_date && row.start_date <= c.end_date);
    return clash ? `Overlaps active agreement ${agreementRef(clash)} (${clash.start_date} → ${clash.end_date}).` : null;
  };

  const saveContract = (row: Omit<Contract, "id"> & { id?: number }) => {
    const id = row.id ?? nextId(contracts);
    const c = { ...row, id } as Contract;
    setContracts((rows) => (row.id ? rows.map((r) => (r.id === id ? c : r)) : [...rows, c]));
    // Regenerate unpaid instalments from the formula; keep paid ones.
    setInstallments((rows) => {
      const kept = rows.filter((i) => i.contract_id !== id || i.paid > 0);
      const paidNos = new Set(kept.filter((i) => i.contract_id === id).map((i) => i.no));
      let n = nextId(rows);
      const fresh = calcInstallments(c, settings.commercial_vat_pct)
        .map((i) => ({ ...i, no: i.no === 0 ? 0 : i.no }))
        .filter((i) => !paidNos.has(i.no))
        .map((i) => ({ id: n++, contract_id: id, no: i.no, due_date: i.due_date, amount: i.amount, paid: 0, paid_on: null, method: null }));
      return [...kept, ...fresh];
    });
    // Contract drives property status.
    if (c.status === "active" && c.approval === "approved" && c.role !== "sub_tenant") setProperties((ps) => ps.map((p) => (p.id === c.property_id ? { ...p, status: "rented" } : p)));
    return c;
  };

  // Rent counts as paid only once a receipt is cleared (cheques start as "received").
  const syncPaid = (all: Receipt[], instId: number) => {
    const cleared = all.filter((r) => r.installment_id === instId && r.status === "cleared");
    const paid = cleared.reduce((t, r) => t + r.amount, 0);
    const last = cleared.sort((a, b) => b.date.localeCompare(a.date))[0];
    setInstallments((rows) => rows.map((i) => (i.id === instId ? { ...i, paid: Math.min(i.amount, paid), paid_on: last?.date ?? null, method: last?.method ?? null } : i)));
  };
  const addReceipt = (r: Omit<Receipt, "id" | "status" | "replaces_id"> & { replaces_id?: number | null }) => {
    const rec: Receipt = { ...r, id: nextId(receipts), status: r.method === "Cheque" ? "received" : "cleared", replaces_id: r.replaces_id ?? null };
    let all = [...receipts, rec];
    if (rec.replaces_id) all = all.map((x) => (x.id === rec.replaces_id ? { ...x, status: "replaced" as const } : x));
    setReceipts(all); syncPaid(all, rec.installment_id);
    notify(rec.status === "cleared" ? "Payment recorded" : "Cheque received", `${rec.method} ${rec.reference}: AED ${rec.amount.toLocaleString()}${rec.status === "received" ? " — awaiting clearance" : ""}`);
  };
  const setReceiptStatus = (id: number, status: ReceiptStatus, note?: string) => {
    const all = receipts.map((x) => (x.id === id ? { ...x, status, note: note ?? x.note } : x));
    setReceipts(all);
    const r = all.find((x) => x.id === id)!; syncPaid(all, r.installment_id);
    if (status === "bounced") {
      const inst = installments.find((i) => i.id === r.installment_id); const c = inst && contracts.find((x) => x.id === inst.contract_id);
      if (c) sendMessage({ channel: "whatsapp", tenant_id: c.tenant_id, landlord_id: null, kind: "Bounced cheque", body: `Cheque ${r.reference} for AED ${r.amount.toLocaleString()} was returned. Please arrange a replacement.`, status: "delivered" });
      notify("Cheque bounced", `${r.reference} — tenant notified, instalment reopened`);
      if (c) alert("Cheque returned", `Your cheque ${r.reference} for AED ${r.amount.toLocaleString()} was returned by the bank. Please arrange a replacement.`, { tenants: [c.tenant_id] });
    } else notify(`Receipt ${status}`, r.reference);
  };
  const recordPayment = (installmentId: number, amount: number, method: string) =>
    addReceipt({ installment_id: installmentId, amount, method: method as Receipt["method"], date: today(), reference: "—", bank: "" });

  const closeContract = (id: number, closure: Closure) => {
    const c = contracts.find((x) => x.id === id); if (!c) return;
    setContracts((rs) => rs.map((r) => (r.id === id ? { ...r, status: "closed", closure, dewa_status: "closed" } : r)));
    setProperties((ps) => ps.map((p) => (p.id === c.property_id ? { ...p, status: "vacant" } : p)));
    notify("Tenancy closed", `${agreementRef(c)}: property marked vacant`);
    const owner = properties.find((p) => p.id === c.property_id)?.landlord_id;
    if (owner) alert("Tenancy closed", `${lookups.propLabel(c.property_id)} is now vacant (move-out ${closure.move_out_date}).`, { landlords: [owner] });
  };
  const patchContract = (id: number, patch: Partial<Contract>) => {
    setContracts((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const c = contracts.find((x) => x.id === id);
    if (patch.approval === "approved" && c && c.status === "active" && c.role !== "sub_tenant") setProperties((ps) => ps.map((p) => (p.id === c.property_id ? { ...p, status: "rented" } : p)));
  };

  const sendMessage = (m: Omit<Message, "id" | "at" | "status"> & { status?: Message["status"] }) => {
    setMessages((rows) => [{ ...m, id: nextId(rows), at: new Date().toISOString().slice(0, 16), status: m.status ?? "sent" }, ...rows]);
  };

  // ── Derived helpers ───────────────────────────────────────────────
  const lookups = useMemo(() => {
    const property = (id: number) => properties.find((p) => p.id === id);
    const tenant = (id: number | null | undefined) => tenants.find((t) => t.id === id);
    const landlord = (id: number | null | undefined) => landlords.find((l) => l.id === id);
    const contract = (id: number) => contracts.find((c) => c.id === id);
    const propLabel = (id: number) => { const p = property(id); return p ? `${p.name} · ${p.unit_no}` : "—"; };
    const tenantName = (id: number | null | undefined) => { const t = tenant(id); return t ? `${t.first_name} ${t.last_name}` : "—"; };
    const activeContractFor = (propertyId: number) => contracts.find((c) => c.property_id === propertyId && c.status === "active" && c.role !== "sub_tenant");
    const balance = (i: Installment) => i.amount - i.paid;
    const isOverdue = (i: Installment) => balance(i) > 0 && i.due_date < today();
    return { property, tenant, landlord, contract, propLabel, tenantName, activeContractFor, balance, isOverdue };
  }, [properties, tenants, landlords, contracts]);

  // ── Automation: what the scheduler would send today ─────────────────
  // Reminder keys already sent (see reminders.ts): each is sent once, ever.
  const [sentKeys, setSentKeys] = useState<Record<string, string>>({});
  const [lastAutoRun, setLastAutoRun] = useState<{ at: string; sent: number } | null>(null);
  const dueReminders = useMemo(() => dueRemindersFor({
    installments, contracts, settings, balance: lookups.balance, propLabel: lookups.propLabel, tenantName: lookups.tenantName,
    awaitingClearance: (id) => receipts.some((r) => r.installment_id === id && r.status === "received"),
    payInstructions: settings.payment_instructions,
  }).filter((r) => !sentKeys[r.key]), [installments, contracts, settings, lookups, receipts, sentKeys]);

  /** Everyone a message can be addressed to, by type. */
  const recipients = (type: RecipientType): Recipient[] => {
    if (type === "tenant") return tenants.map((t) => {
      const c = contracts.find((x) => x.tenant_id === t.id && x.status === "active");
      return { id: t.id, name: `${t.first_name} ${t.last_name}`, phone: t.phone, email: t.email, detail: c ? lookups.propLabel(c.property_id) : "No active tenancy" };
    });
    if (type === "landlord") return landlords.map((l) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email, detail: `${properties.filter((p) => p.landlord_id === l.id).length} properties` }));
    return users.filter((u) => u.role === type && u.active).map((u) => ({ id: u.id, name: u.name, phone: u.phone ?? "", email: u.email,
      detail: type === "broker" ? `${u.property_ids?.length ?? 0} assigned properties` : u.email }));
  };
  const viaChannels = (via: SendVia, r?: Pick<Recipient, "phone" | "email">): Channel[] =>
    (via === "both" ? ["whatsapp", "email"] as Channel[] : [via as Channel]).filter((ch) => (ch === "whatsapp" ? !!r?.phone : !!r?.email));

  /** A person's chosen channel, or the fallback when they have none. */
  const viaFor = (type: RecipientType, id: number | undefined, fallback: SendVia): SendVia => (id ? settings.contact_via[`${type}-${id}`] : undefined) ?? fallback;

  /** Channels a reminder actually goes out on: the chosen ones the tenant can be reached on. */
  const reminderChannels = (via: SendVia, tenantId: number): Channel[] => {
    const t = tenants.find((x) => x.id === tenantId);
    const want: Channel[] = via === "both" ? ["whatsapp", "email"] : [via];
    return want.filter((ch) => (ch === "whatsapp" ? !!t?.phone : !!t?.email));
  };
  /** Sends the given (default: all) due reminders. `override` replaces each type's configured channel. */
  const runAutomation = (override?: SendVia, keys?: string[], auto = false) => {
    let n = 0, skipped = 0;
    const sent: Record<string, string> = {};
    for (const r of dueReminders) {
      if (keys && !keys.includes(r.key)) continue;
      const via = override ?? settings.contact_via[`tenant-${r.tenant_id}`] ?? settings.reminder_via[r.type];
      const chs = reminderChannels(via, r.tenant_id);
      if (chs.length < (via === "both" ? 2 : 1)) skipped++;
      for (const ch of chs) { sendMessage({ channel: ch, tenant_id: r.tenant_id, landlord_id: null, kind: r.kind, body: r.body, status: ch === "whatsapp" ? "delivered" : "sent", auto, reminder_key: r.key }); n++; }
      if (chs.length) alert(r.kind, r.body, { tenants: [r.tenant_id] });
      if (chs.length) sent[r.key] = new Date().toISOString();
    }
    setSentKeys((k) => ({ ...k, ...sent }));
    if (auto) setLastAutoRun({ at: new Date().toISOString(), sent: n });
    const summary = `${n} message${n === 1 ? "" : "s"} sent${skipped ? ` · ${skipped} tenants missing a phone or email` : ""}.`;
    if (auto) { if (n) alert("Automatic reminders sent", summary, { roles: ["admin", "manager"] }); }
    else notify("Reminders sent", summary);
  };

  // The daily run. In this prototype it runs while the app is open, as soon as
  // something becomes due; on the backend the same rules run once a day at settings.auto_time.
  const dueKeys = dueReminders.map((r) => r.key).join("|");
  useEffect(() => {
    if (!settings.auto_reminders || !dueKeys) return;
    const t = setTimeout(() => runAutomation(undefined, undefined, true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKeys, settings.auto_reminders]);

  // ── Access control ────────────────────────────────────────────────
  const can = (mod: Module, level: "view" | "edit" = "view") => {
    if (me.role === "admin") return true;
    if (me.role !== "manager" && me.role !== "broker" && me.role !== "finance") return false;
    const o = me.overrides?.[`${mod}.${level}`];
    if (o !== undefined) return o;
    if (level === "view" && me.overrides?.[`${mod}.edit`]) return true;
    const p = settings.role_permissions[me.role][mod];
    return level === "view" ? p !== "none" : p === "edit";
  };
  /** Who approves a workflow step is set in the approval matrix (admin can always approve). */
  const canApprove = (step: number) => me.role === "admin" || (me.overrides?.[`approve.${step}`] ?? settings.approval_matrix[step - 1].includes(me.role));
  /** Brokers, and Property Managers set to "selected", only see the properties assigned to them. */
  const visibleProperties = properties.filter((p) => canSeeProperty(me, p.id));
  const visibleIds = new Set(visibleProperties.map((p) => p.id));
  const restricted = isRestricted(me);
  /** Visible to the signed-in user: a tenancy, a tenant (through their tenancies), a landlord (through their properties). */
  const seesContract = (contractId: number) => { const c = contracts.find((x) => x.id === contractId); return !!c && visibleIds.has(c.property_id); };
  const seesTenant = (tenantId: number | null | undefined) => !restricted || contracts.some((c) => c.tenant_id === tenantId && visibleIds.has(c.property_id));
  const seesLandlord = (landlordId: number | null | undefined) => !restricted || visibleProperties.some((p) => p.landlord_id === landlordId);
  /** Property Managers limited to a property (the ones listed on it). */
  const managersOf = (propertyId: number) => users.filter((u) => u.role === "manager" && u.property_access === "selected" && u.property_ids?.includes(propertyId));
  /** Brokers working on a property (any number). */
  const brokersOf = (propertyId: number) => users.filter((u) => u.role === "broker" && u.property_ids?.includes(propertyId));
  /**
   * Gives a manager "all" properties, or exactly `ids`. One manager per property:
   * each of those properties leaves any other manager limited to selected properties.
   */
  const setManagerProperties = (managerId: number, access: "all" | "selected", ids: number[]) => {
    setUsers((us) => us.map((u) => {
      if (u.id === managerId) return { ...u, property_access: access, property_ids: access === "selected" ? ids : u.property_ids };
      if (access === "selected" && u.role === "manager" && u.property_access === "selected" && u.property_ids?.some((x) => ids.includes(x)))
        return { ...u, property_ids: u.property_ids.filter((x) => !ids.includes(x)) };
      return u;
    }));
  };
  /** Sets exactly which brokers work on a property. */
  const setBrokersForProperty = (propertyId: number, brokerIds: number[]) => {
    setUsers((us) => us.map((u) => {
      if (u.role !== "broker") return u;
      const has = !!u.property_ids?.includes(propertyId), want = brokerIds.includes(u.id);
      if (want && !has) return { ...u, property_ids: [...(u.property_ids ?? []), propertyId] };
      if (!want && has) return { ...u, property_ids: (u.property_ids ?? []).filter((x) => x !== propertyId) };
      return u;
    }));
  };
  /** Assign a property to one manager (or none): only "selected" managers' lists change. */
  const assignManager = (propertyId: number, managerId: number | null) => {
    setUsers((us) => us.map((u) => {
      if (u.role !== "manager") return u;
      const has = !!u.property_ids?.includes(propertyId);
      if (u.id === managerId && u.property_access === "selected" && !has) return { ...u, property_ids: [...(u.property_ids ?? []), propertyId] };
      if (u.id !== managerId && u.property_access === "selected" && has) return { ...u, property_ids: (u.property_ids ?? []).filter((x) => x !== propertyId) };
      return u;
    }));
  };

  return {
    landlords, properties, tenants, contracts, installments, receipts, utilities, visibleProperties, restricted, seesContract, seesTenant, seesLandlord, managersOf, assignManager, brokersOf, setManagerProperties, setBrokersForProperty, canApprove, overlapFor,
    addReceipt, setReceiptStatus, closeContract, patchContract, docs, messages, users, settings,
    me, setCurrentUserId, toasts, notify, alert, can,
    /** The signed-in person's notifications only. */
    inbox: inbox.filter((i) => isFor(i.to, me)).map((i) => ({ ...i, read: i.readBy.includes(me.id) })),
    markAllRead: () => setInbox((all) => all.map((i) => (isFor(i.to, me) && !i.readBy.includes(me.id) ? { ...i, readBy: [...i.readBy, me.id] } : i))),
    saveLandlord: upsert<Landlord>("landlords", landlords, setLandlords),
    saveProperty: upsert<Property>("properties", properties, setProperties),
    saveTenant: upsert<Tenant>("tenants", tenants, setTenants),
    saveUtility: upsert<UtilityBill>("utilities", utilities, setUtilities),
    saveUser: upsert<User>("users", users, setUsers),
    saveDoc: upsert<Doc>("docs", docs, setDocs),
    deleteDoc: (id: number) => setDocs((d) => d.filter((x) => x.id !== id)),
    deleteProperty: (id: number) => setProperties((r) => r.filter((x) => x.id !== id)),
    saveContract, setContracts, recordPayment, sendMessage, setSettings,
    dueReminders, runAutomation, sentKeys, lastAutoRun, reminderChannels, recipients, viaChannels, viaFor,
    ...lookups,
  };
}

export type Store = ReturnType<typeof useStoreValue>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
