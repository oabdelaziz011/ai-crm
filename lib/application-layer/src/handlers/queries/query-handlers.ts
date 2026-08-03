import type { ApplicationPorts } from "../../ports/repository-ports.js";
import type { ApplicationContext } from "../../contracts/application-context.js";
import type {
  Customer360QueryRequestDto,
  OperationsQueueQueryRequestDto,
  TimelineQueryRequestDto,
  DashboardQueryRequestDto,
  AnalyticsQueryRequestDto,
  NotificationCenterQueryRequestDto,
  WorkspaceQueryRequestDto,
  CalendarQueryRequestDto,
  RevenueQueryRequestDto,
  EmployeeWorkloadQueryRequestDto,
  ExecutiveInsightsQueryRequestDto,
  OperationsAnalyticsQueryRequestDto,
  BookingsAnalyticsQueryRequestDto,
  PaymentsAnalyticsQueryRequestDto,
  InvoicesAnalyticsQueryRequestDto,
  ServicesAnalyticsQueryRequestDto,
  BranchAnalyticsQueryRequestDto,
  CustomerAnalyticsQueryRequestDto,
  UtilizationQueryRequestDto,
} from "../../dto/query-dtos.js";
import { generateExecutiveInsights } from "../../insights/executive-insights-engine.js";
import {
  mapCustomerTo360Projection,
  mapBookingsToQueueProjection,
  mapTimelineItems,
  mapDashboardWidgets,
  mapAnalyticsMetrics,
  mapNotifications,
  mapWorkspaceProjection,
  mapCalendarBookings,
  mapRevenueSummary,
  mapEmployeeWorkload,
} from "../../mappers/projection-mappers.js";
import type { SummaryCardDto } from "../../dto/query-dtos.js";
import { ResourceNotFoundError } from "../../errors/application-errors.js";

export type QueryHandlerDeps = Readonly<{
  ports: ApplicationPorts;
}>;

export async function handleCustomer360Query(
  deps: QueryHandlerDeps,
  request: Customer360QueryRequestDto,
  context: ApplicationContext,
) {
  const customer = await deps.ports.customerRead.getById(context.tenantId, request.customerId);
  if (!customer) throw new ResourceNotFoundError("Customer", request.customerId);
  const timeline = await deps.ports.timelineRead.listForEntity(
    context.tenantId,
    "customer",
    request.customerId,
    20,
  );
  return mapCustomerTo360Projection(customer, timeline);
}

export async function handleOperationsQueueQuery(
  deps: QueryHandlerDeps,
  request: OperationsQueueQueryRequestDto,
  context: ApplicationContext,
) {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 20;
  const allBookings = await deps.ports.bookingRead.listQueue(context.tenantId, {
    search: request.search,
    statusFilter: request.statusFilter,
  });
  const start = (page - 1) * pageSize;
  const bookings = allBookings.slice(start, start + pageSize);
  return mapBookingsToQueueProjection(bookings, allBookings.length, page, pageSize);
}

export async function handleTimelineQuery(
  deps: QueryHandlerDeps,
  request: TimelineQueryRequestDto,
  context: ApplicationContext,
) {
  const items = await deps.ports.timelineRead.listForEntity(
    context.tenantId,
    request.entityType,
    request.entityId,
    request.limit ?? 50,
  );
  return mapTimelineItems(request.entityType, request.entityId, items);
}

export async function handleDashboardQuery(
  deps: QueryHandlerDeps,
  request: DashboardQueryRequestDto,
  context: ApplicationContext,
) {
  const filter = Object.freeze({
    period: request.period ?? "30d",
    comparePrevious: request.comparePrevious ?? true,
    branchId: request.branchId,
    employeeId: request.employeeId,
    serviceId: request.serviceId,
    from: request.from,
    to: request.to,
  });

  const snapshot = await deps.ports.analyticsRead.getExecutiveSnapshot(context.tenantId, filter);
  const kpis = snapshot.kpis.map((kpi) =>
    Object.freeze({
      id: kpi.key,
      label: kpi.label,
      value: kpi.unit === "currency" ? `$${(kpi.value / 100).toFixed(0)}` : String(Math.round(kpi.value)),
      trend:
        kpi.previousValue != null && kpi.previousValue > 0
          ? `${kpi.value >= kpi.previousValue ? "+" : ""}${Math.round(((kpi.value - kpi.previousValue) / kpi.previousValue) * 100)}%`
          : undefined,
    }),
  );

  return Object.freeze({
    widgets: Object.freeze([
      Object.freeze({
        widgetId: "dashboard_overview",
        title: "Overview",
        cards: kpis.slice(0, 8).map((m) =>
          Object.freeze({ id: m.id, label: m.label, value: m.value, trend: m.trend, tone: "default" as const }),
        ),
      }),
    ]),
    period: filter.period ?? "today",
    kpis: kpis.map((m) => Object.freeze({ ...m, tone: "default" as const })),
    charts: snapshot.charts,
    rankings: snapshot.rankings,
  });
}

export async function handleAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: AnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  const metrics = await deps.ports.analyticsRead.getMetrics(
    context.tenantId,
    request.templateKey ?? "clinic",
    request.metrics ? [...request.metrics] : undefined,
  );
  return mapAnalyticsMetrics(metrics, request.templateKey ?? "clinic");
}

export async function handleNotificationCenterQuery(
  deps: QueryHandlerDeps,
  request: NotificationCenterQueryRequestDto,
  context: ApplicationContext,
) {
  const [result, unreadCount] = await Promise.all([
    deps.ports.notificationRead.list(context.tenantId, context.actorId, {
      unreadOnly: request.unreadOnly,
      limit: request.limit,
      page: request.page,
      pageSize: request.pageSize,
      search: request.search,
      category: request.category,
      eventType: request.eventType,
      priority: request.priority,
      includeArchived: request.includeArchived,
    }),
    deps.ports.notificationRead.getUnreadCount(context.tenantId, context.actorId),
  ]);
  return mapNotifications(result, unreadCount);
}

export async function handleWorkspaceQuery(
  deps: QueryHandlerDeps,
  request: WorkspaceQueryRequestDto,
  context: ApplicationContext,
) {
  const metrics = await deps.ports.analyticsRead.getMetrics(
    context.tenantId,
    request.templateKey ?? "clinic",
  );
  return mapWorkspaceProjection({
    entityType: request.entityType,
    entityId: request.entityId,
    templateKey: request.templateKey ?? "clinic",
    widgets: [
      {
        widgetId: "ws_overview",
        title: "Overview",
        cards: metrics.map((m: { id: string; label: string; value: string; trend?: string }) => ({
          id: m.id,
          label: m.label,
          value: m.value,
          trend: m.trend,
          tone: "default" as const,
        })),
      },
    ],
  });
}

export async function handleCalendarQuery(
  deps: QueryHandlerDeps,
  request: CalendarQueryRequestDto,
  context: ApplicationContext,
) {
  const bookings = await deps.ports.bookingRead.listCalendar(
    context.tenantId,
    request.from,
    request.to,
    request.employeeId,
  );
  return mapCalendarBookings(bookings, request.from, request.to);
}

export async function handleRevenueQuery(
  deps: QueryHandlerDeps,
  request: RevenueQueryRequestDto,
  context: ApplicationContext,
) {
  const summary = await deps.ports.revenueRead.getSummary(
    context.tenantId,
    request.period ?? "today",
    request.branchId,
  );
  return mapRevenueSummary(summary, [
    summaryCard("collected", "Collected", `$${(summary.totalCents / 100).toFixed(0)}`),
    summaryCard("trend", "Trend", summary.trend, undefined, "success"),
  ]);
}

function summaryCard(
  id: string,
  label: string,
  value: string,
  trend?: string,
  tone: SummaryCardDto["tone"] = "default",
): SummaryCardDto {
  return Object.freeze({ id, label, value, trend, tone });
}

export async function handleEmployeeWorkloadQuery(
  deps: QueryHandlerDeps,
  request: EmployeeWorkloadQueryRequestDto,
  context: ApplicationContext,
) {
  const model = await deps.ports.employeeRead.getWorkload(
    context.tenantId,
    request.employeeId ?? context.actorId,
    request.date ?? new Date().toISOString().slice(0, 10),
  );
  return mapEmployeeWorkload(model);
}

function buildAnalyticsFilter(input: {
  period?: DashboardQueryRequestDto["period"];
  branchId?: string;
  employeeId?: string;
  serviceId?: string;
  comparePrevious?: boolean;
  from?: string;
  to?: string;
}) {
  return Object.freeze({
    period: input.period ?? "today",
    comparePrevious: input.comparePrevious ?? true,
    branchId: input.branchId,
    employeeId: input.employeeId,
    serviceId: input.serviceId,
    from: input.from,
    to: input.to,
  });
}

function kpiToSummaryCards(kpis: readonly { key: string; label: string; value: number; unit?: string; previousValue?: number }[], currency: string) {
  return kpis.map((kpi) =>
    Object.freeze({
      id: kpi.key,
      label: kpi.label,
      value: kpi.unit === "currency" ? `$${(kpi.value / 100).toFixed(0)}` : String(Math.round(kpi.value)),
      trend:
        kpi.previousValue != null && kpi.previousValue > 0
          ? `${kpi.value >= kpi.previousValue ? "+" : ""}${Math.round(((kpi.value - kpi.previousValue) / kpi.previousValue) * 100)}%`
          : undefined,
      tone: "default" as const,
    }),
  );
}

async function loadAnalyticsSlice(
  deps: QueryHandlerDeps,
  context: ApplicationContext,
  filter: ReturnType<typeof buildAnalyticsFilter>,
  prefix: string,
  templateKey = "clinic",
) {
  const snapshot = await deps.ports.analyticsRead.getExecutiveSnapshot(context.tenantId, filter);
  const metrics = kpiToSummaryCards(
    snapshot.kpis.filter((kpi) => kpi.key.startsWith(prefix)),
    snapshot.currency,
  );
  return Object.freeze({ metrics, templateKey });
}

export async function handleExecutiveInsightsQuery(
  deps: QueryHandlerDeps,
  request: ExecutiveInsightsQueryRequestDto,
  context: ApplicationContext,
) {
  const filter = buildAnalyticsFilter(request);
  const snapshot = await deps.ports.analyticsRead.getExecutiveSnapshot(context.tenantId, filter);
  return generateExecutiveInsights(snapshot);
}

export async function handleOperationsAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: OperationsAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  return loadAnalyticsSlice(deps, context, buildAnalyticsFilter(request), "operations.");
}

export async function handleBookingsAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: BookingsAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  return loadAnalyticsSlice(deps, context, buildAnalyticsFilter(request), "bookings.");
}

export async function handlePaymentsAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: PaymentsAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  return loadAnalyticsSlice(deps, context, buildAnalyticsFilter(request), "payments.");
}

export async function handleInvoicesAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: InvoicesAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  return loadAnalyticsSlice(deps, context, buildAnalyticsFilter(request), "finance.");
}

export async function handleServicesAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: ServicesAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  const filter = buildAnalyticsFilter(request);
  const snapshot = await deps.ports.analyticsRead.getExecutiveSnapshot(context.tenantId, filter);
  return Object.freeze({
    metrics: Object.freeze(
      snapshot.rankings.services.map((item) =>
        Object.freeze({ id: item.id, label: item.name, value: `$${(item.value / 100).toFixed(0)}`, tone: "default" as const }),
      ),
    ),
    templateKey: "clinic",
  });
}

export async function handleBranchAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: BranchAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  const filter = buildAnalyticsFilter(request);
  const snapshot = await deps.ports.analyticsRead.getExecutiveSnapshot(context.tenantId, filter);
  return Object.freeze({
    metrics: Object.freeze(
      snapshot.breakdowns.revenueByBranch.map((item) =>
        Object.freeze({ id: item.id, label: item.name, value: `$${(item.value / 100).toFixed(0)}`, tone: "default" as const }),
      ),
    ),
    templateKey: "clinic",
  });
}

export async function handleCustomerAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: CustomerAnalyticsQueryRequestDto,
  context: ApplicationContext,
) {
  return loadAnalyticsSlice(deps, context, buildAnalyticsFilter(request), "customers.");
}

export async function handleUtilizationAnalyticsQuery(
  deps: QueryHandlerDeps,
  request: UtilizationQueryRequestDto,
  context: ApplicationContext,
) {
  const filter = buildAnalyticsFilter(request);
  const snapshot = await deps.ports.analyticsRead.getExecutiveSnapshot(context.tenantId, filter);
  const metrics = kpiToSummaryCards(
    snapshot.kpis.filter((kpi) => kpi.key.includes("utilization") || kpi.key.includes("occupancy")),
    snapshot.currency,
  );
  return Object.freeze({ metrics, templateKey: "clinic" });
}
