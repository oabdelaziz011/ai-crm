/**
 * Bridges AI sales-demo tools onto the dedicated product-demo scheduling domain.
 * Never falls back to clinic/service availability or create_booking.
 */
import type {
  CreateBookingResult,
  FindNextAvailableResult,
  ListDemoTypesResult,
  SearchAvailabilityResult,
} from "../tools/scheduling-agent-ports.js";
import type {
  BookableDemoSlot,
  ProductDemoCommandService,
  ProductDemoQueryService,
  ProductDemoServiceContext,
} from "@workspace/product-demo-scheduling";
import {
  ProductDemoConflictError,
  ProductDemoValidationError,
} from "@workspace/product-demo-scheduling";

export type ProductDemoToolBridge = {
  queries: ProductDemoQueryService;
  commands: ProductDemoCommandService;
};

function staffCtx(input: {
  companyId: string;
  userId: string;
}): ProductDemoServiceContext {
  return {
    userId: input.userId,
    companyId: input.companyId,
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === "product_demos.view" ||
      code === "product_demos.book" ||
      code === "product_demos.manage",
  };
}

/** Cairo-local calendar date and HH:MM. UTC slices mis-label evening slots. */
export function productDemoClockInCairo(iso: string): { date: string; slotStart: string } {
  const instant = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return { date, slotStart: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` };
}

function toDateAndStart(iso: string): { date: string; slotStart: string } {
  return productDemoClockInCairo(iso);
}

function cairoDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00+03:00`).toISOString();
}

function matchesRequestedClock(slotStartAt: string, date: string, slotStart: string): boolean {
  const parts = toDateAndStart(slotStartAt);
  if (parts.date !== date) return false;
  const normalized = slotStart.length === 5 ? slotStart : slotStart.slice(0, 5);
  return parts.slotStart === normalized;
}

export async function bridgeListDemoTypes(
  bridge: ProductDemoToolBridge,
  input: { companyId: string; userId: string },
): Promise<ListDemoTypesResult> {
  const ctx = staffCtx(input);
  const { items } = await bridge.queries.listOfferings(ctx, input.companyId, {
    status: "published",
    limit: 100,
    offset: 0,
  });
  return {
    success: true,
    demos: items.map((offering) => ({
      // AI tools historically called this serviceId; for product demos it is the catalog product id.
      serviceId: offering.catalogProductId,
      name: offering.title || offering.catalogProductId,
      durationMinutes: offering.durationMinutes,
      description: "product_demo",
    })),
    message:
      items.length === 0
        ? "No published product demo offerings. Staff must publish demo availability first."
        : undefined,
  };
}

export async function bridgeSearchDemoAvailability(
  bridge: ProductDemoToolBridge,
  input: {
    companyId: string;
    userId: string;
    productId?: string;
    /** Accepted for AI compatibility; treated as catalog product id. */
    serviceId?: string;
    date?: string;
    daysAhead?: number;
  },
): Promise<SearchAvailabilityResult> {
  const productId = (input.productId ?? input.serviceId ?? "").trim();
  if (!productId) {
    return {
      success: false,
      serviceId: "",
      durationMinutes: 0,
      availableDates: [],
      resources: [],
      message: "productId is required. Product demos use published catalog product slots only.",
    };
  }
  const slots = await bridge.queries.listBookableSlotsForProduct(staffCtx(input), {
    companyId: input.companyId,
    catalogProductId: productId,
    limit: 50,
    from: input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? cairoDayStartIso(input.date) : undefined,
  });
  const byPresenter = new Map<string, BookableDemoSlot[]>();
  for (const slot of slots) {
    const list = byPresenter.get(slot.presenterUserId) ?? [];
    list.push(slot);
    byPresenter.set(slot.presenterUserId, list);
  }
  const availableDates = [...new Set(slots.map((s) => toDateAndStart(s.startAt).date))].sort();
  const durationMinutes =
    slots[0] != null
      ? Math.max(
          1,
          Math.round(
            (new Date(slots[0].endAt).getTime() - new Date(slots[0].startAt).getTime()) / 60_000,
          ),
        )
      : 30;
  return {
    success: true,
    serviceId: productId,
    durationMinutes,
    availableDates,
    resources: [...byPresenter.entries()].map(([resourceId, presenterSlots]) => ({
      resourceId,
      resourceName: resourceId,
      durationMinutes,
      capacity: 1,
      availableDates: [...new Set(presenterSlots.map((s) => toDateAndStart(s.startAt).date))],
      slots: presenterSlots.map((s) => {
        const parts = toDateAndStart(s.startAt);
        return {
          date: parts.date,
          start: parts.slotStart,
          end: toDateAndStart(s.endAt).slotStart,
        };
      }),
    })),
    message:
      slots.length === 0
        ? "No published product demo slots available. Ask staff to publish more demo availability."
        : undefined,
  };
}

export async function bridgeFindNextDemo(
  bridge: ProductDemoToolBridge,
  input: {
    companyId: string;
    userId: string;
    productId?: string;
    serviceId?: string;
    daysAhead?: number;
  },
): Promise<FindNextAvailableResult> {
  const productId = (input.productId ?? input.serviceId ?? "").trim();
  if (!productId) {
    return {
      success: false,
      searchedWindow: input.daysAhead ?? 14,
      slot: null,
      message: "productId is required for product demos.",
    };
  }
  const nearest = await bridge.queries.findNearestBookableSlot(staffCtx(input), {
    companyId: input.companyId,
    catalogProductId: productId,
  });
  if (!nearest) {
    return {
      success: false,
      searchedWindow: input.daysAhead ?? 14,
      slot: null,
      message: "No published product demo slots available.",
    };
  }
  const parts = toDateAndStart(nearest.startAt);
  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(nearest.endAt).getTime() - new Date(nearest.startAt).getTime()) / 60_000,
    ),
  );
  return {
    success: true,
    searchedWindow: input.daysAhead ?? 14,
    slot: {
      date: parts.date,
      start: parts.slotStart,
      end: toDateAndStart(nearest.endAt).slotStart,
      resourceId: nearest.presenterUserId,
      resourceName: nearest.presenterUserId,
      serviceId: productId,
      durationMinutes,
      capacity: nearest.remainingCapacity,
      timezone: nearest.timezone,
    },
  };
}

export async function bridgeCreateDemoBooking(
  bridge: ProductDemoToolBridge,
  input: {
    companyId: string;
    userId: string;
    customerId: string;
    productId?: string;
    serviceId?: string;
    slotId?: string;
    resourceId?: string;
    date: string;
    slotStart: string;
    notes?: string;
    clientRequestId?: string;
    conversationId?: string;
    leadId?: string;
  },
): Promise<CreateBookingResult> {
  const productId = (input.productId ?? input.serviceId ?? "").trim();
  const ctx = staffCtx(input);

  try {
    let slotId = input.slotId?.trim() || "";
    if (!slotId) {
      if (!productId) {
        return {
          success: false,
          errors: ["product_required"],
          message: "productId or slotId is required. Product demos do not use clinic services.",
          customerFacingMessage: "محتاجين نعرف المنتج عشان نحجز العرض.",
        };
      }
      const slots = await bridge.queries.listBookableSlotsForProduct(ctx, {
        companyId: input.companyId,
        catalogProductId: productId,
        limit: 100,
      });
      const match = slots.find((s) => {
        const sameClock = matchesRequestedClock(s.startAt, input.date, input.slotStart);
        const samePresenter = !input.resourceId || s.presenterUserId === input.resourceId;
        return sameClock && samePresenter;
      });
      if (!match) {
        const alternatives = slots.slice(0, 5).map((s) => {
          const p = toDateAndStart(s.startAt);
          return `${p.date} ${p.slotStart}`;
        });
        return {
          success: false,
          errors: ["slot_unavailable"],
          message:
            alternatives.length > 0
              ? `That demo slot is unavailable. Next published options: ${alternatives.join(", ")}`
              : "No published product demo slots available. Staff must publish more slots.",
          customerFacingMessage: "الموعد ده مش متاح. نقدر نعرض مواعيد تانية منشورة.",
        };
      }
      slotId = match.slotId;
    }

    const booking = await bridge.commands.confirmBooking(ctx, {
      companyId: input.companyId,
      slotId,
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      conversationId: input.conversationId ?? null,
      notes: input.notes ?? null,
      clientRequestId: input.clientRequestId ?? null,
    });

    return {
      success: true,
      bookingId: booking.id,
      confirmationNumber: booking.confirmationNumber,
      status: booking.status,
      startAt: booking.startAt,
      endAt: booking.endAt,
      resourceId: booking.presenterUserId,
      customerFacingMessage: `تم حجز عرض المنتج. رقم التأكيد: ${booking.confirmationNumber ?? booking.id}`,
    };
  } catch (error) {
    if (error instanceof ProductDemoConflictError || error instanceof ProductDemoValidationError) {
      const alternatives = productId
        ? await bridge.queries
            .listBookableSlotsForProduct(ctx, {
              companyId: input.companyId,
              catalogProductId: productId,
              limit: 5,
            })
            .catch(() => [])
        : [];
      const altText = alternatives
        .map((s) => {
          const p = toDateAndStart(s.startAt);
          return `${p.date} ${p.slotStart}`;
        })
        .join(", ");
      return {
        success: false,
        errors: [error.code],
        message:
          altText.length > 0
            ? `${error.message} Next published options: ${altText}`
            : `${error.message} No alternate published slots right now.`,
        customerFacingMessage: "ما قدرناش نأكد الحجز. الموعد اتاخد أو مش متاح.",
      };
    }
    throw error;
  }
}
