import type { LookupState } from "./types.js";

export function buildLookupVariablePatch(state: LookupState): { lookup: LookupState } {
  return {
    lookup: {
      status: state.status,
      count: state.count,
    },
  };
}

export function buildCustomerEntityFields(input: {
  exists: boolean;
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  type?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}): { customer: Record<string, unknown> } {
  return {
    customer: {
      exists: input.exists,
      id: input.id ?? null,
      name: input.name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      age: input.age ?? null,
      gender: input.gender ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? null,
      type: input.type ?? null,
      created_at: input.createdAt ?? null,
      updated_at: input.updatedAt ?? null,
    },
  };
}

export function buildEmptyCustomerEntityFields(): { customer: Record<string, unknown> } {
  return buildCustomerEntityFields({ exists: false });
}

export function buildBookingEntityFields(input: {
  exists: boolean;
  id?: string | null;
  customerId?: string | null;
  service?: string | null;
  doctorId?: string | null;
  locationId?: string | null;
  bookingDate?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  status?: string | null;
}): { booking: Record<string, unknown> } {
  return {
    booking: {
      exists: input.exists,
      id: input.id ?? null,
      customer_id: input.customerId ?? null,
      service: input.service ?? null,
      doctor_id: input.doctorId ?? null,
      location_id: input.locationId ?? null,
      booking_date: input.bookingDate ?? null,
      duration_minutes: input.durationMinutes ?? null,
      notes: input.notes ?? null,
      status: input.status ?? null,
    },
  };
}

export function buildEmptyBookingEntityFields(): { booking: Record<string, unknown> } {
  return buildBookingEntityFields({ exists: false });
}
