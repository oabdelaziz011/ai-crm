import { PRODUCT_DEMO_PERMISSIONS } from "../constants.js";
import {
  ProductDemoConflictError,
  ProductDemoPermissionError,
  ProductDemoValidationError,
} from "../errors.js";
import type { ProductDemoRepository } from "../repositories/product-demo-repository-port.js";
import type {
  ProductDemoBooking,
  ProductDemoOffering,
  ProductDemoPresenter,
  ProductDemoServiceContext,
  ProductDemoSlot,
} from "../types.js";
import { generateSlotCandidates } from "./slot-generation.js";

function assertCompany(ctx: ProductDemoServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new ProductDemoPermissionError("tenant");
  }
}

function assertPermission(ctx: ProductDemoServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new ProductDemoPermissionError(code);
}

function assertActor(ctx: ProductDemoServiceContext): string | null {
  return ctx.userId;
}

export class ProductDemoCommandService {
  constructor(private readonly deps: { demos: ProductDemoRepository }) {}

  async upsertOffering(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      catalogProductId: string;
      title?: string;
      durationMinutes?: number;
      bufferMinutes?: number;
      timezone?: string;
      capacity?: number;
    },
  ): Promise<ProductDemoOffering> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const product = await this.deps.demos.getCatalogProductInCompany(
      input.companyId,
      input.catalogProductId,
    );
    if (!product || !product.isActive) {
      throw new ProductDemoValidationError(
        "catalogProductId must reference an active product in this company.",
        "product_not_in_company",
      );
    }
    const existing = await this.deps.demos.getOfferingByProduct(
      input.companyId,
      input.catalogProductId,
    );
    if (existing) {
      return this.deps.demos.updateOffering(input.companyId, existing.id, {
        title: input.title ?? (existing.title || product.name),
        durationMinutes: input.durationMinutes ?? existing.durationMinutes,
        bufferMinutes: input.bufferMinutes ?? existing.bufferMinutes,
        timezone: input.timezone ?? existing.timezone,
        capacity: input.capacity ?? existing.capacity,
        updatedBy: assertActor(ctx),
      });
    }
    return this.deps.demos.createOffering({
      companyId: input.companyId,
      catalogProductId: input.catalogProductId,
      title: input.title?.trim() || product.name,
      durationMinutes: input.durationMinutes ?? 30,
      bufferMinutes: input.bufferMinutes ?? 0,
      timezone: input.timezone ?? "UTC",
      capacity: input.capacity ?? 1,
      createdBy: assertActor(ctx),
    });
  }

  async setOfferingStatus(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; offeringId: string; status: ProductDemoOffering["status"] },
  ): Promise<ProductDemoOffering> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const offering = await this.deps.demos.getOffering(input.companyId, input.offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    if (input.status === "published") {
      const presenters = await this.deps.demos.listPresenters(input.companyId, offering.id);
      if (!presenters.some((p) => p.isActive)) {
        throw new ProductDemoValidationError(
          "Assign at least one active presenter before publishing the offering.",
          "presenter_required",
        );
      }
    }
    return this.deps.demos.updateOffering(input.companyId, offering.id, {
      status: input.status,
      updatedBy: assertActor(ctx),
    });
  }

  async assignPresenter(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; offeringId: string; userId: string; isActive?: boolean },
  ): Promise<ProductDemoPresenter> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const offering = await this.deps.demos.getOffering(input.companyId, input.offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    const user = await this.deps.demos.getUserInCompany(input.companyId, input.userId);
    if (!user) {
      throw new ProductDemoValidationError(
        "Presenter must be a user in the same company.",
        "presenter_not_in_company",
      );
    }
    const assigned = await this.deps.demos.upsertPresenter({
      companyId: input.companyId,
      offeringId: offering.id,
      userId: user.id,
      isActive: input.isActive ?? true,
      createdBy: assertActor(ctx),
    });
    if (input.isActive !== false) {
      const presenters = await this.deps.demos.listPresenters(input.companyId, offering.id);
      for (const presenter of presenters) {
        if (presenter.userId !== user.id && presenter.isActive) {
          await this.deps.demos.setPresenterActive(
            input.companyId,
            offering.id,
            presenter.userId,
            false,
          );
        }
      }
    }
    return assigned;
  }

  async addAvailabilityWindow(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      offeringId: string;
      presenterUserId?: string | null;
      weekday: number;
      startTime: string;
      endTime: string;
      timezone?: string;
    },
  ) {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const offering = await this.deps.demos.getOffering(input.companyId, input.offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    if (input.weekday < 0 || input.weekday > 6) {
      throw new ProductDemoValidationError("weekday must be 0-6.", "invalid_weekday");
    }
    if (input.presenterUserId) {
      const presenters = await this.deps.demos.listPresenters(input.companyId, offering.id);
      if (!presenters.some((p) => p.userId === input.presenterUserId && p.isActive)) {
        throw new ProductDemoValidationError(
          "Window presenter must be an active assigned presenter for this product.",
          "presenter_not_assigned",
        );
      }
    }
    return this.deps.demos.upsertWindow({
      companyId: input.companyId,
      offeringId: offering.id,
      presenterUserId: input.presenterUserId ?? null,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone ?? offering.timezone,
      isActive: true,
      createdBy: assertActor(ctx),
    });
  }

  /**
   * Mark one weekday as a work day (one active window) or an off day.
   * Work days require an active presenter so later slot generation can run.
   */
  async setWeekdayAvailability(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      offeringId: string;
      weekday: number;
      isWorkDay: boolean;
      startTime?: string;
      endTime?: string;
      presenterUserId?: string | null;
      timezone?: string;
    },
  ) {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const offering = await this.deps.demos.getOffering(input.companyId, input.offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    if (input.weekday < 0 || input.weekday > 6) {
      throw new ProductDemoValidationError("weekday must be 0-6.", "invalid_weekday");
    }
    const actor = assertActor(ctx);
    if (!input.isWorkDay) {
      await this.deps.demos.deactivateWeekday({
        companyId: input.companyId,
        offeringId: offering.id,
        weekday: input.weekday,
        updatedBy: actor,
      });
      return { weekday: input.weekday, isWorkDay: false as const };
    }
    const startTime = String(input.startTime ?? "").trim();
    const endTime = String(input.endTime ?? "").trim();
    if (!startTime || !endTime || endTime <= startTime) {
      throw new ProductDemoValidationError(
        "Work day needs an end time after the start time.",
        "invalid_window",
      );
    }
    if (!input.presenterUserId) {
      throw new ProductDemoValidationError(
        "Assign a presenter before marking a work day.",
        "presenter_required",
      );
    }
    const presenters = await this.deps.demos.listPresenters(input.companyId, offering.id);
    if (!presenters.some((p) => p.userId === input.presenterUserId && p.isActive)) {
      throw new ProductDemoValidationError(
        "Window presenter must be an active assigned presenter for this product.",
        "presenter_not_assigned",
      );
    }
    const window = await this.deps.demos.saveWeekdayWindow({
      companyId: input.companyId,
      offeringId: offering.id,
      presenterUserId: input.presenterUserId,
      weekday: input.weekday,
      startTime,
      endTime,
      timezone: input.timezone ?? offering.timezone,
      createdBy: actor,
    });
    return { weekday: input.weekday, isWorkDay: true as const, window };
  }

  /**
   * Generate draft slots from availability windows, then optionally publish them.
   * Skips candidates that conflict with an existing presenter slot.
   */
  async generateAndPublishSlots(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      offeringId: string;
      daysAhead?: number;
      publish?: boolean;
      fromDate?: string;
      dates?: string[];
    },
  ): Promise<{ created: number; published: number; skippedConflicts: number; slots: ProductDemoSlot[] }> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const offering = await this.deps.demos.getOffering(input.companyId, input.offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    const presenters = (await this.deps.demos.listPresenters(input.companyId, offering.id)).filter(
      (p) => p.isActive,
    );
    if (!presenters.length) {
      throw new ProductDemoValidationError("No active presenters assigned.", "presenter_required");
    }
    const windows = await this.deps.demos.listWindows(input.companyId, offering.id);
    const dates = (input.dates ?? [])
      .map((value) => value.trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    if (dates.length > 62) {
      throw new ProductDemoValidationError("Choose at most 62 dates.", "too_many_dates");
    }
    const fromDate = input.fromDate ? new Date(input.fromDate) : new Date();
    const candidates = generateSlotCandidates({
      windows,
      presenterUserIds: presenters.map((p) => p.userId),
      durationMinutes: offering.durationMinutes,
      bufferMinutes: offering.bufferMinutes,
      fromDate,
      daysAhead: dates.length ? dates.length : Math.min(62, input.daysAhead ?? 14),
      dates: dates.length ? dates : undefined,
      timezone: offering.timezone,
    });

    const created: ProductDemoSlot[] = [];
    let skippedConflicts = 0;
    let published = 0;
    const publish = Boolean(input.publish);

    for (const candidate of candidates) {
      const overlaps = await this.deps.demos.findPresenterOverlap({
        companyId: input.companyId,
        presenterUserId: candidate.presenterUserId,
        startAt: candidate.startAt.toISOString(),
        endAt: candidate.endAt.toISOString(),
      });
      if (overlaps) {
        skippedConflicts += 1;
        continue;
      }
      let slot = await this.deps.demos.createSlot({
        companyId: input.companyId,
        offeringId: offering.id,
        catalogProductId: offering.catalogProductId,
        presenterUserId: candidate.presenterUserId,
        startAt: candidate.startAt.toISOString(),
        endAt: candidate.endAt.toISOString(),
        timezone: candidate.timezone,
        capacity: offering.capacity,
        status: publish ? "published" : "draft",
        createdBy: assertActor(ctx),
      });
      if (publish && slot.status !== "published") {
        slot = await this.deps.demos.updateSlotStatus(input.companyId, slot.id, "published", {
          publishedAt: new Date().toISOString(),
          updatedBy: assertActor(ctx),
        });
      }
      if (slot.status === "published") published += 1;
      created.push(slot);
    }

    return { created: created.length, published, skippedConflicts, slots: created };
  }

  async publishSlot(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; slotId: string },
  ): Promise<ProductDemoSlot> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const slot = await this.deps.demos.getSlot(input.companyId, input.slotId);
    if (!slot) throw new ProductDemoValidationError("Slot not found.", "not_found");
    if (slot.status === "cancelled" || slot.status === "booked") {
      throw new ProductDemoConflictError(`Cannot publish a ${slot.status} slot.`, "invalid_status");
    }
    const presenters = await this.deps.demos.listPresenters(input.companyId, slot.offeringId);
    if (!presenters.some((p) => p.userId === slot.presenterUserId && p.isActive)) {
      throw new ProductDemoValidationError(
        "Slot presenter is not an active assigned presenter for this product.",
        "presenter_not_assigned",
      );
    }
    const overlaps = await this.deps.demos.findPresenterOverlap({
      companyId: input.companyId,
      presenterUserId: slot.presenterUserId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      excludeSlotId: slot.id,
    });
    if (overlaps) {
      throw new ProductDemoConflictError(
        "Presenter already has a conflicting demo slot.",
        "presenter_conflict",
      );
    }
    return this.deps.demos.updateSlotStatus(input.companyId, slot.id, "published", {
      publishedAt: new Date().toISOString(),
      blockedReason: null,
      updatedBy: assertActor(ctx),
    });
  }

  async unpublishSlot(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; slotId: string },
  ): Promise<ProductDemoSlot> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const slot = await this.deps.demos.getSlot(input.companyId, input.slotId);
    if (!slot) throw new ProductDemoValidationError("Slot not found.", "not_found");
    if (slot.bookedCount > 0) {
      throw new ProductDemoConflictError("Cannot unpublish a slot with bookings.", "has_bookings");
    }
    return this.deps.demos.updateSlotStatus(input.companyId, slot.id, "draft", {
      publishedAt: null,
      updatedBy: assertActor(ctx),
    });
  }

  async blockSlot(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; slotId: string; reason?: string },
  ): Promise<ProductDemoSlot> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const slot = await this.deps.demos.getSlot(input.companyId, input.slotId);
    if (!slot) throw new ProductDemoValidationError("Slot not found.", "not_found");
    if (slot.bookedCount > 0) {
      throw new ProductDemoConflictError("Cannot block a slot with bookings.", "has_bookings");
    }
    return this.deps.demos.updateSlotStatus(input.companyId, slot.id, "blocked", {
      blockedReason: input.reason ?? null,
      updatedBy: assertActor(ctx),
    });
  }

  async createManualSlot(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      offeringId: string;
      presenterUserId: string;
      startAt: string;
      endAt?: string;
      publish?: boolean;
    },
  ): Promise<ProductDemoSlot> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.manage);
    const offering = await this.deps.demos.getOffering(input.companyId, input.offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    const presenters = await this.deps.demos.listPresenters(input.companyId, offering.id);
    if (!presenters.some((p) => p.userId === input.presenterUserId && p.isActive)) {
      throw new ProductDemoValidationError(
        "Presenter must be assigned to this product demo offering.",
        "presenter_not_assigned",
      );
    }
    const startAt = new Date(input.startAt);
    if (!Number.isFinite(startAt.getTime())) {
      throw new ProductDemoValidationError("Invalid startAt.", "invalid_start");
    }
    const endAt = input.endAt
      ? new Date(input.endAt)
      : new Date(startAt.getTime() + offering.durationMinutes * 60_000);
    if (!(endAt > startAt)) {
      throw new ProductDemoValidationError("endAt must be after startAt.", "invalid_range");
    }
    const overlaps = await this.deps.demos.findPresenterOverlap({
      companyId: input.companyId,
      presenterUserId: input.presenterUserId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    });
    if (overlaps) {
      throw new ProductDemoConflictError(
        "Presenter already has a conflicting demo slot.",
        "presenter_conflict",
      );
    }
    const status = input.publish ? "published" : "draft";
    return this.deps.demos.createSlot({
      companyId: input.companyId,
      offeringId: offering.id,
      catalogProductId: offering.catalogProductId,
      presenterUserId: input.presenterUserId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      timezone: offering.timezone,
      capacity: offering.capacity,
      status,
      createdBy: assertActor(ctx),
    });
  }

  /**
   * Customer / AI confirmation path. Does not create a booking until called.
   * Never falls back to clinic scheduling.
   */
  async confirmBooking(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      slotId: string;
      customerId?: string | null;
      leadId?: string | null;
      conversationId?: string | null;
      notes?: string | null;
      clientRequestId?: string | null;
    },
  ): Promise<ProductDemoBooking> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.book);
    if (!input.customerId && !input.leadId) {
      throw new ProductDemoValidationError(
        "customerId or leadId is required to confirm a product demo.",
        "identity_required",
      );
    }
    if (input.clientRequestId) {
      const existing = await this.deps.demos.getBookingByClientRequestId(
        input.companyId,
        input.clientRequestId,
      );
      if (existing) return existing;
    }
    return this.deps.demos.reserveSlot({
      companyId: input.companyId,
      slotId: input.slotId,
      customerId: input.customerId ?? null,
      leadId: input.leadId ?? null,
      conversationId: input.conversationId ?? null,
      notes: input.notes ?? null,
      clientRequestId: input.clientRequestId ?? null,
      actorUserId: assertActor(ctx),
    });
  }

  async cancelBooking(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; bookingId: string; reason?: string },
  ): Promise<ProductDemoBooking> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.book);
    return this.deps.demos.cancelBooking({
      companyId: input.companyId,
      bookingId: input.bookingId,
      reason: input.reason ?? null,
      actorUserId: assertActor(ctx),
    });
  }
}
