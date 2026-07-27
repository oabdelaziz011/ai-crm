export type CustomerProfileTab =
  | "overview"
  | "timeline"
  | "bookings"
  | "invoices"
  | "payments"
  | "communication"
  | "notes"
  | "files"
  | "ai-summary"
  | "history";

/** @deprecated Use `ai-summary` */
export type LegacyCustomerProfileTab = "ai-insights" | "system";

export type CustomerProfileContext = {
  conversationId?: string | null;
  conversationNumber?: string | null;
  companyId?: string | null;
};

export type CustomerProfileQuickAction =
  | "call"
  | "whatsapp"
  | "new-booking"
  | "new-invoice"
  | "add-note";

export type CustomerProfileOpenParams = {
  customerId: string;
  tab?: CustomerProfileTab | LegacyCustomerProfileTab;
  context?: CustomerProfileContext;
};

export const CUSTOMER_PROFILE_TABS: CustomerProfileTab[] = [
  "overview",
  "timeline",
  "bookings",
  "invoices",
  "payments",
  "communication",
  "notes",
  "files",
  "ai-summary",
  "history",
];

export { normalizeWorkspaceRouteTab as normalizeCustomerProfileTab } from "@/lib/customer-workspace/workspace-navigation";

export type CustomerProfileDrawerProps = {
  open: boolean;
  onClose: () => void;
  customerId: string | null | undefined;
  defaultTab?: CustomerProfileTab;
  context?: CustomerProfileContext;
  onQuickAction?: (
    action: CustomerProfileQuickAction,
    customerId: string,
  ) => void;
  isQuickActionPending?: (action: CustomerProfileQuickAction) => boolean;
};
