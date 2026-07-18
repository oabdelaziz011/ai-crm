import { createContext, useContext, type ReactNode } from "react";
import { useBillingHealth } from "@/hooks/billing/use-billing-health";
import type { BillingHealthResult } from "@/lib/billing/billing-health";
import { useAuth } from "@/context/auth-context";

type BillingHealthContextValue = {
  health: BillingHealthResult | undefined;
  isLoading: boolean;
  error: Error | null;
  mutationsAllowed: boolean;
};

const BillingHealthContext = createContext<BillingHealthContextValue | null>(null);

export function BillingHealthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: health, isLoading, error } = useBillingHealth(Boolean(user));

  const value: BillingHealthContextValue = {
    health,
    isLoading,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
    mutationsAllowed: Boolean(health?.healthy),
  };

  return <BillingHealthContext.Provider value={value}>{children}</BillingHealthContext.Provider>;
}

export function useBillingHealthContext() {
  const ctx = useContext(BillingHealthContext);
  if (!ctx) {
    throw new Error("useBillingHealthContext must be used within BillingHealthProvider");
  }
  return ctx;
}
