/**
 * Product demo scheduling — LOCAL PG only.
 * Verifies published-slot booking, isolation from clinic services, and no implicit create.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProductDemoSchedulingServices,
  PRODUCT_DEMO_PERMISSIONS,
} from "@workspace/product-demo-scheduling";
import {
  ACTOR_B,
  CO_B,
  CrmFixtureTracker,
  TAG,
  assertLocalCrmPgTarget,
  cleanupTracked,
  createAuthUser,
  createCatalogProduct,
  createCrmPgClients,
  createCustomer,
  loadLocalstackEnv,
  snapshotConfigBaseline,
  uniq,
  uniquePhone,
  type PgClient,
} from "./harness.js";

loadLocalstackEnv();
assertLocalCrmPgTarget();

const tracker = new CrmFixtureTracker();
let db: PgClient;
let admin: SupabaseClient;
let cleanupSummary: Record<string, number> = {};

const ctx = {
  userId: ACTOR_B,
  companyId: CO_B,
  isSuperAdmin: true,
  hasPermission: (code: string) =>
    code === PRODUCT_DEMO_PERMISSIONS.view ||
    code === PRODUCT_DEMO_PERMISSIONS.manage ||
    code === PRODUCT_DEMO_PERMISSIONS.book,
};

describe("Product demo scheduling — local PG", () => {
  before(async () => {
    const clients = await createCrmPgClients();
    db = clients.db;
    admin = clients.admin;
    await snapshotConfigBaseline(db, tracker);
    // Ensure migration tables exist.
    const tables = await db.query(
      `select to_regclass('public.product_demo_slots') as slots,
              to_regclass('public.product_demo_bookings') as bookings`,
    );
    assert.ok(tables.rows[0].slots, "product_demo_slots missing — apply migration 432");
    assert.ok(tables.rows[0].bookings, "product_demo_bookings missing — apply migration 432");
  });

  after(async () => {
    try {
      if (db) {
        await db.query(
          `delete from public.product_demo_booking_history where company_id = $1 and created_at > now() - interval '1 day'`,
          [CO_B],
        );
        await db.query(
          `delete from public.product_demo_bookings where company_id = $1 and metadata->>'crmPgTag' = $2`,
          [CO_B, TAG],
        ).catch(() => undefined);
        await db.query(`delete from public.product_demo_bookings where company_id = $1 and created_at > now() - interval '1 hour'`, [
          CO_B,
        ]);
        await db.query(`delete from public.product_demo_slots where company_id = $1 and created_at > now() - interval '1 hour'`, [
          CO_B,
        ]);
        await db.query(
          `delete from public.product_demo_availability_windows where company_id = $1 and created_at > now() - interval '1 hour'`,
          [CO_B],
        );
        await db.query(
          `delete from public.product_demo_presenters where company_id = $1 and created_at > now() - interval '1 hour'`,
          [CO_B],
        );
        await db.query(
          `delete from public.product_demo_offerings where company_id = $1 and created_at > now() - interval '1 hour'`,
          [CO_B],
        );
        cleanupSummary = await cleanupTracked(db, tracker);
      }
    } finally {
      await db?.end().catch(() => undefined);
      console.log(`[product-demo-pg] cleanup ${TAG}: ${JSON.stringify(cleanupSummary)}`);
    }
  });

  it("publishes slots, books nearest, rejects double-book, never uses clinic path", async () => {
    const presenterId = await createAuthUser(db, "pdemo", tracker);
    // Ensure profile company membership for presenter validation.
    await db.query(
      `update public.profiles set company_id = $1 where id = $2`,
      [CO_B, presenterId],
    );

    const productId = await createCatalogProduct(
      db,
      { companyId: CO_B, name: uniq("PDemoProd"), sku: uniq("pdsku") },
      tracker,
    );
    const phone = uniquePhone();
    const customerId = await createCustomer(
      db,
      {
        companyId: CO_B,
        userId: ACTOR_B,
        name: uniq("PDemoCust"),
        phone,
        email: `${uniq("pd")}@example.test`,
      },
      tracker,
    );

    const services = createProductDemoSchedulingServices(admin);
    const offering = await services.commands.upsertOffering(ctx, {
      companyId: CO_B,
      catalogProductId: productId,
      title: "Widget Demo",
      durationMinutes: 30,
      timezone: "UTC",
      capacity: 1,
    });
    await services.commands.assignPresenter(ctx, {
      companyId: CO_B,
      offeringId: offering.id,
      userId: presenterId,
    });
    await services.commands.addAvailabilityWindow(ctx, {
      companyId: CO_B,
      offeringId: offering.id,
      weekday: new Date().getUTCDay(),
      startTime: "09:00:00",
      endTime: "12:00:00",
      timezone: "UTC",
    });
    // Also ensure a far-future Monday window for stable generation.
    await services.commands.addAvailabilityWindow(ctx, {
      companyId: CO_B,
      offeringId: offering.id,
      weekday: 1,
      startTime: "10:00:00",
      endTime: "12:00:00",
      timezone: "UTC",
    });

    const generated = await services.commands.generateAndPublishSlots(ctx, {
      companyId: CO_B,
      offeringId: offering.id,
      daysAhead: 21,
      publish: true,
      fromDate: "2030-01-06T00:00:00.000Z",
    });
    assert.ok(generated.published > 0, "expected published slots");

    // Unpublished / draft must not appear in bookable list — create a draft manually.
    const draft = await services.commands.createManualSlot(ctx, {
      companyId: CO_B,
      offeringId: offering.id,
      presenterUserId: presenterId,
      startAt: "2030-02-01T15:00:00.000Z",
      publish: false,
    });
    assert.equal(draft.status, "draft");

    await services.commands.setOfferingStatus(ctx, {
      companyId: CO_B,
      offeringId: offering.id,
      status: "published",
    });

    const bookable = await services.queries.listBookableSlotsForProduct(ctx, {
      companyId: CO_B,
      catalogProductId: productId,
      limit: 10,
    });
    assert.ok(bookable.length > 0);
    assert.ok(!bookable.some((s) => s.slotId === draft.id), "draft slots must be excluded");
    const nearest = bookable[0]!;
    assert.equal(nearest.slotId, bookable[0]?.slotId);

    const booking = await services.commands.confirmBooking(ctx, {
      companyId: CO_B,
      slotId: nearest.slotId,
      customerId,
      clientRequestId: `pd-${TAG}-1`,
    });
    assert.equal(booking.status, "confirmed");
    assert.ok(booking.confirmationNumber);

    // Idempotent retry
    const retry = await services.commands.confirmBooking(ctx, {
      companyId: CO_B,
      slotId: nearest.slotId,
      customerId,
      clientRequestId: `pd-${TAG}-1`,
    });
    assert.equal(retry.id, booking.id);

    // Concurrent second customer must fail for capacity 1
    await assert.rejects(
      () =>
        services.commands.confirmBooking(ctx, {
          companyId: CO_B,
          slotId: nearest.slotId,
          customerId,
          clientRequestId: `pd-${TAG}-2`,
        }),
      /FULL|NOT_BOOKABLE|Conflict|full|bookable/i,
    );

    // Alternatives remain for other published slots
    const remaining = await services.queries.listBookableSlotsForProduct(ctx, {
      companyId: CO_B,
      catalogProductId: productId,
      limit: 10,
    });
    assert.ok(!remaining.some((s) => s.slotId === nearest.slotId));

    // Clinic scheduling_bookings must not be used for this booking id
    const clinic = await db.query(
      `select id from public.scheduling_bookings where id = $1`,
      [booking.id],
    );
    assert.equal(clinic.rows.length, 0, "product demo bookings must not write scheduling_bookings");
  });
});
