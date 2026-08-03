import type { SchedulingBooking, SchedulingBookingSource, SchedulingBookingStatus } from "@workspace/scheduling-engine";

export type AppointmentStatus = SchedulingBookingStatus;
export type AppointmentSource = SchedulingBookingSource;

export type AppointmentRecord = {
  id: string;
  companyId: string;
  branchId: string | null;
  customerId: string;
  leadId: string | null;
  conversationId: string | null;
  resourceId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  notes: string | null;
  rescheduledFromId: string | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AppointmentSummary = Pick<
  AppointmentRecord,
  | "id"
  | "companyId"
  | "customerId"
  | "leadId"
  | "conversationId"
  | "resourceId"
  | "serviceId"
  | "startAt"
  | "endAt"
  | "status"
  | "source"
>;

export type AppointmentServiceContext = {
  userId: string | null;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type AppointmentMetricsSnapshot = {
  upcoming: number;
  completedInPeriod: number;
  cancelledInPeriod: number;
  noShowInPeriod: number;
  createdInPeriod: number;
  createdPreviousPeriod: number;
  averageDurationMinutes: number;
  resourceUtilizationPercent: number;
};

export type AppointmentSearchFilters = {
  companyId: string;
  customerId?: string;
  leadId?: string;
  conversationId?: string;
  resourceId?: string;
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  query?: string;
  limit?: number;
  offset?: number;
};

export function mapSchedulingBookingToAppointment(row: SchedulingBooking & {
  lead_id?: string | null;
  conversation_id?: string | null;
}): AppointmentRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    leadId: row.lead_id ?? null,
    conversationId: row.conversation_id ?? null,
    resourceId: row.resource_id,
    serviceId: row.service_id,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    status: row.status,
    source: row.source,
    notes: row.notes,
    rescheduledFromId: row.rescheduled_from_id,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function toAppointmentSummary(record: AppointmentRecord): AppointmentSummary {
  return {
    id: record.id,
    companyId: record.companyId,
    customerId: record.customerId,
    leadId: record.leadId,
    conversationId: record.conversationId,
    resourceId: record.resourceId,
    serviceId: record.serviceId,
    startAt: record.startAt,
    endAt: record.endAt,
    status: record.status,
    source: record.source,
  };
}

export type SchedulingBookingRow = SchedulingBooking & {
  lead_id?: string | null;
  conversation_id?: string | null;
};
