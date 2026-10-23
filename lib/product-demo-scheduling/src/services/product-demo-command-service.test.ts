import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProductDemoRepository } from "../repositories/product-demo-repository-port.js";
import type {
  ProductDemoBooking,
  ProductDemoOffering,
  ProductDemoPresenter,
  ProductDemoSlot,
} from "../types.js";
import { ProductDemoCommandService } from "./product-demo-command-service.js";
import { ProductDemoQueryService } from "./product-demo-query-service.js";

const offering: ProductDemoOffering = {
  id: "off-1",
  companyId: "co-1",
  catalogProductId: "prod-1",
  title: "Demo",
  durationMinutes: 30,
  bufferMinutes: 0,
  timezone: "UTC",
  capacity: 1,
  status: "published",
  metadata: {},
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

const presenter: ProductDemoPresenter = {
  id: "pr-1",
  companyId: "co-1",
  offeringId: "off-1",
  userId: "u-presenter",
  isActive: true,
  createdAt: "2030-01-01T00:00:00.000Z",
};

function slot(partial: Partial<ProductDemoSlot> = {}): ProductDemoSlot {
  return {
    id: "slot-1",
    companyId: "co-1",
    offeringId: "off-1",
    catalogProductId: "prod-1",
    presenterUserId: "u-presenter",
    startAt: "2030-06-01T10:00:00.000Z",
    endAt: "2030-06-01T10:30:00.000Z",
    timezone: "UTC",
    status: "published",
    capacity: 1,
    bookedCount: 0,
    publishedAt: "2030-01-01T00:00:00.000Z",
    blockedReason: null,
    metadata: {},
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    ...partial,
  };
}

function repo(overrides: Partial<ProductDemoRepository> = {}): ProductDemoRepository {
  const base = {
    getCatalogProductInCompany: async () => ({
      id: "prod-1",
      companyId: "co-1",
      name: "Widget",
      isActive: true,
    }),
    getUserInCompany: async () => ({ id: "u-presenter", companyId: "co-1" }),
    getOffering: async () => offering,
    getOfferingByProduct: async () => offering,
    listOfferings: async () => ({ items: [offering], total: 1 }),
    createOffering: async () => offering,
    updateOffering: async () => offering,
    listPresenters: async () => [presenter],
    upsertPresenter: async () => presenter,
    setPresenterActive: async () => {},
    listWindows: async () => [],
    upsertWindow: async () => ({
      id: "w1",
      companyId: "co-1",
      offeringId: "off-1",
      presenterUserId: null,
      weekday: 1,
      startTime: "09:00:00",
      endTime: "12:00:00",
      timezone: "UTC",
      isActive: true,
    }),
    saveWeekdayWindow: async (input) => ({
      id: "w1",
      companyId: input.companyId,
      offeringId: input.offeringId,
      presenterUserId: input.presenterUserId ?? null,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      isActive: true,
    }),
    deactivateWeekday: async () => {},
    getSlot: async () => slot(),
    listSlots: async () => ({ items: [slot()], total: 1 }),
    createSlot: async () => slot(),
    updateSlotStatus: async (_c, _id, status) => slot({ status }),
    findPresenterOverlap: async () => false,
    listBookings: async () => ({ items: [], total: 0 }),
    getBooking: async () => null,
    getBookingByClientRequestId: async () => null,
    reserveSlot: async () =>
      ({
        id: "bk-1",
        companyId: "co-1",
        slotId: "slot-1",
        offeringId: "off-1",
        catalogProductId: "prod-1",
        presenterUserId: "u-presenter",
        customerId: "cust-1",
        leadId: null,
        conversationId: null,
        startAt: "2030-06-01T10:00:00.000Z",
        endAt: "2030-06-01T10:30:00.000Z",
        timezone: "UTC",
        status: "confirmed",
        clientRequestId: "req-1",
        confirmationNumber: "PD-TEST",
        notes: null,
        cancelledAt: null,
        cancelReason: null,
        metadata: {},
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      }) satisfies ProductDemoBooking,
    cancelBooking: async () => {
      throw new Error("not used");
    },
    addHistory: async () => {},
    ...overrides,
  } as ProductDemoRepository;
  return base;
}

const ctx = {
  userId: "staff-1",
  companyId: "co-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

describe("ProductDemoCommandService", () => {
  it("rejects presenter from another company", async () => {
    const commands = new ProductDemoCommandService({
      demos: repo({
        getUserInCompany: async () => null,
      }),
    });
    await assert.rejects(
      () =>
        commands.assignPresenter(ctx, {
          companyId: "co-1",
          offeringId: "off-1",
          userId: "outsider",
        }),
      /same company|presenter_not_in_company/i,
    );
  });

  it("confirmBooking is idempotent on clientRequestId", async () => {
    const existing = await repo().reserveSlot({
      companyId: "co-1",
      slotId: "slot-1",
      customerId: "cust-1",
      leadId: null,
      conversationId: null,
      notes: null,
      clientRequestId: "req-1",
      actorUserId: "staff-1",
    });
    let reserveCalls = 0;
    const commands = new ProductDemoCommandService({
      demos: repo({
        getBookingByClientRequestId: async () => existing,
        reserveSlot: async () => {
          reserveCalls += 1;
          return existing;
        },
      }),
    });
    const first = await commands.confirmBooking(ctx, {
      companyId: "co-1",
      slotId: "slot-1",
      customerId: "cust-1",
      clientRequestId: "req-1",
    });
    const second = await commands.confirmBooking(ctx, {
      companyId: "co-1",
      slotId: "slot-1",
      customerId: "cust-1",
      clientRequestId: "req-1",
    });
    assert.equal(first.id, second.id);
    assert.equal(reserveCalls, 0);
  });

  it("requires an assigned presenter before a weekday can be a work day", async () => {
    const commands = new ProductDemoCommandService({
      demos: repo({ listPresenters: async () => [] }),
    });
    await assert.rejects(
      () =>
        commands.setWeekdayAvailability(ctx, {
          companyId: "co-1",
          offeringId: "off-1",
          weekday: 1,
          isWorkDay: true,
          startTime: "09:00",
          endTime: "17:00",
          presenterUserId: "u-presenter",
        }),
      /presenter/i,
    );
  });

  it("deactivates a weekday when it is marked off", async () => {
    let deactivated = -1;
    const commands = new ProductDemoCommandService({
      demos: repo({
        deactivateWeekday: async (input) => {
          deactivated = input.weekday;
        },
      }),
    });
    const result = await commands.setWeekdayAvailability(ctx, {
      companyId: "co-1",
      offeringId: "off-1",
      weekday: 5,
      isWorkDay: false,
    });
    assert.equal(result.isWorkDay, false);
    assert.equal(deactivated, 5);
  });

  it("does not create a booking without customer or lead identity", async () => {
    const commands = new ProductDemoCommandService({ demos: repo() });
    await assert.rejects(
      () =>
        commands.confirmBooking(ctx, {
          companyId: "co-1",
          slotId: "slot-1",
        }),
      /customerId or leadId/i,
    );
  });
});

describe("ProductDemoQueryService bookable slots", () => {
  it("returns only published future slots and nearest first", async () => {
    const queries = new ProductDemoQueryService({
      demos: repo({
        listSlots: async () => ({
          items: [
            slot({ id: "later", startAt: "2030-06-02T10:00:00.000Z", endAt: "2030-06-02T10:30:00.000Z" }),
            slot({ id: "soon", startAt: "2030-06-01T09:00:00.000Z", endAt: "2030-06-01T09:30:00.000Z" }),
            slot({ id: "draft", status: "draft", startAt: "2030-06-01T08:00:00.000Z" }),
            slot({ id: "full", bookedCount: 1, startAt: "2030-06-01T07:00:00.000Z" }),
          ],
          total: 4,
        }),
      }),
    });
    const slots = await queries.listBookableSlotsForProduct(ctx, {
      companyId: "co-1",
      catalogProductId: "prod-1",
    });
    assert.deepEqual(
      slots.map((s) => s.slotId),
      ["soon", "later"],
    );
  });

  it("returns empty when offering is not published", async () => {
    const queries = new ProductDemoQueryService({
      demos: repo({
        getOfferingByProduct: async () => ({ ...offering, status: "draft" }),
      }),
    });
    const slots = await queries.listBookableSlotsForProduct(ctx, {
      companyId: "co-1",
      catalogProductId: "prod-1",
    });
    assert.equal(slots.length, 0);
  });
});
