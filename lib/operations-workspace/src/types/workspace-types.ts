import type { Customer360Dto } from "@workspace/customer-360";
import type { AppointmentRecord } from "@workspace/appointment-platform";
import type { OperationsQueueColumnKey, OperationsWorkflowAction } from "../constants.js";

export type OperationsPaymentStatus = "unpaid" | "paid" | "partial" | "unknown";

export type OperationsQueueRow = {
  appointmentId: string;
  appointmentNumber: string;
  customerId: string | null;
  leadId: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  serviceName: string | null;
  serviceId: string | null;
  resourceName: string | null;
  resourceId: string | null;
  branchName: string | null;
  status: string;
  paymentStatus: OperationsPaymentStatus;
  scheduledAt: string;
  endAt: string;
  durationMinutes: number;
  waitingMinutes: number;
  priceCents: number;
  currency: string;
};

export type OperationsKpiHeader = {
  todayAppointments: number;
  waiting: number;
  checkedIn: number;
  paid: number;
  completed: number;
  cancelled: number;
  noShow: number;
  todayRevenueCents: number;
  monthlyRevenueCents: number;
};

export type OperationsGlobalSearchResult = {
  kind: "customer" | "lead" | "appointment";
  id: string;
  label: string;
  subtitle: string | null;
  phone: string | null;
};

export type OperationsSelectedRecord = {
  appointment: AppointmentRecord | null;
  queueRow: OperationsQueueRow | null;
  customer360: Customer360Dto | null;
};

export type OperationsWorkspaceContext = {
  userId: string | null;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type OperationsQueueViewState = {
  columns: OperationsQueueColumnKey[];
  filters: Record<string, unknown>;
  sorting: { column: OperationsQueueColumnKey; direction: "asc" | "desc" };
  density: "compact" | "comfortable" | "spacious";
  grouping: string | null;
};

export type OperationsWorkflowActionDescriptor = {
  action: OperationsWorkflowAction;
  labelKey: string;
  permission: string;
  enabled: boolean;
};
