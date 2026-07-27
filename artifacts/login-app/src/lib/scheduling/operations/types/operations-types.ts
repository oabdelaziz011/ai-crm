import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import type { OperationsCapacityMetrics, OperationsAdvancedKpis, ResourceUtilizationRow } from "@/lib/scheduling/operations/analytics";
import type { WaitingQueueEntry } from "@/lib/scheduling/operations/queue";

/** Visual slot kind for the operations timeline. */
export type OperationsTimelineSlotKind =
  | "booked"
  | "available"
  | "checked_in"
  | "completed"
  | "cancelled";

export type OperationsPaymentStatus = "unpaid" | "paid" | "partial" | "unknown";

export type OperationsBookingView = {
  id: string;
  companyId: string;
  branchId: string | null;
  customerId: string;
  resourceId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: SchedulingBookingStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  service: { id: string; name: string; durationMinutes: number; priceCents: number } | null;
  resource: { id: string; name: string; type: string } | null;
  branch: { id: string; name: string } | null;
  paymentStatus: OperationsPaymentStatus;
  displayStart: string;
  displayEnd: string;
  durationMinutes: number;
};

export type OperationsTimelineSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  kind: OperationsTimelineSlotKind;
  booking: OperationsBookingView | null;
  resourceId: string | null;
  resourceName: string | null;
};

export type OperationsKpiSnapshot = {
  bookings: number;
  availableSlots: number;
  cancelled: number;
  completed: number;
  checkedIn: number;
  occupancyPercent: number;
  expectedRevenueCents: number;
  actualRevenueCents: number;
};

export type OperationsDailyStats = {
  totalBookings: number;
  completed: number;
  cancelled: number;
  noShow: number;
  available: number;
  occupancyPercent: number;
  revenueCents: number;
  averageDurationMinutes: number;
  averageWaitingMinutes: number;
};

export type OperationsDayData = {
  date: string;
  timezone: string;
  bookings: OperationsBookingView[];
  timelineSlots: OperationsTimelineSlot[];
  kpis: OperationsKpiSnapshot;
  dailyStats: OperationsDailyStats;
  capacity: OperationsCapacityMetrics;
  resourceUtilization: ResourceUtilizationRow[];
  advancedKpis: OperationsAdvancedKpis;
  waitingQueue: WaitingQueueEntry[];
};

export const OPERATIONS_CANCELLATION_REASONS = [
  "customer_request",
  "doctor_unavailable",
  "clinic_closed",
  "no_show",
  "other",
] as const;

export type OperationsCancellationReason = (typeof OPERATIONS_CANCELLATION_REASONS)[number];

export type CancelBookingWithReasonInput = {
  bookingId: string;
  customerId?: string | null;
  reason: OperationsCancellationReason;
  notes?: string | null;
};
