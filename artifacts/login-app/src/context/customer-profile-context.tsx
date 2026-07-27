import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import type {
  CustomerProfileContext,
  CustomerProfileOpenParams,
  CustomerProfileQuickAction,
  CustomerProfileTab,
  LegacyCustomerProfileTab,
} from "@/components/customer-profile/types";
import { normalizeCustomerProfileTab } from "@/components/customer-profile/types";
import { customerWorkspaceDashboardHref } from "@/lib/customer-workspace/customer-workspace-utils";

type CustomerProfileContextValue = {
  openCustomerProfile: (params: CustomerProfileOpenParams) => void;
  closeCustomerProfile: () => void;
  isOpen: boolean;
  customerId: string | null;
};

const CustomerProfileContextInstance = createContext<CustomerProfileContextValue | null>(null);

function resolveTab(tab?: CustomerProfileTab | LegacyCustomerProfileTab): CustomerProfileTab {
  return normalizeCustomerProfileTab(tab);
}

const CONTEXT_KEY_PREFIX = "valueor.customer-workspace.context:";

export function readCustomerWorkspaceContext(customerId: string): CustomerProfileContext | undefined {
  try {
    const raw = sessionStorage.getItem(`${CONTEXT_KEY_PREFIX}${customerId}`);
    return raw ? (JSON.parse(raw) as CustomerProfileContext) : undefined;
  } catch {
    return undefined;
  }
}

export function CustomerProfileProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();

  const workspaceMatch = location.match(/^\/customers\/([^/]+)(?:\/([^/]+))?/);
  const customerId = workspaceMatch?.[1] ?? null;
  const isOpen = Boolean(customerId);

  const openCustomerProfile = useCallback(
    (params: CustomerProfileOpenParams) => {
      const tab = resolveTab(params.tab);
      if (params.context) {
        try {
          sessionStorage.setItem(
            `${CONTEXT_KEY_PREFIX}${params.customerId}`,
            JSON.stringify(params.context),
          );
        } catch {
          /* ignore */
        }
      }
      setLocation(customerWorkspaceDashboardHref(params.customerId, tab));
    },
    [setLocation],
  );

  const closeCustomerProfile = useCallback(() => {
    setLocation("/customers");
  }, [setLocation]);

  const value = useMemo(
    () => ({
      openCustomerProfile,
      closeCustomerProfile,
      isOpen,
      customerId,
    }),
    [closeCustomerProfile, customerId, isOpen, openCustomerProfile],
  );

  return (
    <CustomerProfileContextInstance.Provider value={value}>
      {children}
    </CustomerProfileContextInstance.Provider>
  );
}

export function useCustomerProfile() {
  const ctx = useContext(CustomerProfileContextInstance);
  if (!ctx) {
    throw new Error("useCustomerProfile must be used within CustomerProfileProvider");
  }
  return ctx;
}

export type { CustomerProfileQuickAction, CustomerProfileContext };
