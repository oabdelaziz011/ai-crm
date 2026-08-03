// ── Query requests ────────────────────────────────────────────────────────
export type Customer360QueryRequestDto = Readonly<{
  customerId: string;
  templateKey?: string;
  role?: string;
}>;

export type OperationsQueueQueryRequestDto = Readonly<{
  templateKey?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  statusFilter?: string;
}>;

export type DashboardQueryRequestDto = Readonly<{
  templateKey?: string;
  period?: AnalyticsTimePeriod;
  comparePrevious?: boolean;
  branchId?: string;
  employeeId?: string;
  serviceId?: string;
  from?: string;
  to?: string;
}>;

export type AnalyticsTimePeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "7d"
  | "30d"
  | "90d"
  | "custom";

export type TimelineQueryRequestDto = Readonly<{
  entityType: string;
  entityId: string;
  limit?: number;
}>;

export type RevenueQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
  employeeId?: string;
  serviceId?: string;
  comparePrevious?: boolean;
  from?: string;
  to?: string;
}>;

export type OperationsAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
  employeeId?: string;
}>;

export type BookingsAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
  employeeId?: string;
}>;

export type PaymentsAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
}>;

export type InvoicesAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
}>;

export type ServicesAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
}>;

export type BranchAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
}>;

export type CustomerAnalyticsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
}>;

export type UtilizationQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
  employeeId?: string;
}>;

export type ExecutiveInsightsQueryRequestDto = Readonly<{
  period?: AnalyticsTimePeriod;
  branchId?: string;
  employeeId?: string;
  serviceId?: string;
  comparePrevious?: boolean;
}>;

export type EmployeeWorkloadQueryRequestDto = Readonly<{
  employeeId?: string;
  date?: string;
}>;

export type CalendarQueryRequestDto = Readonly<{
  from: string;
  to: string;
  employeeId?: string;
}>;

export type AnalyticsQueryRequestDto = Readonly<{
  templateKey?: string;
  metrics?: readonly string[];
}>;

export type NotificationCenterQueryRequestDto = Readonly<{
  unreadOnly?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  eventType?: string;
  priority?: string;
  includeArchived?: boolean;
}>;

export type WorkspaceQueryRequestDto = Readonly<{
  entityType: string;
  entityId: string;
  templateKey?: string;
}>;

// ── Projection DTOs (UI-optimized, immutable) ─────────────────────────────
export type SummaryCardDto = Readonly<{
  id: string;
  label: string;
  value: string;
  trend?: string;
  tone?: "default" | "success" | "warning" | "danger";
}>;

export type WidgetProjectionDto = Readonly<{
  widgetId: string;
  title: string;
  cards: readonly SummaryCardDto[];
}>;

export type TimelineItemDto = Readonly<{
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  actor: string;
  eventType: string;
}>;

export type Customer360ProjectionDto = Readonly<{
  customerId: string;
  displayName: string;
  isVip: boolean;
  summaryCards: readonly SummaryCardDto[];
  timeline: readonly TimelineItemDto[];
  outstandingBalanceCents: number;
  currentStatus: string;
}>;

export type OperationsQueueRowDto = Readonly<{
  id: string;
  reference: string;
  customerName: string;
  status: string;
  scheduledAt: string;
  employeeName: string;
  paymentStatus: string;
}>;

export type OperationsQueueProjectionDto = Readonly<{
  rows: readonly OperationsQueueRowDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}>;

export type DashboardProjectionDto = Readonly<{
  widgets: readonly WidgetProjectionDto[];
  period: string;
  kpis: readonly SummaryCardDto[];
  charts: Readonly<Record<string, readonly AnalyticsChartPointDto>>;
  rankings: Readonly<{
    customers: readonly AnalyticsRankedItemDto[];
    employees: readonly AnalyticsRankedItemDto[];
    services: readonly AnalyticsRankedItemDto[];
    branches: readonly AnalyticsRankedItemDto[];
  }>;
  telemetry?: Readonly<{
    durationMs: number;
    repositoryCalls: number;
    cacheHits: number;
    failures: number;
  }>;
}>;

export type AnalyticsChartPointDto = Readonly<{
  label: string;
  value: number;
}>;

export type AnalyticsRankedItemDto = Readonly<{
  id: string;
  name: string;
  value: number;
  count?: number;
}>;

export type ExecutiveInsightDto = Readonly<{
  id: string;
  title: string;
  summary: string;
  details: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: number;
  reason: string;
  suggestedAction: string;
  navigationTarget?: string;
}>;

export type ExecutiveInsightsProjectionDto = Readonly<{
  insights: readonly ExecutiveInsightDto[];
  summary: Readonly<{
    health: "excellent" | "good" | "fair" | "at_risk" | "critical";
    topWins: readonly string[];
    topRisks: readonly string[];
  }>;
  telemetry?: Readonly<{ durationMs: number }>;
}>;

export type TimelineProjectionDto = Readonly<{
  entityType: string;
  entityId: string;
  items: readonly TimelineItemDto[];
}>;

export type RevenueProjectionDto = Readonly<{
  totalCents: number;
  currency: string;
  period: string;
  trend: string;
  breakdown: readonly SummaryCardDto[];
}>;

export type EmployeeWorkloadProjectionDto = Readonly<{
  employeeId: string;
  employeeName: string;
  bookingsToday: number;
  hoursScheduled: number;
  utilizationPercent: number;
}>;

export type CalendarSlotDto = Readonly<{
  bookingId: string;
  customerName: string;
  startAt: string;
  endAt: string;
  status: string;
  employeeName: string;
}>;

export type CalendarProjectionDto = Readonly<{
  from: string;
  to: string;
  slots: readonly CalendarSlotDto[];
}>;

export type AnalyticsProjectionDto = Readonly<{
  metrics: readonly SummaryCardDto[];
  templateKey: string;
}>;

export type NotificationItemDto = Readonly<{
  id: string;
  title: string;
  message: string;
  priority: string;
  category: string;
  severity: string;
  read: boolean;
  createdAt: string;
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  navigationTarget?: string;
}>;

export type NotificationCenterProjectionDto = Readonly<{
  notifications: readonly NotificationItemDto[];
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}>;

export type WorkspaceSectionDto = Readonly<{
  id: string;
  title: string;
  visible: boolean;
  collapsed: boolean;
}>;

export type WorkspaceProjectionDto = Readonly<{
  entityType: string;
  entityId: string;
  templateKey: string;
  sections: readonly WorkspaceSectionDto[];
  widgets: readonly WidgetProjectionDto[];
}>;

export type SearchResultDto = Readonly<{
  id: string;
  type: string;
  title: string;
  subtitle: string;
  score: number;
}>;
