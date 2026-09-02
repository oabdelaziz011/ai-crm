/**
 * Customer Workspace commercial + RBAC access (Phase 6 pattern).
 * Uses existing billing SoT — does not invent feature codes.
 */
import { composeEffectiveFeatureAccess } from "@/lib/billing/company-feature-access";
import type { CustomerProfileTab } from "@/components/customer-profile/types";
import type { WorkspaceTopTab } from "./workspace-navigation";
import {
  profileTabToWorkspaceTopTab,
  workspaceTopTabToProfileTab,
  WORKSPACE_TOP_TABS,
} from "./workspace-navigation";

export type CustomerWorkspaceAccessContext = {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  isModuleEnabled: (featureCode: string) => boolean | undefined;
  entitlementResolved: boolean;
};

export type WorkspaceTabAccessRule = {
  tab: WorkspaceTopTab;
  permissionsAny: readonly string[];
  /** Commercial feature codes — all must be enabled when present. */
  requiredModules?: readonly string[];
  /** When true, tab is RBAC-only (no commercial module gate). */
  rbacOnly?: boolean;
};

/** Per-tab gates aligned with feature_definitions + feature_definition_permissions. */
export const WORKSPACE_TAB_ACCESS_RULES: readonly WorkspaceTabAccessRule[] = [
  { tab: "overview", permissionsAny: ["customers.view"] },
  { tab: "activity", permissionsAny: ["customers.view"] },
  {
    tab: "bookings",
    permissionsAny: ["bookings.view"],
    requiredModules: ["bookings"],
  },
  {
    tab: "invoices",
    permissionsAny: ["invoices.view"],
    requiredModules: ["finance"],
  },
  { tab: "communication", permissionsAny: ["customers.view"] },
  {
    tab: "tickets",
    permissionsAny: ["tickets.view"],
    requiredModules: ["ticketing"],
  },
  {
    tab: "payments",
    permissionsAny: ["invoices.view"],
    requiredModules: ["finance"],
  },
  {
    tab: "files",
    permissionsAny: ["entity.files.read", "customers.view"],
    requiredModules: ["operations"],
  },
  {
    tab: "ai",
    permissionsAny: ["ai_assistant.view", "customers.view"],
    requiredModules: ["ai_assistant"],
  },
  {
    tab: "campaigns",
    permissionsAny: ["campaigns.view"],
    requiredModules: ["campaigns"],
  },
  { tab: "history", permissionsAny: ["audit_logs.view", "customers.view"] },
] as const;

/** Activity source → entitlement + RBAC (must match registered aggregators). */
export const ACTIVITY_SOURCE_ACCESS_RULES: Record<
  string,
  { permissionsAny: readonly string[]; requiredModules?: readonly string[]; rbacOnly?: boolean }
> = {
  "customer-lifecycle": { permissionsAny: ["customers.view"] },
  lifecycle: { permissionsAny: ["customers.view"] },
  whatsapp: {
    permissionsAny: ["whatsapp.view", "channels.view"],
    requiredModules: ["whatsapp_channel"],
  },
  bookings: {
    permissionsAny: ["bookings.view"],
    requiredModules: ["bookings"],
  },
  invoices: {
    permissionsAny: ["invoices.view"],
    requiredModules: ["finance"],
  },
  "agent-activity": {
    permissionsAny: ["whatsapp.view", "channels.view"],
    requiredModules: ["whatsapp_channel"],
  },
  agent: {
    permissionsAny: ["whatsapp.view", "channels.view"],
    requiredModules: ["whatsapp_channel"],
  },
  automation: {
    permissionsAny: ["customers.view"],
    requiredModules: ["workflow_automation"],
  },
  tickets: {
    permissionsAny: ["tickets.view"],
    requiredModules: ["ticketing"],
  },
};

export type CustomerWorkspaceQuickAction =
  | "new-booking"
  | "new-invoice"
  | "whatsapp"
  | "call"
  | "add-note";

const QUICK_ACTION_RULES: Record<
  CustomerWorkspaceQuickAction,
  { permissionsAny: readonly string[]; requiredModules?: readonly string[] }
> = {
  "new-booking": {
    permissionsAny: ["bookings.create", "bookings.view"],
    requiredModules: ["bookings"],
  },
  "new-invoice": {
    permissionsAny: ["invoices.create", "invoices.view"],
    requiredModules: ["finance"],
  },
  whatsapp: {
    permissionsAny: ["whatsapp.view", "channels.view"],
    requiredModules: ["whatsapp_channel"],
  },
  call: { permissionsAny: ["customers.view"] },
  "add-note": { permissionsAny: ["customers.edit", "customers.view"] },
};

function ruleForTab(tab: WorkspaceTopTab): WorkspaceTabAccessRule | undefined {
  return WORKSPACE_TAB_ACCESS_RULES.find((r) => r.tab === tab);
}

function hasAnyPermission(
  ctx: CustomerWorkspaceAccessContext,
  codes: readonly string[],
): boolean {
  return codes.some((code) => ctx.hasPermission(code));
}

function modulesEntitled(
  ctx: CustomerWorkspaceAccessContext,
  modules: readonly string[] | undefined,
  rbacOnly?: boolean,
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (rbacOnly || !modules?.length) return true;
  if (!ctx.entitlementResolved) return false;
  return modules.every((code) => ctx.isModuleEnabled(code) === true);
}

export function isWorkspaceFeatureAllowed(
  ctx: CustomerWorkspaceAccessContext,
  input: {
    permissionsAny: readonly string[];
    requiredModules?: readonly string[];
    rbacOnly?: boolean;
  },
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (!hasAnyPermission(ctx, input.permissionsAny)) return false;
  return modulesEntitled(ctx, input.requiredModules, input.rbacOnly);
}

export function isWorkspaceTabAccessible(
  tab: WorkspaceTopTab,
  ctx: CustomerWorkspaceAccessContext,
): boolean {
  const rule = ruleForTab(tab);
  if (!rule) return false;
  return isWorkspaceFeatureAllowed(ctx, rule);
}

export function isProfileTabAccessible(
  tab: CustomerProfileTab,
  ctx: CustomerWorkspaceAccessContext,
): boolean {
  const top = profileTabToWorkspaceTopTab(tab);
  return isWorkspaceTabAccessible(top, ctx);
}

export function filterAccessibleWorkspaceTabs(
  ctx: CustomerWorkspaceAccessContext,
): WorkspaceTopTab[] {
  if (!ctx.entitlementResolved && !ctx.isSuperAdmin) return [];
  return WORKSPACE_TOP_TABS.filter((tab) => isWorkspaceTabAccessible(tab, ctx));
}

export function resolveAccessibleProfileTab(
  requested: CustomerProfileTab | undefined,
  ctx: CustomerWorkspaceAccessContext,
): CustomerProfileTab {
  const accessible = filterAccessibleWorkspaceTabs(ctx);
  if (accessible.length === 0) return "overview";

  const normalized = requested ?? "overview";
  if (isProfileTabAccessible(normalized, ctx)) {
    return normalized;
  }

  const overviewTop = accessible.find((t) => t === "overview");
  if (overviewTop) return workspaceTopTabToProfileTab(overviewTop);
  return workspaceTopTabToProfileTab(accessible[0]!);
}

export function isActivitySourceAccessible(
  sourceId: string,
  ctx: CustomerWorkspaceAccessContext,
): boolean {
  const rule = ACTIVITY_SOURCE_ACCESS_RULES[sourceId];
  if (!rule) return isWorkspaceFeatureAllowed(ctx, { permissionsAny: ["customers.view"] });
  return isWorkspaceFeatureAllowed(ctx, rule);
}

export function isQuickActionAllowed(
  action: CustomerWorkspaceQuickAction,
  ctx: CustomerWorkspaceAccessContext,
): boolean {
  const rule = QUICK_ACTION_RULES[action];
  return isWorkspaceFeatureAllowed(ctx, rule);
}

/** History audit entities gated by module entitlement (+ RBAC where noted). */
export type CustomerAuditModuleAccess = {
  bookings: boolean;
  finance: boolean;
  ticketing: boolean;
  campaigns: boolean;
  workflowAutomation: boolean;
};

export function buildCustomerAuditModuleAccess(
  ctx: CustomerWorkspaceAccessContext,
): CustomerAuditModuleAccess {
  return {
    bookings: isWorkspaceFeatureAllowed(ctx, {
      permissionsAny: ["bookings.view"],
      requiredModules: ["bookings"],
    }),
    finance: isWorkspaceFeatureAllowed(ctx, {
      permissionsAny: ["invoices.view"],
      requiredModules: ["finance"],
    }),
    ticketing: isWorkspaceFeatureAllowed(ctx, {
      permissionsAny: ["tickets.view"],
      requiredModules: ["ticketing"],
    }),
    campaigns: isWorkspaceFeatureAllowed(ctx, {
      permissionsAny: ["campaigns.view"],
      requiredModules: ["campaigns"],
    }),
    workflowAutomation: isWorkspaceFeatureAllowed(ctx, {
      permissionsAny: ["customers.view"],
      requiredModules: ["workflow_automation"],
    }),
  };
}

export function auditEntityAllowedByModuleAccess(
  entity: string,
  moduleAccess: CustomerAuditModuleAccess,
): boolean {
  if (
    entity === "customers" ||
    entity === "customer_notes" ||
    entity === "entity_activities"
  ) {
    return true;
  }
  if (entity === "scheduling_bookings" || entity === "bookings") {
    return moduleAccess.bookings;
  }
  if (entity === "invoices" || entity === "payments") {
    return moduleAccess.finance;
  }
  if (entity === "support_tickets" || entity === "support_ticket_comments") {
    return moduleAccess.ticketing;
  }
  if (entity === "marketing_campaigns" || entity === "marketing_campaign_recipients") {
    return moduleAccess.campaigns;
  }
  if (entity === "automation_executions" || entity === "workflows") {
    return moduleAccess.workflowAutomation;
  }
  return false;
}

export function composeWorkspaceEffectiveAccess(input: {
  isSuperAdmin?: boolean;
  hasRbacPermission: boolean;
  companyFeatureEnabled: boolean | undefined;
  entitlementResolved?: boolean;
}): boolean {
  return composeEffectiveFeatureAccess({
    isSuperAdmin: input.isSuperAdmin,
    hasRbacPermission: input.hasRbacPermission,
    companyFeatureEnabled: input.companyFeatureEnabled === true,
    entitlementResolved: input.entitlementResolved !== false,
  });
}
