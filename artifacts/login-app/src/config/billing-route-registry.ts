import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const BILLING_BASE_NESTED_PATH = "/subscriptions";

export type BillingRouteId =
  | "overview"
  | "payments"
  | "invoices"
  | "receipts"
  | "failures"
  | "renewals"
  | "expirations"
  | "revenue"
  | "analytics"
  | "provider-health"
  | "settings"
  | "audit";

export type BillingRouteDefinition = {
  id: BillingRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  phase: 1 | 2;
  Page: LazyExoticComponent<ComponentType>;
};

/** Phase 2+ routes not yet implemented — redirect to overview if accessed directly. */
export const BLOCKED_BILLING_PATHS = ["/companies", "/plans", "/list", "/reports", "/refunds", "/providers"] as const;

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName],
    })),
  );

export const BILLING_ROUTE_REGISTRY: readonly BillingRouteDefinition[] = [
  {
    id: "overview",
    nestedPath: "/",
    titleKey: "billing.nav.overview",
    phase: 1,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-overview-page"), "BillingOverviewPage"),
  },
  {
    id: "payments",
    nestedPath: "/payments",
    titleKey: "billing.nav.payments",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-payments-page"), "BillingPaymentsPage"),
  },
  {
    id: "invoices",
    nestedPath: "/invoices",
    titleKey: "billing.nav.subscriptionInvoices",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-invoices-page"), "BillingInvoicesPage"),
  },
  {
    id: "receipts",
    nestedPath: "/receipts",
    titleKey: "billing.nav.receipts",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-receipts-page"), "BillingReceiptsPage"),
  },
  {
    id: "failures",
    nestedPath: "/failures",
    titleKey: "billing.nav.failures",
    phase: 2,
    Page: lazyNamed(
      () => import("@/pages/dashboard/billing/billing-payment-failures-page"),
      "BillingPaymentFailuresPage",
    ),
  },
  {
    id: "renewals",
    nestedPath: "/renewals",
    titleKey: "billing.nav.renewals",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-renewals-page"), "BillingRenewalsPage"),
  },
  {
    id: "expirations",
    nestedPath: "/expirations",
    titleKey: "billing.nav.expirations",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-expirations-page"), "BillingExpirationsPage"),
  },
  {
    id: "revenue",
    nestedPath: "/revenue",
    titleKey: "billing.nav.revenue",
    permission: "billing.view_reports",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-revenue-page"), "BillingRevenuePage"),
  },
  {
    id: "analytics",
    nestedPath: "/analytics",
    titleKey: "billing.nav.analytics",
    permission: "billing.view_reports",
    phase: 2,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-analytics-page"), "BillingAnalyticsPage"),
  },
  {
    id: "provider-health",
    nestedPath: "/provider-health",
    titleKey: "billing.nav.providerHealth",
    permission: "billing.health.view",
    phase: 2,
    Page: lazyNamed(
      () => import("@/pages/dashboard/billing/billing-provider-health-page"),
      "BillingProviderHealthPage",
    ),
  },
  {
    id: "settings",
    nestedPath: "/settings",
    titleKey: "billing.nav.settings",
    permission: "billing.settings.view",
    phase: 1,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-settings-page"), "BillingSettingsPage"),
  },
  {
    id: "audit",
    nestedPath: "/audit",
    titleKey: "billing.nav.audit",
    permission: "billing.audit.view",
    phase: 1,
    Page: lazyNamed(() => import("@/pages/dashboard/billing/billing-audit-log-page"), "BillingAuditLogPage"),
  },
];

export function billingNavItems() {
  return BILLING_ROUTE_REGISTRY;
}
