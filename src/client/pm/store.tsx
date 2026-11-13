import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildInstallments, buildReceipts, calcInstallments, daysUntil, defaultSettings, today,
  seedContracts, seedDocs, seedLandlords, seedMessages, seedProperties, seedTenants, seedUsers, seedUtilities,
  type Channel, type Contract, type Recipient, type RecipientType, type ReminderType, type SendVia, type Doc, type Installment, type Landlord, type Message, type Module,
  type Property, type Receipt, type ReceiptStatus, type Closure, type Settings, type Tenant, type User, type UtilityBill, agreementRef } from "./data";

export interface Toast { id: number; title: string; body: string }

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
  const [inbox, setInbox] = useState<(Toast & { at: string; read: boolean })[]>([
    { id: 1, title: "Emirates ID expiring", body: "Maria Santos' Emirates ID expires in 25 days.", at: today(), read: false },
    { id: 2, title: "Overdue rent", body: "2 instalments are overdue.", at: today(), read: false },
  ]);

  const me = users.find((u) => u.id === currentUserId) ?? users[0];

  const nextId = <T extends { id: number }>(rows: T[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  const notify = useCallback((title: string, body: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body }]);
    setInbox((i) => [{ id, title, body, at: today(), read: false }, ...i]);
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
    } else notify(`Receipt ${status}`, r.reference);
  };
  const recordPayment = (installmentId: number, amount: number, method: string) =>
    addReceipt({ installment_id: installmentId, amount, method: method as Receipt["method"], date: today(), reference: method === "Payment link" ? `PL-${Date.now().toString().slice(-6)}` : "—", bank: "" });

  const closeContract = (id: number, closure: Closure) => {
    const c = contracts.find((x) => x.id === id); if (!c) return;
    setContracts((rs) => rs.map((r) => (r.id === id ? { ...r, status: "closed", closure, dewa_status: "closed" } : r)));
    setProperties((ps) => ps.map((p) => (p.id === c.property_id ? { ...p, status: "vacant" } : p)));
    notify("Tenancy closed", `${agreementRef(c)}: property marked vacant`);
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
  const dueReminders = useMemo(() => {
    const out: { key: string; type: ReminderType; kind: string; tenant_id: number; contract_id: number; body: string }[] = [];
    for (const i of installments) {
      const c = lookups.contract(i.contract_id); if (!c || c.status !== "active") continue;
      const bal = lookups.balance(i); if (bal <= 0) continue;
      const d = daysUntil(i.due_date);
      const where = lookups.propLabel(c.property_id);
      const name = lookups.tenantName(c.tenant_id);
      if (d >= 0 && d <= settings.rent_days_before)
        out.push({ key: `up-${i.id}`, type: "upcoming", kind: "Upcoming rent", tenant_id: c.tenant_id, contract_id: c.id, body: `Dear ${name}, instalment #${i.no} of AED ${bal.toLocaleString()} for ${where} is due on ${i.due_date}.` });
      if (d < 0 && (-d) % settings.overdue_every_days === 0 || (d < 0 && -d <= 1))
        out.push({ key: `od-${i.id}`, type: "overdue", kind: "Overdue rent", tenant_id: c.tenant_id, contract_id: c.id, body: `Dear ${name}, instalment #${i.no} of AED ${bal.toLocaleString()} for ${where} is ${-d} days overdue. Pay securely here: ${location.origin}/pay/${i.id}` });
    }
    for (const c of contracts) {
      if (c.status !== "active") continue;
      const d = daysUntil(c.end_date);
      for (const m of settings.renewal_months_before) {
        const windowStart = m * 30, windowEnd = (m - 1) * 30;
        if (d <= windowStart && d > windowEnd)
          out.push({ key: `rn-${c.id}-${m}`, type: "renewal", kind: `Renewal reminder (${m} months)`, tenant_id: c.tenant_id, contract_id: c.id, body: `Dear ${lookups.tenantName(c.tenant_id)}, your tenancy for ${lookups.propLabel(c.property_id)} expires on ${c.end_date}. Please confirm whether you wish to renew.` });
      }
    }
    return out;
  }, [installments, contracts, settings, lookups]);

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

  /** Channels a reminder actually goes out on: the chosen ones the tenant can be reached on. */
  const reminderChannels = (via: SendVia, tenantId: number): Channel[] => {
    const t = tenants.find((x) => x.id === tenantId);
    const want: Channel[] = via === "both" ? ["whatsapp", "email"] : [via];
    return want.filter((ch) => (ch === "whatsapp" ? !!t?.phone : !!t?.email));
  };
  /** Sends the given (default: all) due reminders. `override` replaces each type's configured channel. */
  const runAutomation = (override?: SendVia, keys?: string[]) => {
    let n = 0, skipped = 0;
    for (const r of dueReminders) {
      if (keys && !keys.includes(r.key)) continue;
      const via = override ?? settings.reminder_via[r.type];
      const chs = reminderChannels(via, r.tenant_id);
      if (chs.length < (via === "both" ? 2 : 1)) skipped++;
      for (const ch of chs) { sendMessage({ channel: ch, tenant_id: r.tenant_id, landlord_id: null, kind: r.kind, body: r.body, status: ch === "whatsapp" ? "delivered" : "sent" }); n++; }
    }
    notify("Reminders sent", `${n} messages sent${skipped ? ` · ${skipped} tenants missing a phone or email` : ""}.`);
  };

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
  /** Brokers only see the properties assigned to them. */
  const visibleProperties = me.role === "broker" ? properties.filter((p) => me.property_ids?.includes(p.id)) : properties;

  return {
    landlords, properties, tenants, contracts, installments, receipts, utilities, visibleProperties, canApprove, overlapFor,
    addReceipt, setReceiptStatus, closeContract, patchContract, docs, messages, users, settings,
    me, setCurrentUserId, toasts, inbox, setInbox, notify, can,
    saveLandlord: upsert<Landlord>("landlords", landlords, setLandlords),
    saveProperty: upsert<Property>("properties", properties, setProperties),
    saveTenant: upsert<Tenant>("tenants", tenants, setTenants),
    saveUtility: upsert<UtilityBill>("utilities", utilities, setUtilities),
    saveUser: upsert<User>("users", users, setUsers),
    saveDoc: upsert<Doc>("docs", docs, setDocs),
    deleteDoc: (id: number) => setDocs((d) => d.filter((x) => x.id !== id)),
    deleteProperty: (id: number) => setProperties((r) => r.filter((x) => x.id !== id)),
    saveContract, setContracts, recordPayment, sendMessage, setSettings,
    dueReminders, runAutomation, reminderChannels, recipients, viaChannels,
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
