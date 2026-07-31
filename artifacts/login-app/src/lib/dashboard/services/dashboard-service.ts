import {

  DashboardEngine,

  DashboardMetricRegistry,

  DashboardAnalyticsEngine,

  DashboardInsightEngine,

  mergePartialDashboardSnapshot,

  registerDashboardProviders,

  type DashboardAccess,

  type DashboardQuery,

  type DashboardSnapshot,

  type DashboardTimeRangeKey,

} from "@workspace/dashboard-engine";

import { createExtendedSupabaseDashboardMetricsPorts } from "@/lib/dashboard/adapters/supabase-dashboard-metrics-ports";

import { createSupabaseDashboardHistoricalDataPort } from "@/lib/dashboard/adapters/supabase-dashboard-historical-data-port";

import { createBookingsMetricsProvider } from "@/lib/dashboard/providers/bookings-metrics-provider";

import { createFinanceMetricsProvider } from "@/lib/dashboard/providers/finance-metrics-provider";

import { createInvoicesMetricsProvider } from "@/lib/dashboard/providers/invoices-metrics-provider";



let dashboardEngine: DashboardEngine | null = null;

let dashboardAnalyticsEngine: DashboardAnalyticsEngine | null = null;

let dashboardInsightEngine: DashboardInsightEngine | null = null;



function getDashboardEngine(): DashboardEngine {

  if (dashboardEngine) return dashboardEngine;



  const registry = new DashboardMetricRegistry();

  const ports = createExtendedSupabaseDashboardMetricsPorts();



  registerDashboardProviders(registry, ports);

  registry.registerProvider(createFinanceMetricsProvider(ports.finance));

  registry.registerProvider(createBookingsMetricsProvider(ports.bookings));

  registry.registerProvider(createInvoicesMetricsProvider(ports.invoices));



  dashboardEngine = new DashboardEngine({ registry });

  return dashboardEngine;

}



function getDashboardAnalyticsEngine(): DashboardAnalyticsEngine {

  if (dashboardAnalyticsEngine) return dashboardAnalyticsEngine;

  dashboardAnalyticsEngine = new DashboardAnalyticsEngine({

    historicalPort: createSupabaseDashboardHistoricalDataPort(),

  });

  return dashboardAnalyticsEngine;

}



function getDashboardInsightEngine(): DashboardInsightEngine {

  if (dashboardInsightEngine) return dashboardInsightEngine;

  dashboardInsightEngine = new DashboardInsightEngine();

  return dashboardInsightEngine;

}



export type DashboardSnapshotRequest = {

  companyId: string;

  timeRange?: DashboardTimeRangeKey;

  customRange?: {

    startAt: string;

    endAt: string;

  };

  categories?: DashboardQuery["filter"] extends infer F

    ? F extends { categories?: infer C }

      ? C

      : never

    : never;

  providerIds?: string[];

  metricKeys?: string[];

};



export async function fetchDashboardSnapshot(

  access: DashboardAccess,

  request: DashboardSnapshotRequest,

): Promise<DashboardSnapshot> {

  const engine = getDashboardEngine();

  const baseSnapshot = await engine.snapshot(access, {

    companyId: request.companyId,

    filter: {

      categories: request.categories,

      providerIds: request.providerIds,

      metricKeys: request.metricKeys,

    },

    scope: request.timeRange ? { timeRange: request.timeRange } : undefined,

  });



  const analyticsEngine = getDashboardAnalyticsEngine();

  const analyticsSnapshot = await analyticsEngine.enrich(baseSnapshot, {

    companyId: request.companyId,

    timeRange: request.timeRange ?? "30d",

    customRange: request.customRange,

  });



  const insightEngine = getDashboardInsightEngine();

  return insightEngine.enrich(analyticsSnapshot, {

    companyId: request.companyId,

  });

}



export async function refreshDashboardSnapshot(

  access: DashboardAccess,

  cached: DashboardSnapshot,

  request: DashboardSnapshotRequest,

): Promise<DashboardSnapshot> {

  const hasScopedProviders = (request.providerIds?.length ?? 0) > 0;

  if (!hasScopedProviders) {

    return fetchDashboardSnapshot(access, request);

  }



  const partial = await fetchDashboardSnapshot(access, {

    ...request,

    categories: request.categories,

    providerIds: request.providerIds,

  });



  const merged = mergePartialDashboardSnapshot(cached, partial, request.providerIds!);

  const analyticsEngine = getDashboardAnalyticsEngine();

  const analyticsSnapshot = await analyticsEngine.enrich(merged, {

    companyId: request.companyId,

    timeRange: request.timeRange ?? "30d",

    customRange: request.customRange,

  });



  const insightEngine = getDashboardInsightEngine();

  return insightEngine.enrich(analyticsSnapshot, {

    companyId: request.companyId,

  });

}



export function resetDashboardEngineForTests(): void {

  dashboardEngine = null;

  dashboardAnalyticsEngine = null;

  dashboardInsightEngine = null;

}


