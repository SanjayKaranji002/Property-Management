// Automatic reminder rules: which rent and renewal reminders are due today.
//
// Every reminder has a stable key. A key is sent once, ever, so running the
// rules again (every app load in this prototype, or a daily job on the
// backend later) never sends the same reminder twice:
//
//   up-<instalment>               rent due soon       once, N days before the due date
//   od-<instalment>-<n>           overdue rent        the day after the due date, then every N days
//   rn-<agreement>-<m>-<n>        renewal             at each milestone (e.g. 3 and 2 months before
//                                                     expiry), then every N days until the next one
//
// The same rules can run unchanged in the backend's daily job.

import { addMonthsIso, daysUntil, type Contract, type Installment, type ReminderType, type Settings } from "./data";

export interface DueReminder {
  key: string;
  type: ReminderType;
  kind: string;
  tenant_id: number;
  contract_id: number;
  body: string;
}

interface Ctx {
  installments: Installment[];
  contracts: Contract[];
  settings: Settings;
  balance: (i: Installment) => number;
  propLabel: (propertyId: number) => string;
  tenantName: (tenantId: number) => string;
  /** A cheque is with the bank for this instalment: don't chase it. */
  awaitingClearance: (instalmentId: number) => boolean;
  /** How to pay (Settings → Payment instructions). */
  payInstructions: string;
}

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function dueRemindersFor(ctx: Ctx): DueReminder[] {
  const { settings: st } = ctx;
  const out: DueReminder[] = [];
  const contract = (id: number) => ctx.contracts.find((c) => c.id === id);

  // ── Rent ────────────────────────────────────────────────────────────
  for (const i of ctx.installments) {
    const c = contract(i.contract_id);
    if (!c || c.status !== "active" || c.approval !== "approved") continue;
    const bal = ctx.balance(i);
    if (bal <= 0 || ctx.awaitingClearance(i.id)) continue;
    const d = daysUntil(i.due_date);
    const name = ctx.tenantName(c.tenant_id), where = ctx.propLabel(c.property_id);
    if (d >= 0 && d <= st.rent_days_before) {
      out.push({ key: `up-${i.id}`, type: "upcoming", kind: "Upcoming rent", tenant_id: c.tenant_id, contract_id: c.id,
        body: `Dear ${name}, a reminder that rent instalment #${i.no} of AED ${bal.toLocaleString()} for ${where} is due on ${fmt(i.due_date)}. ${ctx.payInstructions}`.trim() });
    }
    if (d < 0) {
      const every = Math.max(1, st.overdue_every_days);
      const n = Math.floor((-d - 1) / every); // 0 = first notice, the day after the due date
      out.push({ key: `od-${i.id}-${n}`, type: "overdue", kind: n === 0 ? "Overdue rent" : `Overdue rent (follow-up ${n})`, tenant_id: c.tenant_id, contract_id: c.id,
        body: `Dear ${name}, rent instalment #${i.no} of AED ${bal.toLocaleString()} for ${where} was due on ${fmt(i.due_date)} and is now ${-d} day${-d === 1 ? "" : "s"} overdue. ${ctx.payInstructions}`.trim() });
    }
  }

  // ── Renewal ─────────────────────────────────────────────────────────
  // Milestones are real calendar months before the end date (3 → the same day 3 months earlier).
  const milestones = [...new Set(st.renewal_months_before.filter((m) => m > 0))].sort((a, b) => b - a);
  for (const c of ctx.contracts) {
    if (c.status !== "active" || c.closure) continue; // renewed, closed or moving out: stop
    for (let k = 0; k < milestones.length; k++) {
      const m = milestones[k];
      const from = addMonthsIso(c.end_date, -m);
      const until = k + 1 < milestones.length ? addMonthsIso(c.end_date, -milestones[k + 1]) : c.end_date;
      const into = -daysUntil(from); // days since this milestone
      if (into < 0 || daysUntil(until) <= 0) continue; // not in this window
      const freq = st.renewal_frequency_days;
      const n = freq > 0 ? Math.floor(into / freq) : 0;
      out.push({ key: `rn-${c.id}-${m}-${n}`, type: "renewal", kind: n === 0 ? `Renewal reminder (${m} month${m === 1 ? "" : "s"})` : `Renewal reminder (${m} months, follow-up ${n})`,
        tenant_id: c.tenant_id, contract_id: c.id,
        body: `Dear ${ctx.tenantName(c.tenant_id)}, your tenancy for ${ctx.propLabel(c.property_id)} ends on ${fmt(c.end_date)} (${daysUntil(c.end_date)} days from today). Please let us know whether you would like to renew.` });
    }
  }
  return out;
}

/** Plain-English summary of the schedule, shown in Settings. */
export function describeSchedule(st: Settings): string {
  const ms = [...new Set(st.renewal_months_before.filter((m) => m > 0))].sort((a, b) => b - a);
  const renewal = ms.length
    ? `Renewal: ${ms.map((m) => `${m} month${m === 1 ? "" : "s"}`).join(" and ")} before expiry${st.renewal_frequency_days > 0 ? `, then every ${st.renewal_frequency_days} days until renewed or the next reminder` : ""}.`
    : "Renewal: no reminders.";
  return `Rent: ${st.rent_days_before} days before the due date; if unpaid, the day after, then every ${Math.max(1, st.overdue_every_days)} days. ${renewal}`;
}
