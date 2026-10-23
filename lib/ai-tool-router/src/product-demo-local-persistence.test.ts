/**
 * Local-only product demo booking through the official bridge and local database.
 * Skips when Supabase is not on 127.0.0.1. Never uses the clinic scheduling service.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductDemoSchedulingServices } from "@workspace/product-demo-scheduling";
import {
  bridgeCreateDemoBooking,
  bridgeSearchDemoAvailability,
  productDemoClockInCairo,
} from "./adapters/product-demo-tool-bridge.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const ACTOR_ID = "d0000001-0001-4001-8001-000000000001";
const PRODUCT_ID = "979845ef-bcae-43a0-a81c-6e9cd657d7bd";
const CLINIC_SERVICE_ID = "a1035bb1-b527-4706-b0d0-e163397e8d20";

function loadEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  return env;
}

describe("local product demo persistence", () => {
  it("books a published slot once and ignores an identical retry", async (t) => {
    process.env.VALUEOR_ENV = "local";
    process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND = "0";
    process.env.LOCAL_INTEGRATION_ENABLED = "false";

    const local = loadEnvFile(resolve(root, ".env.localstack"));
    const url = local.SUPABASE_URL || "";
    const key = local.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(url) || !key) {
      t.skip("local Supabase URL is not 127.0.0.1:54321");
      return;
    }

    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const probe = await client.from("catalog_products").select("id").limit(1);
    if (probe.error) {
      t.skip(`local Supabase unreachable: ${probe.error.message}`);
      return;
    }

    const stamp = Date.now();
    const phone = `010${String(stamp).slice(-8)}`;
    const requestId = `local-demo-lifecycle-${stamp}`;
    let customerId: string | null = null;
    let bookingId: string | null = null;

    try {
      const { data: customer, error: customerError } = await client
        .from("customers")
        .insert({
          company_id: COMPANY_ID,
          user_id: ACTOR_ID,
          name: "Local Demo Lifecycle",
          phone,
          phone_e164: `+20${phone.slice(1)}`,
          email: `local.demo.${stamp}@example.test`,
        })
        .select("id")
        .single();
      if (customerError) throw new Error(customerError.message);
      customerId = String(customer.id);

      const services = createProductDemoSchedulingServices(client);
      const bridge = { queries: services.queries, commands: services.commands };
      const staff = {
        userId: ACTOR_ID,
        companyId: COMPANY_ID,
        isSuperAdmin: true,
        hasPermission: () => true,
      };
      const listed = await services.queries.listBookableSlotsForProduct(staff, {
        companyId: COMPANY_ID,
        catalogProductId: PRODUCT_ID,
        limit: 20,
      });
      const slot = listed.find(
        (candidate) =>
          candidate.catalogProductId === PRODUCT_ID &&
          candidate.remainingCapacity > 0 &&
          candidate.offeringId !== CLINIC_SERVICE_ID,
      );
      assert.ok(slot, "no published product-demo slot was available");
      const clock = productDemoClockInCairo(slot.startAt);
      const confirmedFree = await services.queries.listBookableSlotsForProduct(staff, {
        companyId: COMPANY_ID,
        catalogProductId: PRODUCT_ID,
        limit: 20,
      });
      const free = confirmedFree.find((candidate) => candidate.slotId === slot.slotId && candidate.remainingCapacity > 0);
      assert.ok(free, `slot ${clock.date} ${clock.slotStart} was not free at execution time`);

      const booked = await bridgeCreateDemoBooking(bridge, {
        companyId: COMPANY_ID,
        userId: ACTOR_ID,
        customerId,
        serviceId: PRODUCT_ID,
        slotId: free.slotId,
        date: clock.date,
        slotStart: clock.slotStart,
        resourceId: free.presenterUserId,
        clientRequestId: requestId,
      });
      assert.equal(booked.success, true, booked.message);
      assert.ok(booked.bookingId);
      bookingId = booked.bookingId;

      const replay = await bridgeCreateDemoBooking(bridge, {
        companyId: COMPANY_ID,
        userId: ACTOR_ID,
        customerId,
        serviceId: PRODUCT_ID,
        slotId: free.slotId,
        date: clock.date,
        slotStart: clock.slotStart,
        resourceId: free.presenterUserId,
        clientRequestId: requestId,
      });
      assert.equal(replay.success, true, replay.message);
      assert.equal(replay.bookingId, bookingId);

      const { data: rows, error: rowError } = await client
        .from("product_demo_bookings")
        .select("id, company_id, catalog_product_id, offering_id, start_at, status, client_request_id")
        .eq("company_id", COMPANY_ID)
        .eq("client_request_id", requestId);
      if (rowError) throw new Error(rowError.message);
      assert.equal(rows?.length, 1);
      const row = rows![0]!;
      assert.equal(row.catalog_product_id, PRODUCT_ID);
      assert.notEqual(row.catalog_product_id, CLINIC_SERVICE_ID);
      assert.notEqual(row.offering_id, CLINIC_SERVICE_ID);
      const stored = productDemoClockInCairo(String(row.start_at));
      assert.equal(stored.date, clock.date);
      assert.equal(stored.slotStart, clock.slotStart);
      assert.equal(row.status === "cancelled", false);
      assert.equal(row.client_request_id, requestId);
    } finally {
      if (bookingId) {
        try {
          const services = createProductDemoSchedulingServices(client);
          await services.commands.cancelBooking(
            {
              userId: ACTOR_ID,
              companyId: COMPANY_ID,
              isSuperAdmin: true,
              hasPermission: () => true,
            },
            { companyId: COMPANY_ID, bookingId, reason: "local lifecycle test cleanup" },
          );
        } catch {
          // The row delete below still removes only this test's booking.
        }
      }
      await cleanupDemoRows(client, { customerId, bookingId });
    }
  });
});

async function cleanupDemoRows(
  client: SupabaseClient,
  ids: { customerId: string | null; bookingId: string | null },
) {
  if (ids.bookingId) {
    await client.from("product_demo_bookings").delete().eq("id", ids.bookingId).eq("company_id", COMPANY_ID);
  }
  if (ids.customerId) {
    await client.from("leads").delete().eq("company_id", COMPANY_ID).eq("customer_id", ids.customerId);
    await client.from("customers").delete().eq("id", ids.customerId).eq("company_id", COMPANY_ID);
  }
}
