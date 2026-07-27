import type { CustomerProfileTab } from "@/components/customer-profile/types";

export type WorkspacePrimaryTab =
  | "overview"
  | "activity"
  | "commerce"
  | "communication"
  | "files"
  | "ai"
  | "history";

export type CommerceSubTab = "bookings" | "invoices" | "payments";

export const WORKSPACE_PRIMARY_TABS: WorkspacePrimaryTab[] = [
  "overview",
  "activity",
  "commerce",
  "communication",
  "files",
  "ai",
  "history",
];

export const COMMERCE_SUB_TABS: CommerceSubTab[] = ["bookings", "invoices", "payments"];

/** Map URL segment → internal tab id (backward compatible). */
export function normalizeWorkspaceRouteTab(tab: string | undefined): CustomerProfileTab {
  if (!tab || tab === "overview") return "overview";
  if (tab === "activity") return "timeline";
  if (tab === "commerce") return "bookings";
  if (tab === "ai") return "ai-summary";
  const legacy = tab as CustomerProfileTab;
  const allowed: CustomerProfileTab[] = [
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
  if (allowed.includes(legacy)) return legacy;
  if (tab === "ai-insights") return "ai-summary";
  if (tab === "system") return "history";
  if (tab === "notes") return "communication";
  return "overview";
}

/** Preferred URL segment for a tab (grouped navigation). */
export function workspaceRouteSegment(tab: CustomerProfileTab): string {
  switch (tab) {
    case "timeline":
    case "notes":
      return "activity";
    case "bookings":
    case "invoices":
    case "payments":
      return tab;
    case "ai-summary":
      return "ai";
    default:
      return tab;
  }
}

export function resolveWorkspaceNavigation(tab: CustomerProfileTab): {
  primary: WorkspacePrimaryTab;
  commerce?: CommerceSubTab;
} {
  switch (tab) {
    case "timeline":
    case "notes":
      return { primary: "activity" };
    case "bookings":
      return { primary: "commerce", commerce: "bookings" };
    case "invoices":
      return { primary: "commerce", commerce: "invoices" };
    case "payments":
      return { primary: "commerce", commerce: "payments" };
    case "communication":
      return { primary: "communication" };
    case "files":
      return { primary: "files" };
    case "ai-summary":
      return { primary: "ai" };
    case "history":
      return { primary: "history" };
    default:
      return { primary: "overview" };
  }
}

export function isCommerceTab(tab: CustomerProfileTab): tab is CommerceSubTab {
  return tab === "bookings" || tab === "invoices" || tab === "payments";
}
