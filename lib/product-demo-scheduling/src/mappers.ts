import type {
  ProductDemoAvailabilityWindow,
  ProductDemoBooking,
  ProductDemoOffering,
  ProductDemoPresenter,
  ProductDemoSlot,
} from "./types.js";
import type {
  ProductDemoBookingStatus,
  ProductDemoOfferingStatus,
  ProductDemoSlotStatus,
} from "./constants.js";

function str(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function mapOffering(row: Record<string, unknown>): ProductDemoOffering {
  return {
    id: str(row.id),
    companyId: str(row.company_id),
    catalogProductId: str(row.catalog_product_id),
    title: str(row.title),
    durationMinutes: num(row.duration_minutes, 30),
    bufferMinutes: num(row.buffer_minutes, 0),
    timezone: str(row.timezone, "UTC"),
    capacity: num(row.capacity, 1),
    status: str(row.status, "draft") as ProductDemoOfferingStatus,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapPresenter(row: Record<string, unknown>): ProductDemoPresenter {
  return {
    id: str(row.id),
    companyId: str(row.company_id),
    offeringId: str(row.offering_id),
    userId: str(row.user_id),
    isActive: Boolean(row.is_active),
    createdAt: str(row.created_at),
  };
}

export function mapWindow(row: Record<string, unknown>): ProductDemoAvailabilityWindow {
  return {
    id: str(row.id),
    companyId: str(row.company_id),
    offeringId: str(row.offering_id),
    presenterUserId: row.presenter_user_id ? str(row.presenter_user_id) : null,
    weekday: num(row.weekday),
    startTime: str(row.start_time).slice(0, 8),
    endTime: str(row.end_time).slice(0, 8),
    timezone: str(row.timezone, "UTC"),
    isActive: Boolean(row.is_active),
  };
}

export function mapSlot(row: Record<string, unknown>): ProductDemoSlot {
  return {
    id: str(row.id),
    companyId: str(row.company_id),
    offeringId: str(row.offering_id),
    catalogProductId: str(row.catalog_product_id),
    presenterUserId: str(row.presenter_user_id),
    startAt: str(row.start_at),
    endAt: str(row.end_at),
    timezone: str(row.timezone, "UTC"),
    status: str(row.status, "draft") as ProductDemoSlotStatus,
    capacity: num(row.capacity, 1),
    bookedCount: num(row.booked_count, 0),
    publishedAt: row.published_at ? str(row.published_at) : null,
    blockedReason: row.blocked_reason != null ? str(row.blocked_reason) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapBooking(row: Record<string, unknown>): ProductDemoBooking {
  return {
    id: str(row.id),
    companyId: str(row.company_id),
    slotId: str(row.slot_id),
    offeringId: str(row.offering_id),
    catalogProductId: str(row.catalog_product_id),
    presenterUserId: str(row.presenter_user_id),
    customerId: row.customer_id ? str(row.customer_id) : null,
    leadId: row.lead_id ? str(row.lead_id) : null,
    conversationId: row.conversation_id ? str(row.conversation_id) : null,
    startAt: str(row.start_at),
    endAt: str(row.end_at),
    timezone: str(row.timezone, "UTC"),
    status: str(row.status, "confirmed") as ProductDemoBookingStatus,
    clientRequestId: row.client_request_id ? str(row.client_request_id) : null,
    confirmationNumber: row.confirmation_number ? str(row.confirmation_number) : null,
    notes: row.notes != null ? str(row.notes) : null,
    cancelledAt: row.cancelled_at ? str(row.cancelled_at) : null,
    cancelReason: row.cancel_reason != null ? str(row.cancel_reason) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}
