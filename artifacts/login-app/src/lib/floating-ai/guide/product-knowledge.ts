/**
 * Phase 1A — Product Knowledge catalog derived from DASHBOARD_ROUTE_REGISTRY.
 * Only documents modules/routes that exist. Descriptions are intentional product copy keys.
 */
import {
  DASHBOARD_ROUTE_REGISTRY,
  getDashboardRouteById,
  type DashboardSectionId,
} from "@/config/dashboard-route-registry";
import {
  GUIDE_TASK_PERMISSIONS,
  type GuideTaskId,
} from "./permission-matrix";

export type GuideModuleId =
  | "dashboard"
  | "customers"
  | "leads"
  | "opportunities"
  | "calendar"
  | "bookings"
  | "invoices"
  | "omnichannel"
  | "whatsapp"
  | "email"
  | "tickets"
  | "ai-assistant"
  | "ai-employees"
  | "website"
  | "organization"
  | "users"
  | "roles"
  | "company"
  | "knowledge"
  | "channels"
  | "quotes"
  | "settings"
  | "automation";

export type GuidePageKnowledge = {
  routeId: DashboardSectionId;
  nestedPath: string;
  titleKey: string;
  /** Route-level view permission from registry (if any). */
  routePermission: string | null;
  purposeKey: string;
};

export type GuideModuleKnowledge = {
  id: GuideModuleId;
  /** i18n key under floatingAi.guide.modules.* */
  nameKey: string;
  descriptionKey: string;
  pages: readonly GuidePageKnowledge[];
  tasks: readonly GuideTaskId[];
  relatedSettingsRouteIds?: readonly DashboardSectionId[];
  troubleshootingKeys?: readonly string[];
};

function page(
  routeId: DashboardSectionId,
  purposeKey: string,
): GuidePageKnowledge {
  const route = getDashboardRouteById(routeId);
  return {
    routeId,
    nestedPath: route.nestedPath,
    titleKey: route.titleKey,
    routePermission: route.permission ?? null,
    purposeKey,
  };
}

/**
 * Supported Guide modules. Every routeId must exist in DASHBOARD_ROUTE_REGISTRY.
 */
export const GUIDE_PRODUCT_MODULES: readonly GuideModuleKnowledge[] = Object.freeze([
  {
    id: "dashboard",
    nameKey: "floatingAi.guide.modules.dashboard.name",
    descriptionKey: "floatingAi.guide.modules.dashboard.description",
    pages: [],
    tasks: ["dashboard.home"],
  },
  {
    id: "customers",
    nameKey: "floatingAi.guide.modules.customers.name",
    descriptionKey: "floatingAi.guide.modules.customers.description",
    pages: [page("customers", "floatingAi.guide.modules.customers.pagePurpose")],
    tasks: ["customers.view", "customers.create", "customers.edit", "customers.delete"],
    relatedSettingsRouteIds: ["company"],
    troubleshootingKeys: ["floatingAi.guide.modules.customers.troubleshoot.noAccess"],
  },
  {
    id: "leads",
    nameKey: "floatingAi.guide.modules.leads.name",
    descriptionKey: "floatingAi.guide.modules.leads.description",
    pages: [page("leads", "floatingAi.guide.modules.leads.pagePurpose")],
    tasks: ["leads.view", "leads.create", "leads.edit"],
  },
  {
    id: "opportunities",
    nameKey: "floatingAi.guide.modules.opportunities.name",
    descriptionKey: "floatingAi.guide.modules.opportunities.description",
    pages: [page("opportunities", "floatingAi.guide.modules.opportunities.pagePurpose")],
    tasks: ["opportunities.view", "opportunities.create", "opportunities.edit"],
  },
  {
    id: "calendar",
    nameKey: "floatingAi.guide.modules.calendar.name",
    descriptionKey: "floatingAi.guide.modules.calendar.description",
    pages: [
      page("calendar", "floatingAi.guide.modules.calendar.pagePurpose"),
      page("bookings", "floatingAi.guide.modules.bookings.pagePurpose"),
      page("scheduling", "floatingAi.guide.modules.scheduling.pagePurpose"),
    ],
    tasks: ["calendar.view", "bookings.view", "bookings.create", "bookings.edit"],
    relatedSettingsRouteIds: ["scheduling"],
  },
  {
    id: "bookings",
    nameKey: "floatingAi.guide.modules.bookings.name",
    descriptionKey: "floatingAi.guide.modules.bookings.description",
    pages: [page("bookings", "floatingAi.guide.modules.bookings.pagePurpose")],
    tasks: ["bookings.view", "bookings.create", "bookings.edit"],
  },
  {
    id: "invoices",
    nameKey: "floatingAi.guide.modules.invoices.name",
    descriptionKey: "floatingAi.guide.modules.invoices.description",
    pages: [
      page("invoices", "floatingAi.guide.modules.invoices.pagePurpose"),
      page("financial", "floatingAi.guide.modules.financial.pagePurpose"),
    ],
    tasks: ["invoices.view", "invoices.create", "invoices.edit"],
  },
  {
    id: "omnichannel",
    nameKey: "floatingAi.guide.modules.omnichannel.name",
    descriptionKey: "floatingAi.guide.modules.omnichannel.description",
    pages: [page("omnichannel", "floatingAi.guide.modules.omnichannel.pagePurpose")],
    tasks: ["omnichannel.view"],
    relatedSettingsRouteIds: ["channels", "whatsapp", "email"],
  },
  {
    id: "whatsapp",
    nameKey: "floatingAi.guide.modules.whatsapp.name",
    descriptionKey: "floatingAi.guide.modules.whatsapp.description",
    pages: [page("whatsapp", "floatingAi.guide.modules.whatsapp.pagePurpose")],
    tasks: ["whatsapp.view", "whatsapp.manage"],
    troubleshootingKeys: [
      "floatingAi.guide.modules.whatsapp.troubleshoot.noAccess",
      "floatingAi.guide.modules.whatsapp.troubleshoot.connection",
    ],
  },
  {
    id: "email",
    nameKey: "floatingAi.guide.modules.email.name",
    descriptionKey: "floatingAi.guide.modules.email.description",
    pages: [page("email", "floatingAi.guide.modules.email.pagePurpose")],
    tasks: ["email.view", "email.settings"],
  },
  {
    id: "tickets",
    nameKey: "floatingAi.guide.modules.tickets.name",
    descriptionKey: "floatingAi.guide.modules.tickets.description",
    pages: [page("tickets", "floatingAi.guide.modules.tickets.pagePurpose")],
    tasks: ["tickets.view", "tickets.create", "tickets.edit"],
  },
  {
    id: "ai-assistant",
    nameKey: "floatingAi.guide.modules.aiAssistant.name",
    descriptionKey: "floatingAi.guide.modules.aiAssistant.description",
    pages: [page("ai-assistant", "floatingAi.guide.modules.aiAssistant.pagePurpose")],
    tasks: ["ai_assistant.view", "ai_assistant.edit"],
  },
  {
    id: "ai-employees",
    nameKey: "floatingAi.guide.modules.aiEmployees.name",
    descriptionKey: "floatingAi.guide.modules.aiEmployees.description",
    pages: [page("ai-employees", "floatingAi.guide.modules.aiEmployees.pagePurpose")],
    tasks: ["ai_employees.view"],
  },
  {
    id: "website",
    nameKey: "floatingAi.guide.modules.website.name",
    descriptionKey: "floatingAi.guide.modules.website.description",
    pages: [page("website", "floatingAi.guide.modules.website.pagePurpose")],
    tasks: ["website.view", "website.manage"],
  },
  {
    id: "organization",
    nameKey: "floatingAi.guide.modules.organization.name",
    descriptionKey: "floatingAi.guide.modules.organization.description",
    pages: [page("organization", "floatingAi.guide.modules.organization.pagePurpose")],
    tasks: ["organization.view"],
  },
  {
    id: "users",
    nameKey: "floatingAi.guide.modules.users.name",
    descriptionKey: "floatingAi.guide.modules.users.description",
    pages: [page("users", "floatingAi.guide.modules.users.pagePurpose")],
    tasks: ["users.view", "users.create"],
    relatedSettingsRouteIds: ["roles"],
  },
  {
    id: "roles",
    nameKey: "floatingAi.guide.modules.roles.name",
    descriptionKey: "floatingAi.guide.modules.roles.description",
    pages: [page("roles", "floatingAi.guide.modules.roles.pagePurpose")],
    tasks: ["roles.view", "roles.edit"],
  },
  {
    id: "company",
    nameKey: "floatingAi.guide.modules.company.name",
    descriptionKey: "floatingAi.guide.modules.company.description",
    pages: [page("company", "floatingAi.guide.modules.company.pagePurpose")],
    tasks: ["company.view", "company.update"],
  },
  {
    id: "knowledge",
    nameKey: "floatingAi.guide.modules.knowledge.name",
    descriptionKey: "floatingAi.guide.modules.knowledge.description",
    pages: [page("knowledge", "floatingAi.guide.modules.knowledge.pagePurpose")],
    tasks: ["knowledge.view"],
  },
  {
    id: "channels",
    nameKey: "floatingAi.guide.modules.channels.name",
    descriptionKey: "floatingAi.guide.modules.channels.description",
    pages: [page("channels", "floatingAi.guide.modules.channels.pagePurpose")],
    tasks: ["channels.view"],
  },
  {
    id: "quotes",
    nameKey: "floatingAi.guide.modules.quotes.name",
    descriptionKey: "floatingAi.guide.modules.quotes.description",
    pages: [page("quotes", "floatingAi.guide.modules.quotes.pagePurpose")],
    tasks: ["quotes.view", "quotes.create"],
  },
  {
    id: "settings",
    nameKey: "floatingAi.guide.modules.settings.name",
    descriptionKey: "floatingAi.guide.modules.settings.description",
    pages: [page("settings", "floatingAi.guide.modules.settings.pagePurpose")],
    tasks: ["settings.view"],
  },
  {
    id: "automation",
    nameKey: "floatingAi.guide.modules.automation.name",
    descriptionKey: "floatingAi.guide.modules.automation.description",
    pages: [page("automation", "floatingAi.guide.modules.automation.pagePurpose")],
    tasks: ["automation.view"],
  },
]);

const MODULE_BY_ID = new Map(GUIDE_PRODUCT_MODULES.map((m) => [m.id, m]));

const ROUTE_TO_MODULE = new Map<DashboardSectionId, GuideModuleId>();
for (const mod of GUIDE_PRODUCT_MODULES) {
  for (const p of mod.pages) {
    ROUTE_TO_MODULE.set(p.routeId, mod.id);
  }
}

export function getGuideModule(id: GuideModuleId): GuideModuleKnowledge | null {
  return MODULE_BY_ID.get(id) ?? null;
}

export function listGuideModules(): readonly GuideModuleKnowledge[] {
  return GUIDE_PRODUCT_MODULES;
}

export function resolveGuideModuleForRoute(
  routeId: string | null | undefined,
): GuideModuleKnowledge | null {
  if (!routeId) return null;
  const moduleId = ROUTE_TO_MODULE.get(routeId as DashboardSectionId);
  return moduleId ? getGuideModule(moduleId) : null;
}

export function findGuidePageByRouteId(
  routeId: string,
): { module: GuideModuleKnowledge; page: GuidePageKnowledge } | null {
  for (const mod of GUIDE_PRODUCT_MODULES) {
    const found = mod.pages.find((p) => p.routeId === routeId);
    if (found) return { module: mod, page: found };
  }
  return null;
}

/** Assert every catalog route exists in the live registry (used by tests). */
export function assertGuideCatalogRoutesExist(): string[] {
  const missing: string[] = [];
  const known = new Set(DASHBOARD_ROUTE_REGISTRY.map((r) => r.id));
  for (const mod of GUIDE_PRODUCT_MODULES) {
    for (const p of mod.pages) {
      if (!known.has(p.routeId)) missing.push(`${mod.id}:${p.routeId}`);
    }
    for (const related of mod.relatedSettingsRouteIds ?? []) {
      if (!known.has(related)) missing.push(`${mod.id}:related:${related}`);
    }
  }
  for (const [taskId, req] of Object.entries(GUIDE_TASK_PERMISSIONS)) {
    if (req.routeId && !known.has(req.routeId)) {
      missing.push(`task:${taskId}:${req.routeId}`);
    }
  }
  return missing;
}
