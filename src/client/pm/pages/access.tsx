import { useState, type ComponentType } from "react";
import { Building2, Check, Handshake, KeyRound, Landmark, Lock, RotateCcw, Search, ShieldCheck, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULE_LABEL, ROLE_LABEL, WORKFLOW_STEPS, type Module, type Perm, type Role, type Settings, type StaffRole, type User } from "../data";
import { useStore } from "../store";

// ── Permission catalogue ─────────────────────────────────────────────
// Every toggle in the grid is one of these. Staff roles use the module and
// approval permissions; landlords and tenants use their portal permissions.

type Area = { id: string; label: string; portal?: "landlord" | "tenant" };
const AREAS: Area[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "agreements", label: "Agreements" },
  { id: "money", label: "Money" },
  { id: "docs", label: "Documents & messaging" },
  { id: "admin", label: "Administration" },
  { id: "approvals", label: "Approvals" },
  { id: "landlord", label: "Landlord portal", portal: "landlord" },
  { id: "tenant", label: "Tenant portal", portal: "tenant" },
];
const AREA_MODULES: Record<string, Module[]> = {
  portfolio: ["properties", "landlords", "tenants"],
  agreements: ["contracts", "ejari_dewa"],
  money: ["payments", "utilities"],
  docs: ["documents", "communications"],
  admin: ["users", "migration"],
};
const LANDLORD_PERMS: [keyof Settings["landlord_access"], string][] = [
  ["contracts", "View agreement status"], ["payments", "View received payments"], ["documents", "View documents"], ["email_tenants", "Email / follow up tenants"], ["upload", "Upload own documents"],
];
const TENANT_PERMS: [keyof Settings["tenant_access"], string][] = [
  ["property", "View own property"], ["upcoming_rent", "View upcoming rent"], ["contract", "View agreement"], ["documents", "View documents"], ["utilities", "View utility bills"], ["upload", "Upload own documents"],
];

interface PermDef { key: string; label: string; area: string }
const PERMS: PermDef[] = [
  ...Object.entries(AREA_MODULES).flatMap(([area, mods]) => mods.flatMap((m) => [
    { key: `${m}.view`, label: `View ${MODULE_LABEL[m].toLowerCase()}`, area },
    { key: `${m}.edit`, label: `Edit ${MODULE_LABEL[m].toLowerCase()}`, area },
  ])),
  ...WORKFLOW_STEPS.map((step, i) => ({ key: `approve.${i + 1}`, label: `${String(i + 1).padStart(2, "0")} ${step}`, area: "approvals" })),
  ...LANDLORD_PERMS.map(([k, label]) => ({ key: `landlord.${k}`, label, area: "landlord" })),
  ...TENANT_PERMS.map(([k, label]) => ({ key: `tenant.${k}`, label, area: "tenant" })),
];

const ROLES: { role: Role; icon: ComponentType<{ className?: string }>; tint: string; note: string }[] = [
  { role: "admin", icon: ShieldCheck, tint: "bg-[#e6ede6] text-[#1f3d2b]", note: "Holds every permission and cannot be reduced." },
  { role: "manager", icon: Building2, tint: "bg-[#ece6dc] text-[#5b4a33]", note: "Day-to-day property operations." },
  { role: "broker", icon: Handshake, tint: "bg-[#f3e8d3] text-[#7a5a24]", note: "Limited to the properties assigned to each broker." },
  { role: "finance", icon: Landmark, tint: "bg-[#f6e1d8] text-[#9a3f22]", note: "Calculations, collections and settlements." },
  { role: "landlord", icon: KeyRound, tint: "bg-[#e6ede6] text-[#1f3d2b]", note: "Portal permissions. Landlords only ever see their own properties." },
  { role: "tenant", icon: UserIcon, tint: "bg-[#efebe2] text-[#5b4a33]", note: "Portal permissions. Tenants only ever see their own tenancy." },
];

const isStaff = (r: Role): r is StaffRole => r === "manager" || r === "broker" || r === "finance";
const areasFor = (r: Role) => AREAS.filter((a) => (r === "landlord" ? a.portal === "landlord" : r === "tenant" ? a.portal === "tenant" : !a.portal));

/** Role-level value of one permission. */
function roleValue(st: Settings, role: Role, key: string): boolean {
  if (role === "admin") return !key.startsWith("landlord.") && !key.startsWith("tenant.");
  const [head, tail] = key.split(".");
  if (head === "landlord") return role === "landlord" && st.landlord_access[tail as keyof Settings["landlord_access"]];
  if (head === "tenant") return role === "tenant" && st.tenant_access[tail as keyof Settings["tenant_access"]];
  if (head === "approve") return st.approval_matrix[Number(tail) - 1].includes(role);
  if (!isStaff(role)) return false;
  const p = st.role_permissions[role][head as Module];
  return tail === "view" ? p !== "none" : p === "edit";
}

/** A person's effective value: their override if set, else the role's. */
function personValue(st: Settings, u: User, key: string): boolean {
  const o = u.overrides?.[key];
  if (o !== undefined) return o;
  if (key.endsWith(".view") && u.overrides?.[key.replace(".view", ".edit")]) return true;
  return roleValue(st, u.role, key);
}

export function PermissionsPanel() {
  const s = useStore();
  const st = s.settings;
  const [role, setRole] = useState<Role>("manager");
  const [area, setArea] = useState<string>("portfolio");
  const [q, setQ] = useState("");
  const [peopleQ, setPeopleQ] = useState("");
  const editable = s.me.role === "admin";

  const query = q.trim().toLowerCase();
  const roleAreas = areasFor(role);
  const activeArea = roleAreas.some((a) => a.id === area) ? area : roleAreas[0].id;
  const rolePerms = PERMS.filter((p) => roleAreas.some((a) => a.id === p.area));
  const shown = rolePerms.filter((p) => (activeArea === "all" || p.area === activeArea) && (!query || p.label.toLowerCase().includes(query)));
  const people = s.users.filter((u) => u.role === role && `${u.name} ${u.email}`.toLowerCase().includes(peopleQ.toLowerCase()));
  const meta = ROLES.find((r) => r.role === role)!;

  const roleCount = (r: Role) => { const ps = PERMS.filter((p) => areasFor(r).some((a) => a.id === p.area)); return [ps.filter((p) => roleValue(st, r, p.key)).length, ps.length]; };
  const roles = ROLES.filter((r) => !query || ROLE_LABEL[r.role].toLowerCase().includes(query) || PERMS.some((p) => p.label.toLowerCase().includes(query)));

  function setRolePerm(key: string, on: boolean) {
    const [head, tail] = key.split(".");
    if (head === "landlord") return s.setSettings({ ...st, landlord_access: { ...st.landlord_access, [tail]: on } });
    if (head === "tenant") return s.setSettings({ ...st, tenant_access: { ...st.tenant_access, [tail]: on } });
    if (head === "approve") {
      const m = st.approval_matrix.map((rs, i) => (i === Number(tail) - 1 ? (on ? [...new Set([...rs, role])] : rs.filter((x) => x !== role)) : rs));
      return s.setSettings({ ...st, approval_matrix: m });
    }
    if (!isStaff(role)) return;
    const cur = st.role_permissions[role][head as Module];
    const next: Perm = tail === "view" ? (on ? (cur === "none" ? "view" : cur) : "none") : on ? "edit" : cur === "edit" ? "view" : cur;
    s.setSettings({ ...st, role_permissions: { ...st.role_permissions, [role]: { ...st.role_permissions[role], [head]: next } } });
  }

  function setPersonPerm(u: User, key: string, on: boolean) {
    const o = { ...(u.overrides ?? {}) };
    const apply = (k: string, v: boolean) => { if (roleValue(st, u.role, k) === v) delete o[k]; else o[k] = v; };
    apply(key, on);
    // Edit implies view; removing view removes edit.
    if (key.endsWith(".edit") && on) apply(key.replace(".edit", ".view"), true);
    if (key.endsWith(".view") && !on) apply(key.replace(".view", ".edit"), false);
    s.saveUser({ ...u, overrides: Object.keys(o).length ? o : undefined });
  }

  const areaCount = (id: string) => (id === "all" ? rolePerms.length : rolePerms.filter((p) => p.area === id).length);
  const tabs = [{ id: "all", label: "All areas" }, ...roleAreas];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles or permissions" className="h-11 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Role list */}
        <aside className="pm-card self-start overflow-hidden rounded-[1.5rem] border border-border/70 bg-card">
          <div className="border-b border-border/70 px-5 py-4">
            <div className="text-base font-semibold">Role list</div>
            <div className="text-xs text-muted-foreground">{ROLES.length} roles · {PERMS.length} permissions</div>
          </div>
          <ul className="max-h-[560px] divide-y divide-border/70 overflow-auto">
            {roles.map(({ role: r, icon: Icon, tint }) => {
              const [on, total] = roleCount(r); const n = s.users.filter((u) => u.role === r).length;
              return (
                <li key={r}>
                  <button onClick={() => setRole(r)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors", role === r ? "bg-muted" : "hover:bg-muted/50")}>
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tint)}><Icon className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{ROLE_LABEL[r]}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">{n} {n === 1 ? "person" : "people"} · {on}/{total}</span>
                    </span>
                  </button>
                </li>);
            })}
          </ul>
        </aside>

        {/* Grid */}
        <section className="pm-card min-w-0 overflow-hidden rounded-[1.5rem] border border-border/70 bg-card">
          <div className="flex gap-1 overflow-x-auto border-b border-border/70 px-3 pt-3">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setArea(t.id)}
                className={cn("flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 py-2.5 text-sm transition-colors", activeArea === t.id ? "bg-muted font-medium text-[#1f3d2b] dark:text-[#cfe3d3]" : "text-foreground/80 hover:bg-muted/50")}>
                {t.label}<span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", activeArea === t.id ? "bg-[#1f3d2b] text-[#f4f1ea] dark:bg-[#8fb89a] dark:text-[#14231a]" : "bg-muted text-muted-foreground")}>{areaCount(t.id)}</span>
              </button>))}
          </div>
          <p className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground">
            {role === "admin" && <Lock className="h-3.5 w-3.5" />}{meta.note}{!editable && " Only an Administrator can change permissions."}
          </p>

          {shown.length === 0 ? <p className="px-5 pb-6 text-sm text-muted-foreground">No permissions match "{q}".</p> : (
            <div className="overflow-x-auto">
              <table className="w-full border-t border-border/70 text-sm">
                <thead>
                  <tr className="align-bottom">
                    <th className="sticky left-0 z-10 min-w-56 border-r border-border/70 bg-card px-5 py-3 text-left text-xs font-medium">Role</th>
                    {shown.map((p) => <th key={p.key} className="min-w-[112px] px-2 py-3 text-center text-[11px] font-medium leading-tight">{p.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/70 bg-muted/40">
                    <td className="sticky left-0 z-10 border-r border-border/70 bg-muted px-5 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-[#1f3d2b] dark:text-[#cfe3d3]">
                        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", meta.tint)}><meta.icon className="h-4 w-4" /></span>
                        {ROLE_LABEL[role]}{role === "admin" && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                      </span>
                    </td>
                    {shown.map((p) => (
                      <td key={p.key} className="px-2 py-3 text-center">
                        <Switch on={roleValue(st, role, p.key)} disabled={!editable || role === "admin"} onChange={(v) => setRolePerm(p.key, v)} label={`${ROLE_LABEL[role]}: ${p.label}`} />
                      </td>))}
                  </tr>
                  <tr className="border-t border-border/70">
                    <td colSpan={shown.length + 1} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium">People with {ROLE_LABEL[role]} ({s.users.filter((u) => u.role === role).length})</span>
                        <div className="relative w-full max-w-md">
                          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input value={peopleQ} onChange={(e) => setPeopleQ(e.target.value)} placeholder={`Search ${ROLE_LABEL[role]} by name or email`} className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        {isStaff(role) && <span className="text-xs text-muted-foreground">A gold dot marks a personal exception to the role.</span>}
                      </div>
                    </td>
                  </tr>
                  {people.length === 0 && <tr><td colSpan={shown.length + 1} className="px-5 py-4 text-sm text-muted-foreground">No one has this role yet.</td></tr>}
                  {people.map((u) => {
                    const custom = Object.keys(u.overrides ?? {}).length;
                    return (
                      <tr key={u.id} className="border-t border-border/70">
                        <td className="sticky left-0 z-10 border-r border-border/70 bg-card px-5 py-3">
                          <div className="font-medium">{u.name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">{u.email}
                            {custom > 0 && editable && <button className="inline-flex items-center gap-1 text-gold hover:underline" onClick={() => s.saveUser({ ...u, overrides: undefined })}><RotateCcw className="h-3 w-3" />Reset {custom}</button>}
                          </div>
                        </td>
                        {shown.map((p) => {
                          const overridden = u.overrides?.[p.key] !== undefined;
                          return (
                            <td key={p.key} className="relative px-2 py-3 text-center">
                              <Switch on={personValue(st, u, p.key)} disabled={!editable || !isStaff(role)} onChange={(v) => setPersonPerm(u, p.key, v)} label={`${u.name}: ${p.label}`} />
                              {overridden && <span className="absolute right-3 top-2.5 h-1.5 w-1.5 rounded-full bg-[#a9874f]" title="Differs from the role" />}
                            </td>);
                        })}
                      </tr>);
                  })}
                </tbody>
              </table>
            </div>)}
        </section>
      </div>
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors",
        on ? "bg-[#1f3d2b]/85 dark:bg-[#8fb89a]" : "bg-muted ring-1 ring-inset ring-border",
        disabled ? "cursor-default opacity-80" : "cursor-pointer hover:brightness-110")}>
      <span className={cn("absolute flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")}>
        {on && <Check className="h-3 w-3 text-[#1f3d2b]" strokeWidth={3} />}
      </span>
    </button>
  );
}

