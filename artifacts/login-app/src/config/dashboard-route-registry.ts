import type { ComponentType, ElementType, LazyExoticComponent } from "react";
import { lazy } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  CalendarDays,
  CalendarRange,
  CreditCard,
  FileText,
  LayoutGrid,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Inbox,
  Radio,
  Send,
  Coins,
  Activity,
  Gauge,
  GitBranch,
  Plug,
  Store,
  UserCog,
  Users,
  FlaskConical,
  Workflow,
  ScrollText,
} from "lucide-react";
import type { PlatformAIFeatureKey } from "@workspace/platform-ai-provider";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";

export const DASHBOARD_BASE_PATH = "/dashboard";

export type DashboardSectionId =
  | "team-inbox"
  | "channels"
  | "ai-usage"
  | "ai-analytics"
  | "ai-runtime"
  | "customers"
  | "bookings"
  | "calendar"
  | "scheduling"
  | "communication"
  | "invoices"
  | "financial"
  | "executive"
  | "organization"
  | "integrations"
  | "marketplace"
  | "companies"
  | "workspace"
  | "subscriptions"
  | "audit-logs"
  | "users"
  | "roles"
  | "whatsapp"
  | "ai-assistant"
  | "ai-chat"
  | "knowledge"
  | "prompts"
  | "automation"
  | "reports"
  | "settings"
  | "demo-scenarios"
  | "platform-ai-operations";

export type DashboardSidebarGroupId = "user-management" | "ai-platform";

export type DashboardRouteDefinition = {
  id: DashboardSectionId;
  /** Absolute application path */
  path: `${typeof DASHBOARD_BASE_PATH}/${string}`;
  /** Path segment relative to the nested /dashboard router */
  nestedPath: `/${string}`;
  titleKey: string;
  icon: ElementType;
  permission?: string;
  superAdminOnly?: boolean;
  sidebarGroup?: DashboardSidebarGroupId;
  /** When set, route and sidebar require the Platform AI feature flag (in addition to RBAC). */
  platformFeatureKey?: PlatformAIFeatureKey;
  Page: LazyExoticComponent<ComponentType>;
};

export type DashboardSidebarGroupDefinition = {
  id: DashboardSidebarGroupId;
  titleKey: string;
  icon: ElementType;
  childIds: readonly DashboardSectionId[];
};

export const DASHBOARD_SIDEBAR_GROUPS: readonly DashboardSidebarGroupDefinition[] = [
  {
    id: "ai-platform",
    titleKey: "navigation.aiPlatform",
    icon: Sparkles,
    childIds: ["team-inbox", "channels", "ai-assistant", "ai-chat", "knowledge", "prompts", "automation", "ai-usage", "ai-analytics", "ai-runtime"],
  },
  {
    id: "user-management",
    titleKey: "navigation.userManagement",
    icon: UserCog,
    childIds: ["users", "roles"],
  },
] as const;

const lazyPage = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName],
    })),
  );

export const DASHBOARD_ROUTE_REGISTRY: readonly DashboardRouteDefinition[] = [
  {
    id: "team-inbox",
    path: "/dashboard/inbox",
    nestedPath: "/inbox",
    titleKey: "navigation.teamInbox",
    icon: Inbox,
    permission: "ai.conversations.view",
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/conversations/team-inbox-page")),
  },
  {
    id: "channels",
    path: "/dashboard/channels",
    nestedPath: "/channels",
    titleKey: "navigation.channels",
    icon: Radio,
    permission: "channels.view",
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/channels/channels-page")),
  },
  {
    id: "ai-usage",
    path: "/dashboard/ai-usage",
    nestedPath: "/ai-usage",
    titleKey: "navigation.aiUsage",
    icon: Coins,
    permission: "ai.costs.view",
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/ai/ai-usage-page")),
  },
  {
    id: "ai-analytics",
    path: "/dashboard/ai-analytics",
    nestedPath: "/ai-analytics",
    titleKey: "navigation.aiAnalytics",
    icon: Activity,
    permission: "ai.analytics.view",
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/ai/ai-analytics-page")),
  },
  {
    id: "ai-runtime",
    path: "/dashboard/ai-runtime",
    nestedPath: "/ai-runtime",
    titleKey: "navigation.aiRuntime",
    icon: Gauge,
    permission: "ai.execution.view",
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/ai-runtime-monitor-page")),
  },
  {
    id: "customers",
    path: "/dashboard/customers",
    nestedPath: "/customers",
    titleKey: "navigation.customers",
    icon: Users,
    permission: "customers.view",
    Page: lazyPage(() => import("@/pages/dashboard/customers/customers-layout")),
  },
  {
    id: "bookings",
    path: "/dashboard/bookings",
    nestedPath: "/bookings",
    titleKey: "navigation.bookings",
    icon: CalendarDays,
    permission: "bookings.view",
    Page: lazyPage(() => import("@/pages/dashboard/bookings-page")),
  },
  {
    id: "calendar",
    path: "/dashboard/calendar",
    nestedPath: "/calendar",
    titleKey: "navigation.calendar",
    icon: Calendar,
    permission: "bookings.view",
    Page: lazyNamed(() => import("@/pages/dashboard/calendar/calendar-page"), "CalendarPage"),
  },
  {
    id: "scheduling",
    path: "/dashboard/scheduling",
    nestedPath: "/scheduling",
    titleKey: "navigation.scheduling",
    icon: CalendarRange,
    permission: "bookings.view",
    Page: lazyNamed(() => import("@/pages/dashboard/scheduling/scheduling-page"), "SchedulingPage"),
  },
  {
    id: "communication",
    path: "/dashboard/communication",
    nestedPath: "/communication",
    titleKey: "navigation.communication",
    icon: Send,
    Page: lazyNamed(
      () => import("@/pages/dashboard/communication/communication-center-page"),
      "CommunicationCenterPage",
    ),
  },
  {
    id: "invoices",
    path: "/dashboard/invoices",
    nestedPath: "/invoices",
    titleKey: "navigation.invoices",
    icon: FileText,
    permission: "invoices.view",
    Page: lazyPage(() => import("@/pages/dashboard/invoices-page")),
  },
  {
    id: "financial",
    path: "/dashboard/financial",
    nestedPath: "/financial",
    titleKey: "navigation.financial",
    icon: Coins,
    permission: "invoices.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/financial/financial-billing-dashboard-page"),
      "FinancialBillingDashboardPage",
    ),
  },
  {
    id: "executive",
    path: "/dashboard/executive",
    nestedPath: "/executive",
    titleKey: "navigation.executive",
    icon: BarChart3,
    permission: "executive.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/executive/executive-dashboard-page"),
      "ExecutiveDashboardPage",
    ),
  },
  {
    id: "organization",
    path: "/dashboard/organization",
    nestedPath: "/organization",
    titleKey: "navigation.organization",
    icon: GitBranch,
    permission: "organization.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/organization/organization-dashboard-page"),
      "OrganizationDashboardPage",
    ),
  },
  {
    id: "integrations",
    path: "/dashboard/integrations",
    nestedPath: "/integrations",
    titleKey: "navigation.integrations",
    icon: Plug,
    permission: "integrations.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/integrations/integrations-dashboard-page"),
      "IntegrationsDashboardPage",
    ),
  },
  {
    id: "marketplace",
    path: "/dashboard/marketplace",
    nestedPath: "/marketplace",
    titleKey: "navigation.marketplace",
    icon: Store,
    permission: "marketplace.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/marketplace/marketplace-dashboard-page"),
      "MarketplaceDashboardPage",
    ),
  },
  {
    id: "companies",
    path: "/dashboard/companies",
    nestedPath: "/companies",
    titleKey: "navigation.companies",
    icon: Building2,
    permission: "companies.view",
    Page: lazyNamed(() => import("@/pages/companies"), "CompaniesPage"),
  },
  {
    id: "platform-ai-operations",
    path: "/dashboard/platform/ai-operations",
    nestedPath: "/platform/ai-operations",
    titleKey: "navigation.platformAiOperations",
    icon: Gauge,
    superAdminOnly: true,
    Page: lazyNamed(
      () => import("@/pages/dashboard/platform/platform-ai-operations-page"),
      "PlatformAiOperationsPage",
    ),
  },
  {
    id: "demo-scenarios",
    path: "/dashboard/demo-scenarios",
    nestedPath: "/demo-scenarios",
    titleKey: "navigation.demoScenarios",
    icon: FlaskConical,
    superAdminOnly: true,
    Page: lazyNamed(() => import("@/pages/dashboard/demo-scenarios-page"), "DemoScenariosPage"),
  },
  {
    id: "workspace",
    path: "/dashboard/workspace",
    nestedPath: "/workspace",
    titleKey: "navigation.workspace",
    icon: LayoutGrid,
    permission: "workspace.view",
    Page: lazyNamed(() => import("@/pages/workspace"), "WorkspacePage"),
  },
  {
    id: "subscriptions",
    path: "/dashboard/subscriptions",
    nestedPath: "/subscriptions",
    titleKey: "navigation.billing",
    icon: CreditCard,
    permission: "subscriptions.view",
    Page: lazyNamed(() => import("@/pages/subscriptions"), "SubscriptionsPage"),
  },
  {
    id: "audit-logs",
    path: "/dashboard/audit-logs",
    nestedPath: "/audit-logs",
    titleKey: "navigation.auditLogs",
    icon: ShieldCheck,
    permission: "audit_logs.view",
    Page: lazyNamed(() => import("@/pages/audit-logs"), "AuditLogsPage"),
  },
  {
    id: "users",
    path: "/dashboard/users",
    nestedPath: "/users",
    titleKey: "navigation.users",
    icon: Users,
    permission: "users.view",
    sidebarGroup: "user-management",
    Page: lazyNamed(() => import("@/pages/users"), "UsersPage"),
  },
  {
    id: "roles",
    path: "/dashboard/roles",
    nestedPath: "/roles",
    titleKey: "navigation.roles",
    icon: ShieldCheck,
    permission: "roles.view",
    sidebarGroup: "user-management",
    Page: lazyNamed(() => import("@/pages/roles"), "RolesPage"),
  },
  {
    id: "whatsapp",
    path: "/dashboard/whatsapp",
    nestedPath: "/whatsapp",
    titleKey: "navigation.whatsapp",
    icon: MessageSquare,
    permission: "whatsapp.view",
    Page: lazyPage(() => import("@/pages/dashboard/whatsapp-page")),
  },
  {
    id: "ai-assistant",
    path: "/dashboard/ai-assistant",
    nestedPath: "/ai-assistant",
    titleKey: "navigation.aiAssistant",
    icon: Sparkles,
    permission: "ai_assistant.view",
    sidebarGroup: "ai-platform",
    Page: lazyNamed(() => import("@/pages/ai-assistant"), "AiAssistantPage"),
  },
  {
    id: "ai-chat",
    path: "/dashboard/ai-chat",
    nestedPath: "/ai-chat",
    titleKey: "navigation.aiChat",
    icon: Bot,
    permission: "ai_chat.view",
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/ai-chat-page")),
  },
  {
    id: "knowledge",
    path: "/dashboard/knowledge",
    nestedPath: "/knowledge",
    titleKey: "navigation.knowledge",
    icon: BookOpen,
    permission: "knowledge.view",
    platformFeatureKey: PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
    sidebarGroup: "ai-platform",
    Page: lazyNamed(() => import("@/pages/knowledge"), "KnowledgePage"),
  },
  {
    id: "prompts",
    path: "/dashboard/prompts",
    nestedPath: "/prompts",
    titleKey: "navigation.prompts",
    icon: ScrollText,
    permission: "prompts.view",
    sidebarGroup: "ai-platform",
    Page: lazyNamed(() => import("@/pages/prompts"), "PromptPage"),
  },
  {
    id: "automation",
    path: "/dashboard/automation",
    nestedPath: "/automation",
    titleKey: "navigation.automation",
    icon: Workflow,
    permission: "automation.view",
    platformFeatureKey: PLATFORM_AI_FEATURE_KEY.AUTOMATION,
    sidebarGroup: "ai-platform",
    Page: lazyPage(() => import("@/pages/dashboard/automation-page")),
  },
  {
    id: "reports",
    path: "/dashboard/reports",
    nestedPath: "/reports",
    titleKey: "navigation.reports",
    icon: BarChart3,
    permission: "reports.view",
    Page: lazyPage(() => import("@/pages/dashboard/reports-page")),
  },
  {
    id: "settings",
    path: "/dashboard/settings",
    nestedPath: "/settings",
    titleKey: "navigation.settings",
    icon: Settings,
    permission: "settings.view",
    Page: lazyPage(() => import("@/pages/dashboard/settings-page")),
  },
] as const;

const ROUTE_BY_ID = new Map<DashboardSectionId, DashboardRouteDefinition>(
  DASHBOARD_ROUTE_REGISTRY.map((route) => [route.id, route]),
);

const ROUTE_BY_NESTED_PATH = new Map<string, DashboardRouteDefinition>(
  DASHBOARD_ROUTE_REGISTRY.map((route) => [route.nestedPath, route]),
);

const ROUTE_BY_ABSOLUTE_PATH = new Map<string, DashboardRouteDefinition>(
  DASHBOARD_ROUTE_REGISTRY.map((route) => [route.path, route]),
);

/** Sidebar order: top-level routes plus grouped entries in display order */
export const DASHBOARD_SIDEBAR_ORDER: readonly (
  | { type: "route"; id: DashboardSectionId }
  | { type: "group"; id: DashboardSidebarGroupId }
)[] = [
  { type: "group", id: "ai-platform" },
  { type: "route", id: "customers" },
  { type: "route", id: "bookings" },
  { type: "route", id: "calendar" },
  { type: "route", id: "scheduling" },
  { type: "route", id: "communication" },
  { type: "route", id: "invoices" },
  { type: "route", id: "financial" },
  { type: "route", id: "executive" },
  { type: "route", id: "organization" },
  { type: "route", id: "integrations" },
  { type: "route", id: "marketplace" },
  { type: "route", id: "companies" },
  { type: "route", id: "platform-ai-operations" },
  { type: "route", id: "demo-scenarios" },
  { type: "route", id: "workspace" },
  { type: "route", id: "subscriptions" },
  { type: "route", id: "audit-logs" },
  { type: "group", id: "user-management" },
  { type: "route", id: "reports" },
  { type: "route", id: "settings" },
];

export function getDashboardRouteById(id: DashboardSectionId): DashboardRouteDefinition {
  const route = ROUTE_BY_ID.get(id);
  if (!route) {
    throw new Error(`Unknown dashboard section: ${id}`);
  }
  return route;
}

export function getDashboardRouteByNestedPath(nestedPath: string): DashboardRouteDefinition | null {
  if (nestedPath === "/" || nestedPath === "") {
    return null;
  }
  const normalized = nestedPath.startsWith("/") ? nestedPath : `/${nestedPath}`;
  return ROUTE_BY_NESTED_PATH.get(normalized) ?? null;
}

export function getDashboardRouteByAbsolutePath(path: string): DashboardRouteDefinition | null {
  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    if (path === route.path || path.startsWith(`${route.path}/`)) {
      return route;
    }
  }
  return null;
}

export function sectionIdFromNestedPath(nestedPath: string): DashboardSectionId | null {
  const exact = getDashboardRouteByNestedPath(nestedPath)?.id;
  if (exact) {
    return exact;
  }
  for (const route of DASHBOARD_ROUTE_REGISTRY) {
    if (nestedPath === route.nestedPath || nestedPath.startsWith(`${route.nestedPath}/`)) {
      return route.id;
    }
  }
  return null;
}

export function sectionIdFromAbsolutePath(path: string): DashboardSectionId | null {
  return getDashboardRouteByAbsolutePath(path)?.id ?? null;
}

export type PlatformFeatureEnabledLookup = (
  featureKey: PlatformAIFeatureKey,
) => boolean | undefined;

export function isDashboardRoutePermitted(
  route: DashboardRouteDefinition,
  isSuperAdmin: boolean,
  hasPermission: (permission: string) => boolean,
  platformFeatureEnabled?: PlatformFeatureEnabledLookup,
): boolean {
  if (isSuperAdmin) {
    return true;
  }
  if (route.superAdminOnly) {
    return false;
  }
  if (route.permission) {
    if (route.id === "subscriptions") {
      if (!hasPermission(route.permission) && !hasPermission("billing.view")) {
        return false;
      }
    } else if (route.id === "workspace") {
      if (
        !hasPermission("workspace.view") &&
        !hasPermission("billing.view_own") &&
        !hasPermission("subscriptions.view")
      ) {
        return false;
      }
    } else if (!hasPermission(route.permission)) {
      return false;
    }
  }

  if (route.platformFeatureKey) {
    const enabled = platformFeatureEnabled?.(route.platformFeatureKey);
    if (enabled === false) {
      return false;
    }
  }

  return true;
}

export function getDefaultDashboardRoute(
  isSuperAdmin: boolean,
  hasPermission: (permission: string) => boolean,
): DashboardRouteDefinition | null {
  for (const entry of DASHBOARD_SIDEBAR_ORDER) {
    if (entry.type === "group") {
      const group = DASHBOARD_SIDEBAR_GROUPS.find((item) => item.id === entry.id);
      if (!group) {
        continue;
      }
      for (const childId of group.childIds) {
        const route = getDashboardRouteById(childId);
        if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
          return route;
        }
      }
      continue;
    }

    const route = getDashboardRouteById(entry.id);
    if (isDashboardRoutePermitted(route, isSuperAdmin, hasPermission)) {
      return route;
    }
  }

  return null;
}

export function getDefaultDashboardNestedPath(
  isSuperAdmin: boolean,
  hasPermission: (permission: string) => boolean,
): string | null {
  return getDefaultDashboardRoute(isSuperAdmin, hasPermission)?.nestedPath ?? null;
}

export const USER_MANAGEMENT_SECTION_IDS: readonly DashboardSectionId[] = ["users", "roles"];
