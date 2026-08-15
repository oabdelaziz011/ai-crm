/**
 * Product report catalog — system-wide reporting registry.
 * Access: hub `reports.view` ∧ (report-specific permission OR legacy module permission) ∧ commercial modules.
 * Every report renders inline inside `/dashboard/reports` — no module deep-links.
 */
export type ReportId =
  | "overview"
  | "bookings"
  | "customers"
  | "invoices"
  | "financial"
  | "executive"
  | "leads"
  | "opportunities"
  | "products"
  | "quotes"
  | "tickets"
  | "operations"
  | "ai_consumption"
  | "companies"
  | "company_revenue"
  | "subscriptions";

export type ReportCategoryId =
  | "overview"
  | "crm"
  | "sales"
  | "bookings"
  | "operations"
  | "billing"
  | "platform"
  | "intelligence"
  | "ai";

export type ReportDefinition = {
  id: ReportId;
  titleKey: string;
  descriptionKey: string;
  category: ReportCategoryId;
  /**
   * Dedicated report permission (seeded in migrations 277+).
   * Access if user has this OR any of permissionsAny.
   */
  reportPermission: string;
  /** Legacy module permissions (OR). */
  permissionsAny: string[];
  requiredModules: string[];
  requiresAdvancedReports?: boolean;
  supportsBranchFilter: boolean;
  supportsDateFilter: boolean;
  supportsExport: boolean;
  supportsPdf: boolean;
};

export const REPORT_CATEGORY_ORDER: readonly ReportCategoryId[] = [
  "overview",
  "crm",
  "sales",
  "bookings",
  "operations",
  "billing",
  "platform",
  "intelligence",
  "ai",
] as const;

export const REPORT_CATEGORY_TITLE_KEYS: Record<ReportCategoryId, string> = {
  overview: "dashboard.reports.categories.overview",
  crm: "dashboard.reports.categories.crm",
  sales: "dashboard.reports.categories.sales",
  bookings: "dashboard.reports.categories.bookings",
  operations: "dashboard.reports.categories.operations",
  billing: "dashboard.reports.categories.billing",
  platform: "dashboard.reports.categories.platform",
  intelligence: "dashboard.reports.categories.intelligence",
  ai: "dashboard.reports.categories.ai",
};

export const REPORT_CATALOG: readonly ReportDefinition[] = [
  {
    id: "overview",
    titleKey: "dashboard.reports.catalog.overview",
    descriptionKey: "dashboard.reports.catalog.overviewDesc",
    category: "overview",
    reportPermission: "reports.overview",
    permissionsAny: ["reports.view"],
    requiredModules: [],
    supportsBranchFilter: true,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "bookings",
    titleKey: "dashboard.reports.catalog.bookings",
    descriptionKey: "dashboard.reports.catalog.bookingsDesc",
    category: "bookings",
    reportPermission: "reports.bookings",
    permissionsAny: ["reports.view", "bookings.view"],
    requiredModules: ["bookings"],
    supportsBranchFilter: true,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "customers",
    titleKey: "dashboard.reports.catalog.customers",
    descriptionKey: "dashboard.reports.catalog.customersDesc",
    category: "crm",
    reportPermission: "reports.customers",
    permissionsAny: ["reports.view", "customers.view"],
    requiredModules: ["customers"],
    supportsBranchFilter: false,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "leads",
    titleKey: "dashboard.reports.catalog.leads",
    descriptionKey: "dashboard.reports.catalog.leadsDesc",
    category: "sales",
    reportPermission: "reports.leads",
    permissionsAny: ["reports.view", "leads.view"],
    requiredModules: ["leads"],
    supportsBranchFilter: false,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "opportunities",
    titleKey: "dashboard.reports.catalog.opportunities",
    descriptionKey: "dashboard.reports.catalog.opportunitiesDesc",
    category: "sales",
    reportPermission: "reports.opportunities",
    permissionsAny: ["reports.view", "opportunities.view"],
    requiredModules: ["opportunities"],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: false,
  },
  {
    id: "products",
    titleKey: "dashboard.reports.catalog.products",
    descriptionKey: "dashboard.reports.catalog.productsDesc",
    category: "sales",
    reportPermission: "reports.products",
    permissionsAny: ["reports.view", "products.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: false,
  },
  {
    id: "quotes",
    titleKey: "dashboard.reports.catalog.quotes",
    descriptionKey: "dashboard.reports.catalog.quotesDesc",
    category: "sales",
    reportPermission: "reports.quotes",
    permissionsAny: ["reports.view", "quotes.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: false,
  },
  {
    id: "tickets",
    titleKey: "dashboard.reports.catalog.tickets",
    descriptionKey: "dashboard.reports.catalog.ticketsDesc",
    category: "operations",
    reportPermission: "reports.tickets",
    permissionsAny: ["reports.view", "tickets.view"],
    requiredModules: ["ticketing"],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: false,
  },
  {
    id: "operations",
    titleKey: "dashboard.reports.catalog.operations",
    descriptionKey: "dashboard.reports.catalog.operationsDesc",
    category: "operations",
    reportPermission: "reports.operations",
    permissionsAny: ["reports.view"],
    requiredModules: ["operations"],
    supportsBranchFilter: true,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: false,
  },
  {
    id: "invoices",
    titleKey: "dashboard.reports.catalog.invoices",
    descriptionKey: "dashboard.reports.catalog.invoicesDesc",
    category: "billing",
    reportPermission: "reports.invoices",
    permissionsAny: ["reports.view", "invoices.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "financial",
    titleKey: "dashboard.reports.catalog.financial",
    descriptionKey: "dashboard.reports.catalog.financialDesc",
    category: "billing",
    reportPermission: "reports.financial",
    permissionsAny: ["reports.view", "invoices.view", "billing.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "companies",
    titleKey: "dashboard.reports.catalog.companies",
    descriptionKey: "dashboard.reports.catalog.companiesDesc",
    category: "platform",
    reportPermission: "reports.companies",
    permissionsAny: ["reports.view", "companies.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "company_revenue",
    titleKey: "dashboard.reports.catalog.companyRevenue",
    descriptionKey: "dashboard.reports.catalog.companyRevenueDesc",
    category: "platform",
    reportPermission: "reports.company_revenue",
    permissionsAny: ["reports.view", "billing.view", "companies.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "subscriptions",
    titleKey: "dashboard.reports.catalog.subscriptions",
    descriptionKey: "dashboard.reports.catalog.subscriptionsDesc",
    category: "platform",
    reportPermission: "reports.subscriptions",
    permissionsAny: ["reports.view", "billing.view", "companies.view"],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: false,
  },
  {
    id: "executive",
    titleKey: "dashboard.reports.catalog.executive",
    descriptionKey: "dashboard.reports.catalog.executiveDesc",
    category: "intelligence",
    reportPermission: "reports.executive",
    permissionsAny: ["reports.view", "executive.view"],
    requiredModules: [],
    requiresAdvancedReports: false,
    supportsBranchFilter: true,
    supportsDateFilter: true,
    supportsExport: true,
    supportsPdf: true,
  },
  {
    id: "ai_consumption",
    titleKey: "dashboard.reports.catalog.aiConsumption",
    descriptionKey: "dashboard.reports.catalog.aiConsumptionDesc",
    category: "ai",
    reportPermission: "reports.ai_consumption",
    permissionsAny: [
      "reports.view",
      "ai.costs.view",
      "ai.analytics.view",
      "companies.view",
      "billing.view",
    ],
    requiredModules: [],
    supportsBranchFilter: false,
    supportsDateFilter: false,
    supportsExport: true,
    supportsPdf: true,
  },
] as const;

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}
