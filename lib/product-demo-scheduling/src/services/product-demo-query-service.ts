import { PRODUCT_DEMO_PERMISSIONS } from "../constants.js";
import { ProductDemoPermissionError, ProductDemoValidationError } from "../errors.js";
import type { ProductDemoRepository } from "../repositories/product-demo-repository-port.js";
import type {
  BookableDemoSlot,
  ProductDemoBooking,
  ProductDemoOffering,
  ProductDemoServiceContext,
  ProductDemoSlot,
} from "../types.js";
import { isSlotBookableNow, sortBookableNearestFirst } from "./slot-generation.js";

function assertCompany(ctx: ProductDemoServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new ProductDemoPermissionError("tenant");
  }
}

function assertPermission(ctx: ProductDemoServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new ProductDemoPermissionError(code);
}

export class ProductDemoQueryService {
  constructor(private readonly deps: { demos: ProductDemoRepository }) {}

  async listOfferings(
    ctx: ProductDemoServiceContext,
    companyId: string,
    input?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ items: ProductDemoOffering[]; total: number }> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    return this.deps.demos.listOfferings(companyId, input);
  }

  async getOffering(
    ctx: ProductDemoServiceContext,
    companyId: string,
    offeringId: string,
  ): Promise<ProductDemoOffering | null> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    return this.deps.demos.getOffering(companyId, offeringId);
  }

  async listPresenters(ctx: ProductDemoServiceContext, companyId: string, offeringId: string) {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    return this.deps.demos.listPresenters(companyId, offeringId);
  }

  async listWindows(ctx: ProductDemoServiceContext, companyId: string, offeringId: string) {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    const offering = await this.deps.demos.getOffering(companyId, offeringId);
    if (!offering) throw new ProductDemoValidationError("Offering not found.", "not_found");
    const [windows, presenters] = await Promise.all([
      this.deps.demos.listWindows(companyId, offeringId),
      this.deps.demos.listPresenters(companyId, offeringId),
    ]);
    return { windows, presenters };
  }

  async listSlots(
    ctx: ProductDemoServiceContext,
    companyId: string,
    input: {
      offeringId?: string;
      catalogProductId?: string;
      status?: string | string[];
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: ProductDemoSlot[]; total: number }> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    return this.deps.demos.listSlots(companyId, {
      ...input,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  async listBookings(
    ctx: ProductDemoServiceContext,
    companyId: string,
    input: {
      catalogProductId?: string;
      customerId?: string;
      leadId?: string;
      presenterUserId?: string;
      status?: string | string[];
      from?: string;
      to?: string;
      query?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: ProductDemoBooking[]; total: number }> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    return this.deps.demos.listBookings(companyId, {
      ...input,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  /**
   * Customer / AI facing: only published, future, remaining-capacity slots for a product.
   * Nearest first. Never invents times from clinic availability.
   */
  async listBookableSlotsForProduct(
    ctx: ProductDemoServiceContext,
    input: {
      companyId: string;
      catalogProductId: string;
      limit?: number;
      from?: string;
    },
  ): Promise<BookableDemoSlot[]> {
    assertCompany(ctx, input.companyId);
    // Book permission is enough for AI/customer confirm path; view for staff browse.
    if (
      !ctx.isSuperAdmin &&
      !ctx.hasPermission(PRODUCT_DEMO_PERMISSIONS.view) &&
      !ctx.hasPermission(PRODUCT_DEMO_PERMISSIONS.book)
    ) {
      throw new ProductDemoPermissionError(PRODUCT_DEMO_PERMISSIONS.view);
    }

    const offering = await this.deps.demos.getOfferingByProduct(
      input.companyId,
      input.catalogProductId,
    );
    if (!offering || offering.status !== "published") {
      return [];
    }

    const presenters = (await this.deps.demos.listPresenters(input.companyId, offering.id)).filter(
      (p) => p.isActive,
    );
    if (!presenters.length) return [];
    const presenterSet = new Set(presenters.map((p) => p.userId));

    const { items } = await this.deps.demos.listSlots(input.companyId, {
      catalogProductId: input.catalogProductId,
      offeringId: offering.id,
      status: "published",
      from: input.from ?? new Date().toISOString(),
      limit: Math.min(input.limit ?? 50, 200),
      offset: 0,
    });

    const bookable = items
      .filter(
        (slot) =>
          presenterSet.has(slot.presenterUserId) &&
          isSlotBookableNow({
            status: slot.status,
            startAt: slot.startAt,
            bookedCount: slot.bookedCount,
            capacity: slot.capacity,
          }),
      )
      .map((slot) => ({
        slotId: slot.id,
        offeringId: slot.offeringId,
        catalogProductId: slot.catalogProductId,
        presenterUserId: slot.presenterUserId,
        startAt: slot.startAt,
        endAt: slot.endAt,
        timezone: slot.timezone,
        remainingCapacity: Math.max(0, slot.capacity - slot.bookedCount),
      }));

    return sortBookableNearestFirst(bookable).slice(0, input.limit ?? 50);
  }

  async findNearestBookableSlot(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; catalogProductId: string },
  ): Promise<BookableDemoSlot | null> {
    const slots = await this.listBookableSlotsForProduct(ctx, { ...input, limit: 1 });
    return slots[0] ?? null;
  }

  async getBooking(
    ctx: ProductDemoServiceContext,
    companyId: string,
    bookingId: string,
  ): Promise<ProductDemoBooking | null> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_DEMO_PERMISSIONS.view);
    return this.deps.demos.getBooking(companyId, bookingId);
  }

  async requireBookableSlot(
    ctx: ProductDemoServiceContext,
    input: { companyId: string; slotId: string; catalogProductId?: string },
  ): Promise<BookableDemoSlot> {
    assertCompany(ctx, input.companyId);
    const slot = await this.deps.demos.getSlot(input.companyId, input.slotId);
    if (!slot) throw new ProductDemoValidationError("Slot not found.", "not_found");
    if (input.catalogProductId && slot.catalogProductId !== input.catalogProductId) {
      throw new ProductDemoValidationError("Slot does not belong to this product.", "product_mismatch");
    }
    if (
      !isSlotBookableNow({
        status: slot.status,
        startAt: slot.startAt,
        bookedCount: slot.bookedCount,
        capacity: slot.capacity,
      })
    ) {
      throw new ProductDemoValidationError("Slot is not bookable.", "PRODUCT_DEMO_SLOT_NOT_BOOKABLE");
    }
    return {
      slotId: slot.id,
      offeringId: slot.offeringId,
      catalogProductId: slot.catalogProductId,
      presenterUserId: slot.presenterUserId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      timezone: slot.timezone,
      remainingCapacity: Math.max(0, slot.capacity - slot.bookedCount),
    };
  }
}
