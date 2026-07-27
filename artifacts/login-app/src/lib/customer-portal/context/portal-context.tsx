import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PortalPublicProfile } from "@/lib/customer-portal/types";
import { getPortalSession, type StoredPortalSession } from "@/lib/customer-portal/security/portal-session-store";

type PortalContextValue = {
  profile: PortalPublicProfile | null;
  session: StoredPortalSession | null;
  slug: string;
};

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({
  slug,
  profile,
  children,
}: {
  slug: string;
  profile: PortalPublicProfile | null;
  children: ReactNode;
}) {
  const session = useMemo(() => getPortalSession(), []);
  const value = useMemo(() => ({ slug, profile, session }), [slug, profile, session]);
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortalContext(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortalContext requires PortalProvider");
  return ctx;
}
