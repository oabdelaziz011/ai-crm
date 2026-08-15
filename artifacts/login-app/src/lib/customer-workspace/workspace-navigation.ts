import type { CustomerProfileTab } from "@/components/customer-profile/types";

export type WorkspacePrimaryTab =
  | "overview"
  | "activity"
  | "bookings"
  | "invoices"
  | "tickets"
  | "communication";

export type WorkspaceMoreTab = "payments" | "files" | "ai" | "history";

/** @deprecated Commerce grouping removed. */
export type CommerceSubTab = "bookings" | "invoices" | "payments";

/** Visible top-level tabs (kept short on purpose). */
export const WORKSPACE_PRIMARY_TABS: WorkspacePrimaryTab[] = [
  "overview",
  "activity",
  "bookings",
  "invoices",
  "tickets",
  "communication",
];

/** Secondary destinations under «More». */
export const WORKSPACE_MORE_TABS: WorkspaceMoreTab[] = [
  "payments",
  "files",
  "ai",
  "history",
];

/** @deprecated */
export const COMMERCE_SUB_TABS: CommerceSubTab[] = ["bookings", "invoices", "payments"];

export function normalizeWorkspaceRouteTab(tab: string | undefined): CustomerProfileTab {
  if (!tab || tab === "overview") return "overview";
  if (tab === "activity") return "timeline";
  if (tab === "commerce") return "bookings";
  if (tab === "ai") return "ai-summary";
  const legacy = tab as CustomerProfileTab;
  const allowed: CustomerProfileTab[] = [
    "overview",
    "timeline",
    "tickets",
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

export function workspaceRouteSegment(tab: CustomerProfileTab): string {
  switch (tab) {
    case "timeline":
    case "notes":
      return "activity";
    case "bookings":
    case "invoices":
    case "payments":
    case "tickets":
      return tab;
    case "ai-summary":
      return "ai";
    default:
      return tab;
  }
}

export function resolveWorkspaceNavigation(tab: CustomerProfileTab): {
  primary: WorkspacePrimaryTab | "more";
  more?: WorkspaceMoreTab;
  commerce?: CommerceSubTab;
} {
  switch (tab) {
    case "timeline":
    case "notes":
      return { primary: "activity" };
    case "bookings":
      return { primary: "bookings", commerce: "bookings" };
    case "invoices":
      return { primary: "invoices", commerce: "invoices" };
    case "tickets":
      return { primary: "tickets" };
    case "communication":
      return { primary: "communication" };
    case "payments":
      return { primary: "more", more: "payments", commerce: "payments" };
    case "files":
      return { primary: "more", more: "files" };
    case "ai-summary":
      return { primary: "more", more: "ai" };
    case "history":
      return { primary: "more", more: "history" };
    default:
      return { primary: "overview" };
  }
}

export function isCommerceTab(tab: CustomerProfileTab): tab is CommerceSubTab {
  return tab === "bookings" || tab === "invoices" || tab === "payments";
}

export function moreTabToProfileTab(tab: WorkspaceMoreTab): CustomerProfileTab {
  if (tab === "ai") return "ai-summary";
  return tab;
}
