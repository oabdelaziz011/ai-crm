import type { SupabaseClient } from "@supabase/supabase-js";
import { ProductDemoConflictError, ProductDemoValidationError } from "../errors.js";
import {
  mapBooking,
  mapOffering,
  mapPresenter,
  mapSlot,
  mapWindow,
} from "../mappers.js";
import type {
  CreateOfferingInput,
  CreateSlotInput,
  ProductDemoRepository,
} from "./product-demo-repository-port.js";

const OVERLAP_SLOT_STATUSES = ["draft", "published", "booked", "blocked"] as const;

function asRow(data: unknown): Record<string, unknown> {
  return data as Record<string, unknown>;
}

function applyStatusFilter<T extends { eq: (col: string, val: string) => T; in: (col: string, vals: string[]) => T }>(
  query: T,
  column: string,
  status: string | string[] | undefined,
): T {
  if (status == null) return query;
  if (Array.isArray(status)) {
    if (!status.length) return query;
    return query.in(column, status);
  }
  return query.eq(column, status);
}

function mapReserveSlotError(error: { message?: string }): never {
  const msg = String(error.message ?? "");
  if (msg.includes("PRODUCT_DEMO_SLOT_NOT_FOUND")) {
    throw new ProductDemoValidationError("Product demo slot not found.", "PRODUCT_DEMO_SLOT_NOT_FOUND");
  }
  if (msg.includes("PRODUCT_DEMO_SLOT_NOT_BOOKABLE")) {
    throw new ProductDemoConflictError(
      "Product demo slot is not bookable.",
      "PRODUCT_DEMO_SLOT_NOT_BOOKABLE",
    );
  }
  if (msg.includes("PRODUCT_DEMO_SLOT_EXPIRED")) {
    throw new ProductDemoValidationError("Product demo slot has expired.", "PRODUCT_DEMO_SLOT_EXPIRED");
  }
  if (msg.includes("PRODUCT_DEMO_SLOT_FULL")) {
    throw new ProductDemoConflictError("Product demo slot is full.", "PRODUCT_DEMO_SLOT_FULL");
  }
  throw error;
}

export function createSupabaseProductDemoRepository(client: SupabaseClient): ProductDemoRepository {
  const repo: ProductDemoRepository = {
    async getCatalogProductInCompany(companyId, productId) {
      const { data, error } = await client
        .from("catalog_products")
        .select("id, company_id, name, is_active")
        .eq("company_id", companyId)
        .eq("id", productId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        name: String(data.name ?? ""),
        isActive: Boolean(data.is_active),
      };
    },

    async getUserInCompany(companyId, userId) {
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
      const { data, error } = await client
        .from("profiles")
        .select("id, user_id, company_id")
        .eq("company_id", companyId)
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      const authUserId = row.user_id ? String(row.user_id) : String(row.id);
      return {
        id: authUserId,
        companyId: String(row.company_id),
      };
    },

    async getOffering(companyId, offeringId) {
      const { data, error } = await client
        .from("product_demo_offerings")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", offeringId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapOffering(asRow(data)) : null;
    },

    async getOfferingByProduct(companyId, catalogProductId) {
      const { data, error } = await client
        .from("product_demo_offerings")
        .select("*")
        .eq("company_id", companyId)
        .eq("catalog_product_id", catalogProductId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapOffering(asRow(data)) : null;
    },

    async listOfferings(companyId, input) {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      let query = client
        .from("product_demo_offerings")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (input?.status) query = query.eq("status", input.status);

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []).map((row) => mapOffering(asRow(row))),
        total: count ?? 0,
      };
    },

    async createOffering(input: CreateOfferingInput) {
      const { data, error } = await client
        .from("product_demo_offerings")
        .insert({
          company_id: input.companyId,
          catalog_product_id: input.catalogProductId,
          title: input.title ?? "",
          duration_minutes: input.durationMinutes,
          buffer_minutes: input.bufferMinutes ?? 0,
          timezone: input.timezone,
          capacity: input.capacity ?? 1,
          status: "draft",
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapOffering(asRow(data));
    },

    async updateOffering(companyId, offeringId, patch) {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.durationMinutes !== undefined) payload.duration_minutes = patch.durationMinutes;
      if (patch.bufferMinutes !== undefined) payload.buffer_minutes = patch.bufferMinutes;
      if (patch.timezone !== undefined) payload.timezone = patch.timezone;
      if (patch.capacity !== undefined) payload.capacity = patch.capacity;
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.updatedBy !== undefined) payload.updated_by = patch.updatedBy;

      const { data, error } = await client
        .from("product_demo_offerings")
        .update(payload)
        .eq("company_id", companyId)
        .eq("id", offeringId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapOffering(asRow(data));
    },

    async listPresenters(companyId, offeringId) {
      const { data, error } = await client
        .from("product_demo_presenters")
        .select("*")
        .eq("company_id", companyId)
        .eq("offering_id", offeringId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapPresenter(asRow(row)));
    },

    async upsertPresenter(input) {
      const { data, error } = await client
        .from("product_demo_presenters")
        .upsert(
          {
            company_id: input.companyId,
            offering_id: input.offeringId,
            user_id: input.userId,
            is_active: input.isActive ?? true,
            created_by: input.createdBy,
          },
          { onConflict: "offering_id,user_id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return mapPresenter(asRow(data));
    },

    async setPresenterActive(companyId, offeringId, userId, isActive) {
      const { error } = await client
        .from("product_demo_presenters")
        .update({ is_active: isActive })
        .eq("company_id", companyId)
        .eq("offering_id", offeringId)
        .eq("user_id", userId);
      if (error) throw error;
    },

    async listWindows(companyId, offeringId) {
      const { data, error } = await client
        .from("product_demo_availability_windows")
        .select("*")
        .eq("company_id", companyId)
        .eq("offering_id", offeringId)
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapWindow(asRow(row)));
    },

    async upsertWindow(input) {
      const { data, error } = await client
        .from("product_demo_availability_windows")
        .insert({
          company_id: input.companyId,
          offering_id: input.offeringId,
          presenter_user_id: input.presenterUserId ?? null,
          weekday: input.weekday,
          start_time: input.startTime,
          end_time: input.endTime,
          timezone: input.timezone,
          is_active: input.isActive ?? true,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapWindow(asRow(data));
    },

    async saveWeekdayWindow(input) {
      const now = new Date().toISOString();
      const { data: existing, error: listError } = await client
        .from("product_demo_availability_windows")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("offering_id", input.offeringId)
        .eq("weekday", input.weekday);
      if (listError) throw listError;
      const patch = {
        presenter_user_id: input.presenterUserId ?? null,
        start_time: input.startTime,
        end_time: input.endTime,
        timezone: input.timezone,
        is_active: true,
        updated_by: input.createdBy,
        updated_at: now,
      };
      if ((existing ?? []).length) {
        const { data, error } = await client
          .from("product_demo_availability_windows")
          .update(patch)
          .eq("company_id", input.companyId)
          .eq("offering_id", input.offeringId)
          .eq("weekday", input.weekday)
          .select("*");
        if (error) throw error;
        const row = (data ?? [])[0];
        if (!row) throw new Error("weekday window update returned no row");
        return mapWindow(asRow(row));
      }
      const { data, error } = await client
        .from("product_demo_availability_windows")
        .insert({
          company_id: input.companyId,
          offering_id: input.offeringId,
          weekday: input.weekday,
          created_by: input.createdBy,
          ...patch,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapWindow(asRow(data));
    },

    async deactivateWeekday(input) {
      const { error } = await client
        .from("product_demo_availability_windows")
        .update({
          is_active: false,
          updated_by: input.updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", input.companyId)
        .eq("offering_id", input.offeringId)
        .eq("weekday", input.weekday);
      if (error) throw error;
    },

    async getSlot(companyId, slotId) {
      const { data, error } = await client
        .from("product_demo_slots")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", slotId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSlot(asRow(data)) : null;
    },

    async listSlots(companyId, input) {
      let query = client
        .from("product_demo_slots")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("start_at", { ascending: true })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.offeringId) query = query.eq("offering_id", input.offeringId);
      if (input.catalogProductId) query = query.eq("catalog_product_id", input.catalogProductId);
      query = applyStatusFilter(query, "status", input.status);
      if (input.from) query = query.gte("start_at", input.from);
      if (input.to) query = query.lte("start_at", input.to);

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []).map((row) => mapSlot(asRow(row))),
        total: count ?? 0,
      };
    },

    async createSlot(input: CreateSlotInput) {
      const status = input.status ?? "draft";
      const { data, error } = await client
        .from("product_demo_slots")
        .insert({
          company_id: input.companyId,
          offering_id: input.offeringId,
          catalog_product_id: input.catalogProductId,
          presenter_user_id: input.presenterUserId,
          start_at: input.startAt,
          end_at: input.endAt,
          timezone: input.timezone,
          capacity: input.capacity,
          status,
          booked_count: 0,
          published_at: status === "published" ? new Date().toISOString() : null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapSlot(asRow(data));
    },

    async updateSlotStatus(companyId, slotId, status, patch) {
      const payload: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (patch?.blockedReason !== undefined) payload.blocked_reason = patch.blockedReason;
      if (patch?.publishedAt !== undefined) payload.published_at = patch.publishedAt;
      if (patch?.updatedBy !== undefined) payload.updated_by = patch.updatedBy;
      if (status === "published" && patch?.publishedAt === undefined) {
        payload.published_at = new Date().toISOString();
      }

      const { data, error } = await client
        .from("product_demo_slots")
        .update(payload)
        .eq("company_id", companyId)
        .eq("id", slotId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapSlot(asRow(data));
    },

    async findPresenterOverlap(input) {
      let query = client
        .from("product_demo_slots")
        .select("id", { count: "exact", head: true })
        .eq("company_id", input.companyId)
        .eq("presenter_user_id", input.presenterUserId)
        .is("deleted_at", null)
        .in("status", [...OVERLAP_SLOT_STATUSES])
        .lt("start_at", input.endAt)
        .gt("end_at", input.startAt);
      if (input.excludeSlotId) query = query.neq("id", input.excludeSlotId);

      const { count, error } = await query;
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async listBookings(companyId, input) {
      let query = client
        .from("product_demo_bookings")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("start_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.catalogProductId) query = query.eq("catalog_product_id", input.catalogProductId);
      if (input.customerId) query = query.eq("customer_id", input.customerId);
      if (input.leadId) query = query.eq("lead_id", input.leadId);
      if (input.presenterUserId) query = query.eq("presenter_user_id", input.presenterUserId);
      query = applyStatusFilter(query, "status", input.status);
      if (input.from) query = query.gte("start_at", input.from);
      if (input.to) query = query.lte("start_at", input.to);
      if (input.query?.trim()) {
        const q = `%${input.query.trim()}%`;
        query = query.or(
          `confirmation_number.ilike.${q},notes.ilike.${q},client_request_id.ilike.${q}`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []).map((row) => mapBooking(asRow(row))),
        total: count ?? 0,
      };
    },

    async getBooking(companyId, bookingId) {
      const { data, error } = await client
        .from("product_demo_bookings")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", bookingId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBooking(asRow(data)) : null;
    },

    async getBookingByClientRequestId(companyId, clientRequestId) {
      const { data, error } = await client
        .from("product_demo_bookings")
        .select("*")
        .eq("company_id", companyId)
        .eq("client_request_id", clientRequestId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBooking(asRow(data)) : null;
    },

    async reserveSlot(input) {
      const { data, error } = await client.rpc("product_demo_reserve_slot", {
        p_company_id: input.companyId,
        p_slot_id: input.slotId,
        p_customer_id: input.customerId,
        p_lead_id: input.leadId,
        p_conversation_id: input.conversationId,
        p_notes: input.notes,
        p_client_request_id: input.clientRequestId,
        p_actor_user_id: input.actorUserId,
      });
      if (error) mapReserveSlotError(error);
      return mapBooking(asRow(data));
    },

    async cancelBooking(input) {
      const existing = await repo.getBooking(input.companyId, input.bookingId);
      if (!existing) {
        throw new ProductDemoValidationError("Booking not found.", "PRODUCT_DEMO_BOOKING_NOT_FOUND");
      }
      if (existing.status === "cancelled") {
        return existing;
      }

      const now = new Date().toISOString();
      const { data, error } = await client
        .from("product_demo_bookings")
        .update({
          status: "cancelled",
          cancelled_at: now,
          cancel_reason: input.reason,
          updated_by: input.actorUserId,
          updated_at: now,
        })
        .eq("company_id", input.companyId)
        .eq("id", input.bookingId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;

      const slot = await repo.getSlot(input.companyId, existing.slotId);
      if (slot) {
        const nextBookedCount = Math.max(0, slot.bookedCount - 1);
        const slotPatch: Record<string, unknown> = {
          booked_count: nextBookedCount,
          updated_at: now,
          updated_by: input.actorUserId,
        };
        if (slot.status === "booked" && nextBookedCount < slot.capacity) {
          slotPatch.status = "published";
        }
        const { error: slotError } = await client
          .from("product_demo_slots")
          .update(slotPatch)
          .eq("company_id", input.companyId)
          .eq("id", slot.id)
          .is("deleted_at", null);
        if (slotError) throw slotError;
      }

      await repo.addHistory({
        companyId: input.companyId,
        bookingId: input.bookingId,
        eventType: "cancelled",
        summary: input.reason?.trim() ? `Booking cancelled: ${input.reason}` : "Booking cancelled",
        payload: { reason: input.reason, slotId: existing.slotId },
        actorUserId: input.actorUserId,
      });

      return mapBooking(asRow(data));
    },

    async addHistory(input) {
      const { error } = await client.from("product_demo_booking_history").insert({
        company_id: input.companyId,
        booking_id: input.bookingId,
        event_type: input.eventType,
        summary: input.summary,
        payload: input.payload ?? {},
        actor_user_id: input.actorUserId,
      });
      if (error) throw error;
    },
  };

  return repo;
}
