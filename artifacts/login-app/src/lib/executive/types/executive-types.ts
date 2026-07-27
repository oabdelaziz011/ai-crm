import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ForecastHorizon,
  ForecastType,
  ReportKind,
  ReportPeriod,
  TimelineEventType,
  TrendDirection,
} from "@/lib/executive/types/executive-enums";

export type MetricWithTrend = {
  value: number;
  previousValue: number;
  trend: TrendDirection;
  changePercent: number;
};

export type ExecutiveSummary = {
  todayRevenueCents: number;
  monthlyRevenueCents: number;
  annualRevenueCents: number;
  bookingsToday: number;
  completedToday: number;
  cancelledToday: number;
  noShowsToday: number;
  outstandingBalanceCents: number;
  cashCollectedCents: number;
  averageInvoiceCents: number;
  satisfactionScore: number | null;
  trends: {
    revenue: TrendDirection;
    bookings: TrendDirection;
  };
};

export type OperationalKpis = {
  appointments: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  averageWaitingMinutes: number;
  averageVisitDurationMinutes: number;
  peakHour: string | null;
  capacityUtilization: number;
  doctorOccupancy: number;
  roomOccupancy: number;
  equipmentUtilization: number;
};

export type FinancialKpis = {
  revenueCents: number;
  profitCents: number | null;
  revenuePerDoctorCents: number;
  revenuePerBranchCents: number;
  revenuePerServiceCents: number;
  outstandingInvoicesCents: number;
  refundRate: number;
  averagePaymentTimeHours: number;
  taxCollectedCents: number;
  collectionsCents: number;
  providerBreakdown: Array<{ provider: string; amountCents: number }>;
};

export type CustomerKpis = {
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
  churnRate: number | null;
  lifetimeValueCents: number | null;
  repeatBookingPercent: number;
  averageCustomerAgeYears: number | null;
  customerGrowthPercent: number;
  marketingOptInPercent: number;
  portalUsageCount: number;
};

export type CommunicationKpis = {
  whatsappDelivered: number;
  emailDelivered: number;
  failedMessages: number;
  openRate: number | null;
  reminderSuccessRate: number;
  deliverySuccessRate: number;
  averageResponseMinutes: number | null;
};

export type BranchIntelligenceRow = {
  branchId: string;
  branchName: string;
  revenueCents: number;
  bookings: number;
  occupancy: number;
  averageWaitMinutes: number;
  averageRating: number | null;
  staffUtilization: number;
  ranking: number;
  healthScore: number;
};

export type DoctorIntelligenceRow = {
  resourceId: string;
  resourceName: string;
  revenueCents: number;
  appointments: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  averageDelayMinutes: number;
  patientLoad: number;
  utilization: number;
  ranking: number;
};

export type ExecutiveAlert = {
  id: string;
  companyId: string;
  branchId: string | null;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metricKey: string | null;
  metricValue: number | null;
  thresholdValue: number | null;
  status: AlertStatus;
  createdAt: string;
};

export type ForecastPoint = {
  date: string;
  value: number;
};

export type ForecastResult = {
  horizonDays: ForecastHorizon;
  forecastType: ForecastType;
  points: ForecastPoint[];
  growthTrendPercent: number;
  requiredCapacity: number | null;
  peakHours: string[];
};

export type ExecutiveTimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type ExecutiveDashboardSnapshot = {
  summary: ExecutiveSummary;
  operational: OperationalKpis;
  financial: FinancialKpis;
  customer: CustomerKpis;
  communication: CommunicationKpis;
  branches: BranchIntelligenceRow[];
  doctors: DoctorIntelligenceRow[];
  alerts: ExecutiveAlert[];
  forecasts: ForecastResult[];
  timeline: ExecutiveTimelineEvent[];
  generatedAt: string;
};

export type ExecutiveReportRequest = {
  companyId: string;
  kind: ReportKind;
  period: ReportPeriod;
  branchId?: string | null;
  resourceId?: string | null;
};

export type ExecutiveReport = {
  title: string;
  kind: ReportKind;
  period: ReportPeriod;
  generatedAt: string;
  sections: Array<{ heading: string; metrics: Record<string, string | number> }>;
};

export type QuickAction = {
  id: string;
  labelKey: string;
  path: string;
  icon: string;
};

export type ExecutiveContext = {
  companyId: string;
  branchId?: string | null;
  timezone: string;
  date: string;
};

export type RawExecutiveData = {
  financialMetrics: {
    dailyCents: number;
    monthlyCents: number;
    yearlyCents: number;
    outstandingCents: number;
    refundCents: number;
    averageInvoiceCents: number;
    invoiceCount: number;
    paymentCount: number;
  };
  communicationStats: {
    sentToday: number;
    delivered: number;
    queued: number;
    failed: number;
    retrying: number;
  };
  portalAnalytics: {
    portalVisits: number;
    bookingConversionRate: number;
    onlineBookingPercent: number;
    cancellationRate: number;
  };
  bookingsToday: Array<{
    id: string;
    status: string;
    branchId: string | null;
    resourceId: string;
    resourceName: string;
    branchName: string | null;
    serviceId: string;
    startAt: string;
    endAt: string;
    priceCents: number;
    checkedInAt?: string | null;
  }>;
  bookingsHistory: Array<{ date: string; count: number; revenueCents: number }>;
  customers: { total: number; newThisMonth: number; returning: number };
  branches: Array<{ id: string; name: string }>;
  paymentsTodayCents: number;
  taxCollectedCents: number;
  providerBreakdown: Array<{ provider: string; amountCents: number }>;
};
