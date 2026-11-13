// Frontend-only data layer: typed records plus in-memory mock data.
// Swap the store in store.tsx for real API calls when the backend is ready.

export type Role = "admin" | "manager" | "broker" | "finance" | "landlord" | "tenant";
export type SendVia = "whatsapp" | "email" | "both";
export type ReminderType = "upcoming" | "overdue" | "renewal";
export const REMINDER_LABEL: Record<ReminderType, string> = { upcoming: "Rent due soon", overdue: "Overdue rent", renewal: "Contract expiry / renewal" };
export const VIA_LABEL: Record<SendVia, string> = { whatsapp: "WhatsApp", email: "Email", both: "Both" };
export type StaffRole = "manager" | "broker" | "finance";
export const ROLE_LABEL: Record<Role, string> = { admin: "Administrator", manager: "Property Manager", broker: "Broker", finance: "Finance", landlord: "Landlord", tenant: "Tenant" };
export type KycStatus = "missing" | "pending" | "approved" | "rejected";
export type Approval = "draft" | "pending" | "approved" | "rejected";
export type EjariStatus = "not_registered" | "registered" | "renewal_pending" | "renewed" | "cancelled";
export type DewaStatus = "not_linked" | "applied" | "deposit_paid" | "active" | "closed";
export type ReceiptStatus = "received" | "cleared" | "bounced" | "replaced";
export interface Receipt {
  id: number; installment_id: number; date: string; amount: number; method: "Cheque" | "Bank transfer" | "Cash" | "Card" | "Payment link";
  reference: string; bank: string; status: ReceiptStatus; replaces_id: number | null; note?: string;
}
export interface Template { id: number; name: string; trigger: string; body: string; approved: boolean }
export interface Closure { move_out_date: string; final_dues: number; deductions: number; deduction_note: string; deposit_refund: number; ejari_cancel_ref: string; dewa_final_ref: string; approved_by_finance: boolean }
export type PropertyStatus = "occupied" | "vacant" | "rented";
export type Usage = "residential" | "commercial";
export type Frequency = "monthly" | "quarterly" | "half_yearly" | "yearly";
export type ContractRole = "direct" | "lessee" | "sub_tenant";
export type Channel = "whatsapp" | "email" | "sms" | "in_app";
export type DocCategory = "emirates_id" | "passport" | "kyc" | "tenancy_contract" | "title_deed" | "photo" | "other" | "utility_bill" | "utility_receipt";

export interface Landlord {
  id: number; name: string; email: string; phone: string; nationality: string;
  emirates_id: string; passport_no: string; own_portfolio: boolean;
}
export interface Property {
  id: number; landlord_id: number; name: string; unit_no: string; usage: Usage;
  type: string; community: string; emirate: string; title_deed_no: string;
  bedrooms: number; size_sqft: number; rental_value: number; status: PropertyStatus;
  dewa_premise_no: string; broker_user_id?: number | null;
}
export interface Tenant {
  id: number; first_name: string; last_name: string; email: string; phone: string;
  nationality: string; emirates_id: string; emirates_id_expiry: string;
  passport_no: string; passport_expiry: string; kyc_verified: boolean;
  driving_licence: string; driving_licence_expiry: string; kyc_status: KycStatus; kyc_note?: string;
}
export interface Contract {
  id: number; property_id: number; tenant_id: number; usage: Usage;
  start_date: string; end_date: string; term_years: 1 | 2;
  annual_rent: number; frequency: Frequency; deposit: number;
  role: ContractRole; parent_contract_id: number | null; ejari_no: string;
  status: "active" | "expired" | "renewed" | "terminated" | "closed";
  approval: Approval; broker_fee: number; other_charges: number; prorate_first: boolean; custom_amounts?: number[] | null;
  ejari_status: EjariStatus; ejari_reg_date: string; ejari_expiry: string;
  dewa_account: string; dewa_status: DewaStatus; dewa_deposit_confirmed: boolean; move_in_date: string;
  closure?: Closure | null; agreement_versions: number;
}
export interface Installment {
  id: number; contract_id: number; no: number; due_date: string;
  amount: number; paid: number; paid_on: string | null; method: string | null;
}
export interface UtilityBill {
  id: number; contract_id: number; type: UtilityType;
  period: string; amount: number; status: "paid" | "unpaid"; provider: string;
  /** Filled in when marked paid. */
  paid_on?: string; paid_method?: string; paid_ref?: string; paid_by?: string;
  due_date?: string;
  /** A payment receipt the tenant uploaded from their portal, waiting for staff to check. */
  receipt_doc_id?: number; receipt_status?: "submitted" | "approved" | "rejected";
  /** Bills created from an imported provider bill keep a link to its file. */
  bill_doc_id?: number;
}
export type UtilityType = "electricity" | "water" | "combined";
export const UTIL_LABEL: Record<UtilityType, string> = { electricity: "Electricity", water: "Water", combined: "Electricity & water" };
/** The utility company for each emirate. */
export const PROVIDER_BY_EMIRATE: Record<string, string> = {
  Dubai: "DEWA", "Abu Dhabi": "ADDC", Sharjah: "SEWA", Ajman: "Etihad WE", "Umm Al Quwain": "Etihad WE", "Ras Al Khaimah": "Etihad WE", Fujairah: "Etihad WE",
};
export interface Doc {
  id: number; entity: "property" | "tenant" | "landlord" | "contract" | "utility"; entity_id: number;
  category: DocCategory; name: string; mime: string; url: string; uploaded_on: string; expiry?: string;
}
export interface Message {
  id: number; channel: Channel; tenant_id: number | null; landlord_id: number | null;
  kind: string; body: string; status: "delivered" | "sent" | "failed" | "scheduled"; at: string;
  /** Set when the message went to someone other than the tenant. */
  recipient_type?: RecipientType; recipient_name?: string;
}
export type RecipientType = "tenant" | "landlord" | "broker" | "manager" | "finance";
export const RECIPIENT_LABEL: Record<RecipientType, string> = { tenant: "Tenant", landlord: "Landlord", broker: "Broker", manager: "Property Manager", finance: "Finance" };
export interface Recipient { id: number; name: string; phone: string; email: string; detail: string }
export interface User { id: number; name: string; email: string; role: Role; landlord_id?: number; tenant_id?: number; phone?: string; property_ids?: number[]; approval_limit?: number; active: boolean;
  /** Per-person exceptions to the role, keyed "<module>.view" | "<module>.edit" | "approve.<step>". */
  overrides?: Record<string, boolean> }

export const MODULES = [
  "properties", "landlords", "tenants", "contracts", "ejari_dewa", "payments", "utilities", "documents", "communications", "users", "migration",
] as const;
export type Module = (typeof MODULES)[number];
export const MODULE_LABEL: Record<Module, string> = {
  properties: "Properties", landlords: "Landlords", tenants: "Tenants & KYC", contracts: "Rental agreements", ejari_dewa: "Ejari & DEWA",
  payments: "Collections", utilities: "Utilities", documents: "Documents", communications: "WhatsApp", users: "Users & access", migration: "CSV import",
};
export type Perm = "none" | "view" | "edit";

/** The 13 workflow steps with their editable approver role. */
export const WORKFLOW_STEPS = [
  "Administrator access and configuration", "Landlord, manager and broker accounts", "Property registration", "Tenant registration and KYC",
  "Rental agreement setup", "Ejari registration and tracking", "DEWA linkage and move-in", "Rental calculations and schedules",
  "Collections and reconciliation", "WhatsApp reminders", "Dashboard and reports", "Renewal and closure", "Migration, testing and deployment",
];

export interface Settings {
  role_permissions: Record<StaffRole, Record<Module, Perm>>;
  approval_matrix: Role[][];         // roles that may approve each workflow step (index = step - 1)
  templates: Template[];
  tenant_access: { property: boolean; upcoming_rent: boolean; documents: boolean; contract: boolean; utilities: boolean; upload: boolean };
  landlord_access: { contracts: boolean; payments: boolean; documents: boolean; email_tenants: boolean; upload: boolean };
  channels: Record<Channel, boolean>;
  /** How each automatic reminder goes out. */
  reminder_via: Record<ReminderType, SendVia>;
  renewal_months_before: number[];   // 3 and 2 months before expiry
  renewal_frequency_days: number;    // repeat within each window
  rent_days_before: number;
  overdue_every_days: number;
  commercial_vat_pct: number;
}

export const NATIONALITIES = [
  "Emirati", "Indian", "Pakistani", "Bangladeshi", "Filipino", "Egyptian", "Jordanian", "Lebanese", "Syrian",
  "Saudi", "Omani", "British", "American", "Canadian", "French", "German", "Italian", "Russian", "Chinese",
  "Sri Lankan", "Nepali", "South African", "Nigerian", "Kenyan", "Iranian", "Other",
];
export const EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];
export const FREQUENCIES: { value: Frequency; label: string; payments: number }[] = [
  { value: "yearly", label: "Yearly (1 payment)", payments: 1 },
  { value: "half_yearly", label: "Half-yearly (2 payments)", payments: 2 },
  { value: "quarterly", label: "Quarterly (4 payments)", payments: 4 },
  { value: "monthly", label: "Monthly (12 payments)", payments: 12 },
];
export const DOC_LABELS: Record<DocCategory, string> = {
  emirates_id: "Emirates ID", passport: "Passport", kyc: "KYC", tenancy_contract: "Tenancy contract",
  title_deed: "Title deed", photo: "Photo", other: "Other", utility_bill: "Utility bill", utility_receipt: "Utility payment receipt",
};

// ── Rental formula ────────────────────────────────────────────────
// Workflow step 8: annual rent ÷ instalment count (e.g. AED 120,000 / 4 = 30,000).
// Optional prorated first instalment (days to the 1st of next month, actual/365),
// optional customised amounts, VAT on commercial. Deposit and broker/add-on
// charges are kept separate from rent. Rounding: 2 dp, remainder on the last
// instalment — confirm the day-count, rounding and tax rules with Finance.
export function calcInstallments(
  c: Pick<Contract, "start_date" | "term_years" | "annual_rent" | "frequency" | "usage"> & Partial<Pick<Contract, "prorate_first" | "custom_amounts">>,
  vatPct: number,
) {
  const perYear = FREQUENCIES.find((f) => f.value === c.frequency)!.payments;
  const count = perYear * c.term_years;
  const vat = c.usage === "commercial" ? 1 + vatPct / 100 : 1;
  const totalRent = c.annual_rent * c.term_years * vat;
  const step = 12 / perYear;
  const out: { no: number; due_date: string; amount: number; note?: string }[] = [];
  let start = c.start_date;
  if (c.prorate_first && !c.start_date.endsWith("-01")) {
    const d = new Date(`${c.start_date}T00:00:00`);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const days = Math.round((next.getTime() - d.getTime()) / 86_400_000);
    out.push({ no: 0, due_date: c.start_date, amount: round2((c.annual_rent * vat * days) / 365), note: `Prorated ${days} days` });
    start = iso8601(next);
  }
  if (c.custom_amounts && c.custom_amounts.length === count) {
    c.custom_amounts.forEach((a, i) => out.push({ no: i + 1, due_date: addMonthsIso(start, i * step), amount: a }));
  } else {
    const each = round2(totalRent / count);
    for (let i = 0; i < count; i++) out.push({ no: i + 1, due_date: addMonthsIso(start, i * step), amount: i === count - 1 ? round2(totalRent - each * (count - 1)) : each });
  }
  return out;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return iso8601(d);
}
export function iso8601(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const today = () => iso8601(new Date());
export function daysUntil(iso: string) {
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86_400_000);
}
export const aed = (n: number) => `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Mock data ─────────────────────────────────────────────────────

const rel = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return iso8601(d); };

export const seedLandlords: Landlord[] = [
  { id: 1, name: "Own Portfolio (Company)", email: "portfolio@company.ae", phone: "+971 4 000 0000", nationality: "Emirati", emirates_id: "784-1980-1234567-1", passport_no: "—", own_portfolio: true },
  { id: 2, name: "Ahmed Al Mansoori", email: "ahmed.m@example.ae", phone: "+971 50 111 2233", nationality: "Emirati", emirates_id: "784-1975-7654321-2", passport_no: "A1234567", own_portfolio: false },
  { id: 3, name: "Priya Raman", email: "priya.r@example.com", phone: "+971 55 444 7788", nationality: "Indian", emirates_id: "784-1988-2223334-5", passport_no: "Z9876543", own_portfolio: false },
  { id: 4, name: "James Whitfield", email: "j.whitfield@example.co.uk", phone: "+971 52 999 0011", nationality: "British", emirates_id: "784-1979-5556667-8", passport_no: "GB5544332", own_portfolio: false },
];

const P = (id: number, landlord_id: number, name: string, unit_no: string, usage: Usage, type: string, community: string, emirate: string, bedrooms: number, size_sqft: number, rental_value: number, status: PropertyStatus): Property =>
  ({ id, landlord_id, name, unit_no, usage, type, community, emirate, title_deed_no: `TD-${100200 + id}`, bedrooms, size_sqft, rental_value, status, dewa_premise_no: emirate === "Dubai" ? `6${String(81234500 + id * 37)}` : "", broker_user_id: id % 3 === 0 ? 7 : null });

export const seedProperties: Property[] = [
  P(1, 1, "Marina Heights", "1204", "residential", "Apartment", "Dubai Marina", "Dubai", 2, 1250, 120000, "rented"),
  P(2, 1, "Marina Heights", "1507", "residential", "Apartment", "Dubai Marina", "Dubai", 1, 820, 85000, "vacant"),
  P(3, 1, "Al Barsha Villa 12", "V12", "residential", "Villa", "Al Barsha", "Dubai", 4, 3800, 240000, "rented"),
  P(4, 1, "Business Bay Tower", "Office 905", "commercial", "Office", "Business Bay", "Dubai", 0, 1600, 150000, "rented"),
  P(5, 2, "Reem Island Residence", "803", "residential", "Apartment", "Al Reem Island", "Abu Dhabi", 2, 1300, 110000, "rented"),
  P(6, 2, "Reem Island Residence", "1102", "residential", "Apartment", "Al Reem Island", "Abu Dhabi", 3, 1750, 145000, "occupied"),
  P(7, 2, "Khalifa City Shop", "S-04", "commercial", "Retail", "Khalifa City", "Abu Dhabi", 0, 900, 95000, "rented"),
  P(8, 3, "JVC Greens", "305", "residential", "Apartment", "Jumeirah Village Circle", "Dubai", 1, 760, 68000, "rented"),
  P(9, 3, "JVC Greens", "410", "residential", "Apartment", "Jumeirah Village Circle", "Dubai", 0, 450, 45000, "vacant"),
  P(10, 3, "Al Nahda Tower", "1608", "residential", "Apartment", "Al Nahda", "Sharjah", 2, 1150, 52000, "rented"),
  P(11, 4, "Arabian Ranches Villa", "AR-77", "residential", "Villa", "Arabian Ranches", "Dubai", 3, 2900, 210000, "rented"),
  P(12, 4, "DIFC Gate Office", "Suite 312", "commercial", "Office", "DIFC", "Dubai", 0, 1100, 175000, "vacant"),
];

export const seedTenants: Tenant[] = [
  { id: 1, first_name: "Omar", last_name: "Haddad", email: "omar.h@example.com", phone: "+971501234567", nationality: "Jordanian", emirates_id: "784-1990-1111111-1", emirates_id_expiry: rel(240), passport_no: "N1122334", passport_expiry: rel(900), kyc_verified: true, driving_licence: "DL-400101", driving_licence_expiry: rel(240), kyc_status: "approved" },
  { id: 2, first_name: "Maria", last_name: "Santos", email: "maria.s@example.com", phone: "+971559876543", nationality: "Filipino", emirates_id: "784-1992-2222222-2", emirates_id_expiry: rel(25), passport_no: "P7788990", passport_expiry: rel(1200), kyc_verified: true, driving_licence: "DL-400102", driving_licence_expiry: rel(280), kyc_status: "approved" },
  { id: 3, first_name: "Global Trade", last_name: "LLC", email: "accounts@globaltrade.ae", phone: "+97142223344", nationality: "Emirati", emirates_id: "784-1970-3333333-3", emirates_id_expiry: rel(500), passport_no: "—", passport_expiry: "", kyc_verified: true, driving_licence: "", driving_licence_expiry: "", kyc_status: "approved" },
  { id: 4, first_name: "Rahul", last_name: "Mehta", email: "rahul.m@example.com", phone: "+971527654321", nationality: "Indian", emirates_id: "784-1987-4444444-4", emirates_id_expiry: rel(400), passport_no: "K5566778", passport_expiry: rel(700), kyc_verified: false, driving_licence: "DL-400104", driving_licence_expiry: rel(360), kyc_status: "missing" },
  { id: 5, first_name: "Sara", last_name: "Khalil", email: "sara.k@example.com", phone: "+971561112233", nationality: "Lebanese", emirates_id: "784-1993-5555555-5", emirates_id_expiry: rel(300), passport_no: "LB998877", passport_expiry: rel(1500), kyc_verified: true, driving_licence: "DL-400105", driving_licence_expiry: rel(400), kyc_status: "approved" },
  { id: 6, first_name: "Fresh Bites", last_name: "Trading", email: "ops@freshbites.ae", phone: "+97125556677", nationality: "Emirati", emirates_id: "784-1981-6666666-6", emirates_id_expiry: rel(600), passport_no: "—", passport_expiry: "", kyc_verified: true, driving_licence: "", driving_licence_expiry: "", kyc_status: "approved" },
  { id: 7, first_name: "David", last_name: "Clarke", email: "d.clarke@example.com", phone: "+971503334455", nationality: "British", emirates_id: "784-1985-7777777-7", emirates_id_expiry: rel(800), passport_no: "GB1239876", passport_expiry: rel(2000), kyc_verified: true, driving_licence: "DL-400107", driving_licence_expiry: rel(480), kyc_status: "approved" },
  { id: 8, first_name: "Aisha", last_name: "Rahman", email: "aisha.r@example.com", phone: "+971548889900", nationality: "Bangladeshi", emirates_id: "784-1995-8888888-8", emirates_id_expiry: rel(150), passport_no: "BD4455667", passport_expiry: rel(1000), kyc_verified: true, driving_licence: "DL-400108", driving_licence_expiry: rel(520), kyc_status: "approved" },
  { id: 9, first_name: "Khalid", last_name: "Nasser", email: "khalid.n@example.com", phone: "+971509990011", nationality: "Egyptian", emirates_id: "784-1989-9999999-9", emirates_id_expiry: rel(350), passport_no: "EG3344556", passport_expiry: rel(1100), kyc_verified: true, driving_licence: "", driving_licence_expiry: "", kyc_status: "approved" },
];

const C = (id: number, property_id: number, tenant_id: number, usage: Usage, startOffset: number, term_years: 1 | 2, annual_rent: number, frequency: Frequency, role: ContractRole = "direct", parent: number | null = null): Contract => {
  const start = rel(startOffset);
  const endD = new Date(`${addMonthsIso(start, term_years * 12)}T00:00:00`); endD.setDate(endD.getDate() - 1);
  return { id, property_id, tenant_id, usage, start_date: start, end_date: iso8601(endD), term_years, annual_rent, frequency, deposit: Math.round(annual_rent * 0.05), role, parent_contract_id: parent, ejari_no: `EJ-${2026000 + id}`, status: "active",
    approval: "approved", broker_fee: Math.round(annual_rent * 0.05), other_charges: 0, prorate_first: false, custom_amounts: null,
    ejari_status: id === 2 || id === 5 ? "renewal_pending" : "registered", ejari_reg_date: start, ejari_expiry: iso8601(endD),
    dewa_account: `20${31000000 + id * 7}`, dewa_status: id === 6 ? "applied" : "active", dewa_deposit_confirmed: id !== 6, move_in_date: start, closure: null, agreement_versions: 1 };
};

export const seedContracts: Contract[] = [
  C(1, 1, 1, "residential", -300, 1, 120000, "quarterly"),
  C(2, 3, 2, "residential", -275, 1, 240000, "half_yearly"),   // expires in ~90 days
  C(3, 4, 3, "commercial", -400, 2, 150000, "quarterly"),
  C(4, 5, 4, "residential", -120, 1, 110000, "quarterly"),
  C(5, 7, 6, "commercial", -305, 1, 95000, "quarterly"),       // expires in ~60 days
  C(6, 8, 5, "residential", -30, 1, 68000, "monthly"),
  C(7, 10, 8, "residential", -200, 1, 52000, "half_yearly"),
  C(8, 11, 7, "residential", -60, 2, 210000, "yearly"),
  C(9, 11, 9, "residential", -40, 1, 60000, "quarterly", "sub_tenant", 8), // sub-let room inside AR-77
];
seedContracts.push({ ...C(10, 1, 1, "residential", -665, 1, 115000, "quarterly"), status: "renewed" });

export function buildInstallments(contracts: Contract[], vat: number): Installment[] {
  const out: Installment[] = [];
  let id = 1;
  const t = today();
  for (const c of contracts) {
    for (const i of calcInstallments(c, vat)) {
      const past = i.due_date < t;
      // Most past installments paid; a couple left overdue for the demo.
      const overdue = past && ((c.id === 4 && i.no === 2) || (c.id === 7 && i.no === 2) || (c.id === 6 && daysUntil(i.due_date) > -20));
      const paid = past && !overdue ? i.amount : 0;
      out.push({ id: id++, contract_id: c.id, no: i.no, due_date: i.due_date, amount: i.amount, paid, paid_on: paid ? i.due_date : null, method: paid ? (i.no % 2 ? "Cheque" : "Bank transfer") : null });
    }
  }
  return out;
}

export const seedUtilities: UtilityBill[] = [
  { id: 1, contract_id: 1, type: "electricity", period: rel(-30).slice(0, 7), amount: 640, status: "paid", provider: "DEWA", paid_on: rel(-12), paid_method: "Paid by tenant to provider", paid_ref: "DEWA-RCPT-55821", paid_by: "Fatima (Property Manager)" },
  { id: 2, contract_id: 1, type: "water", period: rel(-30).slice(0, 7), amount: 210, status: "unpaid", provider: "DEWA" },
  { id: 3, contract_id: 2, type: "electricity", period: rel(-30).slice(0, 7), amount: 1820, status: "unpaid", provider: "DEWA" },
  { id: 4, contract_id: 4, type: "electricity", period: rel(-30).slice(0, 7), amount: 560, status: "paid", provider: "ADDC", paid_on: rel(-10), paid_method: "Bank transfer", paid_ref: "TRF-771204", paid_by: "Leena Das" },
  { id: 5, contract_id: 4, type: "water", period: rel(-30).slice(0, 7), amount: 180, status: "paid", provider: "ADDC", paid_on: rel(-10), paid_method: "Bank transfer", paid_ref: "TRF-771205", paid_by: "Leena Das" },
  { id: 6, contract_id: 7, type: "electricity", period: rel(-30).slice(0, 7), amount: 430, status: "unpaid", provider: "SEWA" },
];

// Small inline SVG placeholders so the built-in viewer has something to show.
const svgDoc = (title: string, color: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='640' height='400' rx='18' fill='${color}'/><text x='40' y='80' font-family='sans-serif' font-size='30' fill='white' font-weight='bold'>${title}</text><text x='40' y='130' font-family='sans-serif' font-size='18' fill='white' opacity='.8'>Sample document — replace with upload</text></svg>`);

export const seedDocs: Doc[] = [
  { id: 1, entity: "tenant", entity_id: 1, category: "emirates_id", name: "Omar Haddad - Emirates ID.png", mime: "image/svg+xml", url: svgDoc("Emirates ID · Omar Haddad", "#0f766e"), uploaded_on: rel(-300), expiry: rel(240) },
  { id: 2, entity: "tenant", entity_id: 1, category: "passport", name: "Omar Haddad - Passport.png", mime: "image/svg+xml", url: svgDoc("Passport · Omar Haddad", "#1e3a8a"), uploaded_on: rel(-300) },
  { id: 3, entity: "contract", entity_id: 1, category: "tenancy_contract", name: "Tenancy Contract EJ-2026001.png", mime: "image/svg+xml", url: svgDoc("Tenancy Contract EJ-2026001", "#7c3aed"), uploaded_on: rel(-300) },
  { id: 4, entity: "property", entity_id: 1, category: "title_deed", name: "Title Deed TD-100201.png", mime: "image/svg+xml", url: svgDoc("Title Deed TD-100201", "#b45309"), uploaded_on: rel(-500) },
  { id: 5, entity: "property", entity_id: 1, category: "photo", name: "Marina Heights 1204 - Living.png", mime: "image/svg+xml", url: svgDoc("Marina Heights 1204", "#0369a1"), uploaded_on: rel(-500) },
  { id: 6, entity: "tenant", entity_id: 2, category: "emirates_id", name: "Maria Santos - Emirates ID.png", mime: "image/svg+xml", url: svgDoc("Emirates ID · Maria Santos", "#0f766e"), uploaded_on: rel(-275), expiry: rel(25) },
  { id: 7, entity: "landlord", entity_id: 2, category: "passport", name: "Ahmed Al Mansoori - Passport.png", mime: "image/svg+xml", url: svgDoc("Passport · Ahmed Al Mansoori", "#1e3a8a"), uploaded_on: rel(-700) },
  { id: 8, entity: "tenant", entity_id: 3, category: "kyc", name: "Global Trade - Trade Licence.png", mime: "image/svg+xml", url: svgDoc("Trade Licence · Global Trade LLC", "#be123c"), uploaded_on: rel(-400) },
];

export const seedMessages: Message[] = [
  { id: 1, channel: "whatsapp", tenant_id: 4, landlord_id: null, kind: "Overdue rent", body: "Dear Rahul, your rent instalment #2 for Reem Island Residence 803 is overdue. Please pay via the link: https://pay.example/r/4-2", status: "delivered", at: rel(-3) + "T10:00" },
  { id: 2, channel: "whatsapp", tenant_id: 2, landlord_id: null, kind: "Renewal reminder (3 months)", body: "Dear Maria, your tenancy for Al Barsha Villa 12 expires soon. Please let us know if you wish to renew.", status: "delivered", at: rel(-2) + "T09:00" },
  { id: 3, channel: "email", tenant_id: 1, landlord_id: null, kind: "Upcoming rent", body: "Your next instalment is due in 7 days.", status: "sent", at: rel(-1) + "T09:00" },
  { id: 4, channel: "sms", tenant_id: 8, landlord_id: null, kind: "Overdue rent", body: "Rent overdue for Al Nahda Tower 1608. Please pay at your earliest.", status: "failed", at: rel(-1) + "T09:05" },
  { id: 5, channel: "email", tenant_id: 5, landlord_id: 3, kind: "Landlord follow-up", body: "Hi Sara, kindly confirm the payment date for this month's rent. — Priya", status: "sent", at: rel(-1) + "T15:30" },
];

export const seedUsers: User[] = [
  { id: 1, name: "Admin", email: "admin@company.ae", role: "admin", active: true },
  { id: 2, name: "Fatima (Property Manager)", email: "fatima@company.ae", phone: "+971501112200", role: "manager", active: true },
  { id: 9, name: "Khalid Saeed", email: "khalid.s@company.ae", phone: "+971502223300", role: "manager", active: true },
  { id: 3, name: "Ahmed Al Mansoori", email: "ahmed.m@example.ae", role: "landlord", landlord_id: 2, active: true },
  { id: 4, name: "Priya Raman", email: "priya.r@example.com", role: "landlord", landlord_id: 3, active: true },
  { id: 5, name: "Omar Haddad", email: "omar.h@example.com", role: "tenant", tenant_id: 1, active: true },
  { id: 6, name: "Rahul Mehta", email: "rahul.m@example.com", role: "tenant", tenant_id: 4, active: true },
  { id: 7, name: "Yousef Karim", email: "yousef@brokerage.ae", phone: "+971554445566", role: "broker", property_ids: [3, 6, 9, 12], active: true },
  { id: 10, name: "Nadia Brokers LLC", email: "nadia@nadiabrokers.ae", phone: "+971527778899", role: "broker", property_ids: [1, 2, 5], active: true },
  { id: 8, name: "Leena Das", email: "finance@company.ae", phone: "+971506667788", role: "finance", approval_limit: 50000, active: true },
];

const perms = (edit: Module[], view: Module[] = []): Record<Module, Perm> =>
  Object.fromEntries(MODULES.map((m) => [m, edit.includes(m) ? "edit" : view.includes(m) ? "view" : "none"])) as Record<Module, Perm>;

export const defaultTemplates: Template[] = [
  { id: 1, name: "rent_due_reminder", trigger: "Before due date", approved: true, body: "Dear {{tenant}}, instalment #{{no}} of AED {{amount}} for {{property}} is due on {{due_date}}." },
  { id: 2, name: "rent_overdue", trigger: "Overdue rent", approved: true, body: "Dear {{tenant}}, instalment #{{no}} of AED {{amount}} for {{property}} is {{days}} days overdue. Pay here: {{link}}" },
  { id: 3, name: "contract_expiry", trigger: "Expiry / renewal", approved: true, body: "Dear {{tenant}}, your tenancy for {{property}} expires on {{end_date}}. Please confirm whether you wish to renew." },
  { id: 4, name: "cheque_bounced", trigger: "Bounced cheque", approved: false, body: "Dear {{tenant}}, cheque {{ref}} for AED {{amount}} was returned. Please arrange a replacement." },
];

/** Receipts behind the seeded paid instalments, including one bounced/replaced cheque pair. */
export function buildReceipts(inst: Installment[]): Receipt[] {
  const out: Receipt[] = [];
  let id = 1;
  const banks = ["Emirates NBD", "ADCB", "Mashreq", "FAB"];
  for (const i of inst) {
    if (i.paid <= 0) continue;
    const cheque = i.method === "Cheque";
    if (i.contract_id === 3 && i.no === 1) {
      out.push({ id: id++, installment_id: i.id, date: i.due_date, amount: i.amount, method: "Cheque", reference: "CHQ-000431", bank: "Emirates NBD", status: "replaced", replaces_id: null, note: "Bounced: insufficient funds" });
      out.push({ id: id++, installment_id: i.id, date: i.due_date, amount: i.amount, method: "Cheque", reference: "CHQ-000452", bank: "Emirates NBD", status: "cleared", replaces_id: id - 2 });
      continue;
    }
    out.push({ id: id++, installment_id: i.id, date: i.paid_on ?? i.due_date, amount: i.paid, method: cheque ? "Cheque" : "Bank transfer", reference: (cheque ? "CHQ-" : "TRF-") + (100200 + i.id), bank: banks[i.id % 4], status: "cleared", replaces_id: null });
  }
  return out;
}

export const defaultSettings: Settings = {
  role_permissions: {
    manager: perms(["properties", "tenants", "contracts", "ejari_dewa", "utilities", "documents", "communications"], ["landlords", "payments"]),
    broker: perms([], ["properties", "tenants", "contracts"]),
    finance: perms(["payments", "utilities"], ["properties", "landlords", "tenants", "contracts", "documents", "communications"]),
  },
  approval_matrix: [["admin"], ["admin"], ["manager"], ["manager"], ["manager"], ["manager"], ["manager"], ["finance"], ["finance"], ["manager"], ["admin"], ["manager", "finance"], ["admin"]],
  templates: defaultTemplates,
  tenant_access: { property: true, upcoming_rent: true, documents: true, contract: true, utilities: true, upload: false },
  landlord_access: { contracts: true, payments: true, documents: true, email_tenants: true, upload: false },
  channels: { whatsapp: true, email: true, sms: false, in_app: true },
  reminder_via: { upcoming: "both", overdue: "both", renewal: "both" },
  renewal_months_before: [3, 2],
  renewal_frequency_days: 7,
  rent_days_before: 7,
  overdue_every_days: 3,
  commercial_vat_pct: 5,
};

// ── Ejari status (derived, never picked by hand) ─────────────────────

/** Agreement reference: the Ejari number once registered, else an internal one. */
export const agreementRef = (c: Pick<Contract, "id" | "ejari_no">) => c.ejari_no || `AG-${String(c.id).padStart(4, "0")}`;

/** Ejari status follows from the agreement: its lifecycle, Ejari number, registration date and validity. */
export function ejariStatus(c: Pick<Contract, "status" | "ejari_no" | "ejari_reg_date" | "ejari_expiry" | "end_date">): EjariStatus {
  if (c.status === "closed" || c.status === "terminated") return "cancelled";
  if (c.status === "renewed") return "renewed";
  if (!c.ejari_no || !c.ejari_reg_date) return "not_registered";
  if (daysUntil(c.ejari_expiry || c.end_date) <= 90) return "renewal_pending";
  return "registered";
}

export const EJARI_HELP: Record<EjariStatus, string> = {
  not_registered: "The tenancy has not been registered with Ejari yet. Enter the Ejari number and registration date once it is registered.",
  registered: "Registered with Ejari and valid for more than 90 days.",
  renewal_pending: "Registered, but the Ejari expires within 90 days (or has expired). Renew the agreement and its Ejari.",
  renewed: "This agreement was renewed. The new agreement carries its own Ejari registration.",
  cancelled: "The tenancy was closed and its Ejari cancelled.",
};
