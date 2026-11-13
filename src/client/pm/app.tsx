import { useEffect, useRef, useState, type ComponentType, type ReactElement } from "react";
import {
  Bell, Building2, ChevronDown, ContactRound, FileText, FolderOpen, Headphones, Home, Landmark, LayoutDashboard,
  Menu, MessageCircle, Moon, Settings as SettingsIcon, ShieldCheck, Sun, Users, Wallet, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StoreProvider, useStore } from "./store";
import { NavContext } from "./nav";
import { ROLE_LABEL, type Module } from "./data";
import { Dashboard } from "./pages/dashboard";
import { PropertiesPage, PropertyDetail } from "./pages/properties";
import { LandlordDetail, LandlordsPage, TenantDetail, TenantsPage } from "./pages/people";
import { ContractsPage } from "./pages/contracts";
import { PayPage, PaymentsPage, UtilitiesPage } from "./pages/finance";
import { CommunicationsPage, DocumentsPage, SettingsPage, UsersPage } from "./pages/admin";
import { EjariDewaPage } from "./pages/tracking";
import { LandlordContracts, LandlordDocuments, LandlordPayments, TenantHome } from "./pages/portals";

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }>; module?: Module; adminOnly?: boolean };

const STAFF_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2, module: "properties" },
  { href: "/landlords", label: "Landlords", icon: ContactRound, module: "landlords" },
  { href: "/tenants", label: "Tenants & KYC", icon: Users, module: "tenants" },
  { href: "/contracts", label: "Agreements", icon: FileText, module: "contracts" },
  { href: "/ejari-dewa", label: "Ejari & DEWA", icon: Landmark, module: "ejari_dewa" },
  { href: "/payments", label: "Collections", icon: Wallet, module: "payments" },
  { href: "/utilities", label: "Utilities", icon: Zap, module: "utilities" },
  { href: "/documents", label: "Documents", icon: FolderOpen, module: "documents" },
  { href: "/communications", label: "WhatsApp", icon: MessageCircle, module: "communications" },
  { href: "/users", label: "Users & access", icon: ShieldCheck, module: "users" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
];
const LANDLORD_NAV: NavItem[] = [
  { href: "/", label: "My portfolio", icon: LayoutDashboard },
  { href: "/portal/contracts", label: "Agreements", icon: FileText },
  { href: "/portal/payments", label: "Payments", icon: Wallet },
  { href: "/portal/documents", label: "Documents", icon: FolderOpen },
];

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => { const h = () => setPath(window.location.pathname); window.addEventListener("popstate", h); return () => window.removeEventListener("popstate", h); }, []);
  const go = (to: string) => { if (to !== window.location.pathname + window.location.search) { history.pushState(null, "", to); setPath(to.split("?")[0]); } };
  return { path, go };
}

function useTheme() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("pm-theme") === "dark"; } catch { return false; } });
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("pm-dark", dark); el.classList.toggle("pm-light", !dark);
    try { localStorage.setItem("pm-theme", dark ? "dark" : "light"); } catch { /* private mode */ }
  }, [dark]);
  return { dark, setDark };
}

export function PmApp() {
  return <StoreProvider><Shell /></StoreProvider>;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden className="text-[#1f3d2b] dark:text-[#8fb89a]">
        {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="20" cy="9" rx="3.2" ry="8" fill="currentColor" opacity={i % 2 ? 0.55 : 0.95} transform={`rotate(${i * 30} 20 20)`} />)}
        <circle cx="20" cy="20" r="3.5" className="fill-card" />
      </svg>
      <div className="leading-none">
        <div className="font-display text-[1.6rem] font-semibold tracking-[0.12em] text-[#1f3d2b] dark:text-[#cfe3d3]">MERIDIAN</div>
        <div className="mt-0.5 text-[9px] font-medium tracking-[0.42em] text-gold">PROPERTY · DUBAI</div>
      </div>
    </div>
  );
}

function Shell() {
  const s = useStore();
  const { path, go } = useRoute();
  const { dark, setDark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenuOpen(false); setUserOpen(false); setBellOpen(false); }, [path]);

  const pay = path.match(/^\/pay\/(\d+)$/);
  if (pay) return <div className="flex min-h-screen flex-col bg-background text-foreground"><PayPage id={Number(pay[1])} /></div>;

  const role = s.me.role;
  const nav = role === "landlord" ? LANDLORD_NAV : role === "tenant" ? [{ href: "/", label: "My tenancy", icon: Home }]
    : STAFF_NAV.filter((n) => (n.adminOnly ? role === "admin" : !n.module || s.can(n.module)));
  const unread = s.inbox.filter((i) => !i.read).length;
  const initials = s.me.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  const page = (() => {
    const id = (re: RegExp) => { const m = path.match(re); return m ? Number(m[1]) : null; };
    if (role === "tenant") return <TenantHome tenantId={s.me.tenant_id!} />;
    if (role === "landlord") {
      const lid = s.me.landlord_id!;
      const pid = id(/^\/portal\/property\/(\d+)$/);
      if (pid && s.property(pid)?.landlord_id === lid) return <PropertyDetail id={pid} go={go} portal />;
      const lc = id(/^\/portal\/contracts\/(\d+)$/);
      if ((path === "/portal/contracts" || lc) && s.settings.landlord_access.contracts) return <LandlordContracts key={path} landlordId={lid} openId={lc ?? undefined} />;
      if (path === "/portal/payments" && s.settings.landlord_access.payments) return <LandlordPayments landlordId={lid} />;
      if (path === "/portal/documents" && s.settings.landlord_access.documents) return <LandlordDocuments landlordId={lid} />;
      return <Dashboard landlordId={lid} go={go} />;
    }
    const guard = (m: Module, el: ReactElement) => (s.can(m) ? el : <NoAccess />);
    let n: number | null;
    if ((n = id(/^\/properties\/(\d+)$/))) return guard("properties", s.visibleProperties.some((p) => p.id === n) ? <PropertyDetail id={n} go={go} /> : <NoAccess />);
    if ((n = id(/^\/landlords\/(\d+)$/))) return guard("landlords", <LandlordDetail id={n} go={go} />);
    if ((n = id(/^\/tenants\/(\d+)$/))) return guard("tenants", <TenantDetail id={n} go={go} />);
    if ((n = id(/^\/contracts\/(\d+)$/))) return guard("contracts", <ContractsPage key={path} openId={n} />);
    switch (path) {
      case "/properties": return guard("properties", <PropertiesPage go={go} />);
      case "/landlords": return guard("landlords", <LandlordsPage go={go} />);
      case "/tenants": return guard("tenants", <TenantsPage go={go} />);
      case "/contracts": return guard("contracts", <ContractsPage />);
      case "/ejari-dewa": return guard("ejari_dewa", <EjariDewaPage />);
      case "/payments": return guard("payments", <PaymentsPage />);
      case "/utilities": return guard("utilities", <UtilitiesPage />);
      case "/documents": return guard("documents", <DocumentsPage go={go} />);
      case "/communications": return guard("communications", <CommunicationsPage />);
      case "/users": return guard("users", <UsersPage />);
      case "/settings": return role === "admin" ? <SettingsPage /> : <NoAccess />;
      default: return <Dashboard go={go} />;
    }
  })();

  const isActive = (href: string) => (href === "/" ? path === "/" || path === "/dashboard" : path.startsWith(href));

  return (
    <div className="h-screen bg-background p-0 text-foreground md:p-4">
      <div className="pm-card flex h-full min-h-0 flex-col overflow-hidden bg-shell md:rounded-[2rem] md:border md:border-border/70">
        {/* Top bar: theme toggle · logo · user */}
        <header className="flex h-[72px] shrink-0 items-center gap-3 px-4 md:px-6">
          <button className="rounded-full p-2 hover:bg-muted lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden items-center gap-2 lg:flex lg:w-[196px]">
            <button onClick={() => setDark(false)} aria-label="Light theme" className={cn("flex h-10 w-10 items-center justify-center rounded-full transition", !dark ? "bg-[#f3e8d3] text-[#a9874f]" : "text-muted-foreground hover:bg-muted")}><Sun className="h-[18px] w-[18px]" /></button>
            <button onClick={() => setDark(true)} aria-label="Dark theme" className={cn("flex h-10 w-10 items-center justify-center rounded-full transition", dark ? "bg-primary text-primary-foreground" : "bg-[#1f3d2b] text-[#f4f1ea]")}><Moon className="h-[18px] w-[18px]" /></button>
          </div>
          <div className="flex flex-1 justify-center"><Logo /></div>
          <div className="relative">
            <button className="relative rounded-full p-2 hover:bg-muted" onClick={() => setBellOpen((o) => !o)} aria-label="Notifications">
              <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#b4532f] px-1 text-[10px] text-white">{unread}</span>}
            </button>
            {bellOpen && (
              <div className="pm-card absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-[1.5rem] border border-border/70 bg-card">
                <div className="flex items-center px-4 py-3 text-sm font-medium"><span className="flex-1">Notifications</span>
                  <button className="text-xs font-normal text-muted-foreground hover:underline" onClick={() => s.setInbox((i) => i.map((x) => ({ ...x, read: true })))}>Mark all read</button></div>
                <ul className="max-h-80 divide-y divide-border/70 overflow-auto">
                  {s.inbox.length === 0 && <li className="p-4 text-sm text-muted-foreground">No notifications.</li>}
                  {s.inbox.map((i) => <li key={i.id} className={cn("px-4 py-3 text-sm", !i.read && "bg-muted/50")}><div className="font-medium">{i.title}</div><div className="text-muted-foreground">{i.body}</div></li>)}
                </ul>
              </div>)}
          </div>
          <div className="relative" ref={userRef}>
            <button className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-muted" onClick={() => setUserOpen((o) => !o)}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f3d2b] text-sm font-medium text-[#f4f1ea] dark:bg-[#8fb89a] dark:text-[#14231a]">{initials}</span>
              <span className="hidden text-left leading-tight sm:block"><span className="block text-sm">{s.me.name}</span><span className="block text-xs text-muted-foreground">{s.me.email}</span></span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {userOpen && (
              <div className="pm-card absolute right-0 z-50 mt-2 w-72 rounded-[1.5rem] border border-border/70 bg-card p-2">
                <div className="px-3 py-2 text-xs text-muted-foreground">Signed in as {ROLE_LABEL[role]}. Preview another login:</div>
                <ul className="max-h-80 overflow-auto">{s.users.filter((u) => u.active).map((u) => (
                  <li key={u.id}><button onClick={() => { s.setCurrentUserId(u.id); go("/"); setUserOpen(false); }} className={cn("flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-sm hover:bg-muted", u.id === s.me.id && "bg-muted")}>
                    <span>{u.name}</span><span className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]}</span></button></li>))}
                </ul>
                <div className="mt-1 flex gap-1 border-t border-border/70 px-1 pt-2 lg:hidden">
                  <button onClick={() => setDark(false)} className="flex-1 rounded-full py-2 text-sm hover:bg-muted">Light</button>
                  <button onClick={() => setDark(true)} className="flex-1 rounded-full py-2 text-sm hover:bg-muted">Dark</button>
                </div>
              </div>)}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {menuOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} />}
          <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-shell px-3 pb-4 pt-4 transition-transform lg:static lg:w-[220px] lg:translate-x-0 lg:pt-2", menuOpen ? "translate-x-0" : "-translate-x-full")}>
            <div className="mb-3 flex items-center justify-between px-2 lg:hidden"><span className="text-sm font-medium">Menu</span><button onClick={() => setMenuOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {nav.map((n) => (
                <button key={n.href} onClick={() => go(n.href)}
                  className={cn("flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition-colors",
                    isActive(n.href) ? "bg-[#1f3d2b] text-[#f4f1ea] shadow-sm dark:bg-[#8fb89a] dark:text-[#14231a]" : "text-foreground/80 hover:bg-muted")}>
                  <n.icon className="h-[18px] w-[18px]" />{n.label}
                </button>))}
            </nav>
            <button onClick={() => s.notify("Support", "Our team will get back to you shortly.")} className="mt-3 flex items-center justify-between rounded-full border border-border bg-card px-4 py-2 text-xs">
              <span className="flex items-center gap-2"><Headphones className="h-3.5 w-3.5" />Get in touch</span><span aria-hidden>›</span>
            </button>
          </aside>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col"><NavContext.Provider value={go}>{page}</NavContext.Provider></main>
        </div>
      </div>

      {/* In-app pop-ups */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {s.toasts.map((t) => <div key={t.id} className="pm-card pointer-events-auto rounded-[1.25rem] border border-border/70 bg-card p-3 text-sm"><div className="font-medium">{t.title}</div><div className="text-muted-foreground">{t.body}</div></div>)}
      </div>
    </div>
  );
}

function NoAccess() {
  return <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">Your role does not have access to this section.</div>;
}
