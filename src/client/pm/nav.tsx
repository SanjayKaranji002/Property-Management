import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "./store";

/** App-wide navigation, so any component can link without prop drilling. */
export const NavContext = createContext<(to: string) => void>(() => {});
export const useGo = () => useContext(NavContext);

/**
 * Where each record lives for the signed-in role, or null when that role
 * may not open it (then the name renders as plain text).
 */
export function useHref() {
  const s = useStore();
  const role = s.me.role;
  const staff = role === "admin" || role === "manager" || role === "broker" || role === "finance";
  const ownProperty = (id: number) => s.property(id)?.landlord_id === s.me.landlord_id;
  const myTenancy = (contractId: number) => s.contract(contractId)?.tenant_id === s.me.tenant_id;
  return {
    property: (id: number | null | undefined): string | null => {
      if (!id) return null;
      if (staff) return s.can("properties") && s.visibleProperties.some((p) => p.id === id) ? `/properties/${id}` : null;
      if (role === "landlord") return ownProperty(id) ? `/portal/property/${id}` : null;
      if (role === "tenant") return s.contracts.some((c) => c.property_id === id && c.tenant_id === s.me.tenant_id) ? "/" : null;
      return null;
    },
    tenant: (id: number | null | undefined): string | null => (id && staff && s.can("tenants") ? `/tenants/${id}` : null),
    landlord: (id: number | null | undefined): string | null => (id && staff && s.can("landlords") ? `/landlords/${id}` : null),
    contract: (id: number | null | undefined): string | null => {
      if (!id) return null;
      if (staff) return s.can("contracts") ? `/contracts/${id}` : null;
      if (role === "landlord") return ownProperty(s.contract(id)?.property_id ?? 0) && s.settings.landlord_access.contracts ? `/portal/contracts/${id}` : null;
      if (role === "tenant") return myTenancy(id) ? "/" : null;
      return null;
    },
    payments: (): string | null => (staff ? (s.can("payments") ? "/payments" : null) : role === "landlord" && s.settings.landlord_access.payments ? "/portal/payments" : role === "tenant" ? "/" : null),
    page: (path: string, module?: Parameters<typeof s.can>[0]): string | null => (!module || s.can(module) ? path : null),
  };
}

/** Text that navigates when the role may open its target, plain text otherwise. */
export function L({ to, children, className }: { to: string | null; children: ReactNode; className?: string }) {
  const go = useGo();
  if (!to) return <span className={className}>{children}</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); go(to); }}
      className={cn("text-left underline-offset-2 hover:text-[#1f3d2b] hover:underline dark:hover:text-[#cfe3d3]", className)}>
      {children}
    </button>
  );
}

/** Makes a whole card/row clickable (keyboard too) when `to` is set. */
export function clickable(go: (to: string) => void, to: string | null) {
  if (!to) return {};
  return {
    role: "link" as const, tabIndex: 0,
    onClick: () => go(to),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") go(to); },
    className: "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  };
}
