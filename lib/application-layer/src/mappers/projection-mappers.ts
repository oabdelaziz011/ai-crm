import type {
  CustomerReadModel,
  BookingReadModel,
  TimelineReadModel,
  NotificationListResult,
  AnalyticsMetricModel,
  EmployeeWorkloadModel,
  RevenueSummaryModel,
} from "../ports/repository-ports.js";
import type {
  Customer360ProjectionDto,
  OperationsQueueProjectionDto,
  OperationsQueueRowDto,
  TimelineProjectionDto,
  TimelineItemDto,
  DashboardProjectionDto,
  WidgetProjectionDto,
  SummaryCardDto,
  CalendarProjectionDto,
  CalendarSlotDto,
  AnalyticsProjectionDto,
  NotificationCenterProjectionDto,
  NotificationItemDto,
  WorkspaceProjectionDto,
  RevenueProjectionDto,
  EmployeeWorkloadProjectionDto,
} from "../dto/query-dtos.js";

export function mapCustomerTo360Projection(
  customer: CustomerReadModel,
  timeline: TimelineReadModel[],
): Customer360ProjectionDto {
  return Object.freeze({
    customerId: customer.id,
    displayName: customer.displayName,
    isVip: customer.isVip,
    outstandingBalanceCents: customer.outstandingBalanceCents,
    currentStatus: customer.currentStatus,
    summaryCards: Object.freeze([
      mapSummaryCard("visits", "Total Visits", "12", "+2", "success"),
      mapSummaryCard("revenue", "Revenue", "$2,400", "+12%", "success"),
      mapSummaryCard("balance", "Outstanding", `$${(customer.outstandingBalanceCents / 100).toFixed(2)}`, undefined, customer.outstandingBalanceCents > 0 ? "warning" : "default"),
    ]),
    timeline: Object.freeze(timeline.map(mapTimelineItem)),
  });
}

export function mapBookingToQueueRow(booking: BookingReadModel): OperationsQueueRowDto {
  return Object.freeze({
    id: booking.id,
    reference: booking.reference,
    customerName: booking.customerName,
    status: booking.status,
    scheduledAt: booking.scheduledAt,
    employeeName: booking.employeeName ?? "—",
    paymentStatus: booking.paymentStatus,
  });
}

export function mapBookingsToQueueProjection(
  bookings: BookingReadModel[],
  total: number,
  page: number,
  pageSize: number,
): OperationsQueueProjectionDto {
  return Object.freeze({
    rows: Object.freeze(bookings.map(mapBookingToQueueRow)),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}

export function mapTimelineItems(
  entityType: string,
  entityId: string,
  items: TimelineReadModel[],
): TimelineProjectionDto {
  return Object.freeze({
    entityType,
    entityId,
    items: Object.freeze(items.map(mapTimelineItem)),
  });
}

export function mapTimelineItem(item: TimelineReadModel): TimelineItemDto {
  return Object.freeze({
    id: item.id,
    occurredAt: item.occurredAt,
    title: item.title,
    description: item.description,
    actor: item.actor,
    eventType: item.eventType,
  });
}

export function mapAnalyticsMetrics(metrics: AnalyticsMetricModel[], templateKey: string): AnalyticsProjectionDto {
  return Object.freeze({
    templateKey,
    metrics: Object.freeze(metrics.map((m) => mapSummaryCard(m.id, m.label, m.value, m.trend))),
  });
}

export function mapDashboardWidgets(metrics: AnalyticsMetricModel[]): DashboardProjectionDto {
  const widget: WidgetProjectionDto = Object.freeze({
    widgetId: "overview",
    title: "Overview",
    cards: Object.freeze(metrics.map((m) => mapSummaryCard(m.id, m.label, m.value, m.trend))),
  });
  return Object.freeze({
    period: "today",
    widgets: Object.freeze([widget]),
  });
}

export function mapNotifications(result: NotificationListResult, unreadCount: number): NotificationCenterProjectionDto {
  return Object.freeze({
    notifications: Object.freeze(
      result.items.map(
        (n): NotificationItemDto =>
          Object.freeze({
            id: n.id,
            title: n.title,
            message: n.message,
            priority: n.priority,
            category: n.category,
            severity: n.severity,
            read: n.read,
            createdAt: n.createdAt,
            correlationId: n.correlationId,
            entityType: n.entityType,
            entityId: n.entityId,
            navigationTarget: n.navigationTarget,
          }),
      ),
    ),
    unreadCount,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasMore: result.hasMore,
  });
}

export function mapCalendarBookings(bookings: BookingReadModel[], from: string, to: string): CalendarProjectionDto {
  return Object.freeze({
    from,
    to,
    slots: Object.freeze(
      bookings.map(
        (b): CalendarSlotDto =>
          Object.freeze({
            bookingId: b.id,
            customerName: b.customerName,
            startAt: b.scheduledAt,
            endAt: b.scheduledAt,
            status: b.status,
            employeeName: b.employeeName ?? "—",
          }),
      ),
    ),
  });
}

export function mapRevenueSummary(summary: RevenueSummaryModel, breakdown: SummaryCardDto[]): RevenueProjectionDto {
  return Object.freeze({
    totalCents: summary.totalCents,
    currency: summary.currency,
    period: summary.period,
    trend: summary.trend,
    breakdown: Object.freeze(breakdown),
  });
}

export function mapEmployeeWorkload(model: EmployeeWorkloadModel): EmployeeWorkloadProjectionDto {
  return Object.freeze({
    employeeId: model.employeeId,
    employeeName: model.employeeName,
    bookingsToday: model.bookingsToday,
    hoursScheduled: model.hoursScheduled,
    utilizationPercent: model.utilizationPercent,
  });
}

export function mapWorkspaceProjection(input: {
  entityType: string;
  entityId: string;
  templateKey: string;
  widgets: WidgetProjectionDto[];
}): WorkspaceProjectionDto {
  return Object.freeze({
    entityType: input.entityType,
    entityId: input.entityId,
    templateKey: input.templateKey,
    sections: Object.freeze([
      Object.freeze({ id: "summary", title: "Summary", visible: true, collapsed: false }),
      Object.freeze({ id: "timeline", title: "Timeline", visible: true, collapsed: false }),
    ]),
    widgets: Object.freeze(input.widgets),
  });
}

function mapSummaryCard(
  id: string,
  label: string,
  value: string,
  trend?: string,
  tone: SummaryCardDto["tone"] = "default",
): SummaryCardDto {
  return Object.freeze({ id, label, value, trend, tone });
}
