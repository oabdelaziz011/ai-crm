/**
 * Customer workspace top-level tab navigation (no More menu).
 * Campaigns and History remain separate routes/components.
 * History is always last; Campaigns immediately before History.
 */
import type { CustomerProfileTab } from "@/components/customer-profile/types";

/** First-class workspace tabs in display order. */
export type WorkspaceTopTab =
  | "overview"
  | "activity"
  | "bookings"
  | "invoices"
  | "communication"
  | "tickets"
  | "payments"
  | "files"
  | "ai"
  | "campaigns"
  | "history";

/** @deprecated Prefer WorkspaceTopTab — kept for compatibility during transition. */
export type WorkspacePrimaryTab = WorkspaceTopTab;

/** @deprecated More menu removed — kept as empty alias for old imports. */
export type WorkspaceMoreTab = never;

/** @deprecated Commerce grouping removed. */
export type CommerceSubTab = "bookings" | "invoices" | "payments";

export const WORKSPACE_TOP_TABS: WorkspaceTopTab[] = [
  "overview",
  "activity",
  "bookings",
  "invoices",
  "communication",
  "tickets",
  "payments",
  "files",
  "ai",
  "campaigns",
  "history",
];

/** @deprecated Use WORKSPACE_TOP_TABS. */
export const WORKSPACE_PRIMARY_TABS: WorkspaceTopTab[] = WORKSPACE_TOP_TABS;

/** @deprecated More menu removed. */
export const WORKSPACE_MORE_TABS: WorkspaceMoreTab[] = [];

/** @deprecated */
export const COMMERCE_SUB_TABS: CommerceSubTab[] = ["bookings", "invoices", "payments"];

export function workspaceTopTabToProfileTab(tab: WorkspaceTopTab): CustomerProfileTab {
  switch (tab) {
    case "activity":
      return "timeline";
    case "ai":
      return "ai-summary";
    default:
      return tab;
  }
}

export function profileTabToWorkspaceTopTab(tab: CustomerProfileTab): WorkspaceTopTab {
  switch (tab) {
    case "timeline":
    case "notes":
      return "activity";
    case "ai-summary":
      return "ai";
    case "overview":
    case "bookings":
    case "invoices":
    case "communication":
    case "tickets":
    case "payments":
    case "files":
    case "campaigns":
    case "history":
      return tab;
    default:
      return "overview";
  }
}

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
    "campaigns",
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
  primary: WorkspaceTopTab;
  /** @deprecated More menu removed */
  more?: never;
  commerce?: CommerceSubTab;
} {
  const primary = profileTabToWorkspaceTopTab(tab);
  if (primary === "bookings" || primary === "invoices" || primary === "payments") {
    return { primary, commerce: primary };
  }
  return { primary };
}

export function isCommerceTab(tab: CustomerProfileTab): tab is CommerceSubTab {
  return tab === "bookings" || tab === "invoices" || tab === "payments";
}

/** @deprecated More menu removed — identity for old callers. */
export function moreTabToProfileTab(tab: WorkspaceTopTab): CustomerProfileTab {
  return workspaceTopTabToProfileTab(tab);
}

export function assertWorkspaceTabOrderContract(): {
  count: number;
  historyLast: boolean;
  campaignsBeforeHistory: boolean;
  hasMore: boolean;
} {
  const tabs = WORKSPACE_TOP_TABS;
  const historyIdx = tabs.indexOf("history");
  const campaignsIdx = tabs.indexOf("campaigns");
  return {
    count: tabs.length,
    historyLast: historyIdx === tabs.length - 1,
    campaignsBeforeHistory: campaignsIdx === historyIdx - 1,
    hasMore: false,
  };
}
