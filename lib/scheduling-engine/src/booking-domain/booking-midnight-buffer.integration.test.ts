import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bookingMinutesOnDate, BookingRepository } from "./booking-repository.js";
import { SlotGenerationResolver } from "../slot-generation-engine/slot-generation-resolver.js";

const enabled = process.env.VALUEOR_BOOKING_CONCURRENCY_TEST === "1";
const capacityMigration = fileURLToPath(
  new URL("../../../../supabase/migrations/415_scheduling_booking_slot_capacity.sql", import.meta.url),
);

function psql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", "supabase_db_project", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      { windowsHide: true },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || out.trim() || `psql exited ${code}`));
    });
    child.stdin.end(sql);
  });
}

function localSupabase(): { url: string; serviceRoleKey: string } {
  const envPath = fileURLToPath(new URL("../../../../.env.localstack", import.meta.url));
  const env = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  const url = env.SUPABASE_URL ?? "";
  if (!url.startsWith("http://127.0.0.1:")) throw new Error("refusing non-local Supabase URL");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) throw new Error("local service role key missing");
  return { url, serviceRoleKey };
}

type Fixture = {
  userId: string;
  companyId: string;
  customerId: string;
  resourceId: string;
  serviceId: string;
  repo: BookingRepository;
};

async function createFixture(): Promise<Fixture> {
  await psql(`
    begin;
    set local session_replication_role = replica;
    with user_row as (
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'midnight-buffer-' || gen_random_uuid() || '@example.invalid')
      returning id
    ),
    company_row as (
      insert into public.companies (id, name)
      select gen_random_uuid(), 'midnight-buffer-' || gen_random_uuid()::text
      returning id
    ),
    customer_row as (
      insert into public.customers (id, user_id, company_id, name)
      select gen_random_uuid(), user_row.id, company_row.id, 'Midnight Buffer'
      from user_row, company_row
      returning id, user_id, company_id
    ),
    service_row as (
      insert into public.scheduling_services (id, company_id, name, duration_minutes)
      select gen_random_uuid(), customer_row.company_id, 'Midnight Service', 30
      from customer_row
      returning id, company_id
    ),
    resource_row as (
      insert into public.scheduling_resources (id, company_id, name, resource_type, timezone)
      select gen_random_uuid(), service_row.company_id, 'Midnight Resource', 'room', 'UTC'
      from service_row
      returning id, company_id
    )
    insert into public.resource_services (company_id, resource_id, service_id)
    select resource_row.company_id, resource_row.id, service_row.id
    from resource_row, service_row;
    commit;
  `);
  const ids = await psql(`
    select cu.user_id || '|' || c.id || '|' || cu.id || '|' || r.id || '|' || s.id
    from public.companies c
    join public.customers cu on cu.company_id = c.id
    join public.scheduling_resources r on r.company_id = c.id
    join public.scheduling_services s on s.company_id = c.id
    where c.name like 'midnight-buffer-%'
    order by c.created_at desc
    limit 1;
  `);
  const line = ids.split(/\r?\n/).find((entry) => entry.includes("|")) ?? "";
  const [userId, companyId, customerId, resourceId, serviceId] = line.trim().split("|");
  if (!userId || !companyId || !customerId || !resourceId || !serviceId) throw new Error(ids);
  await psql(`
    insert into public.scheduling_booking_rules (
      company_id, allow_overbooking, timezone, min_booking_notice_minutes, max_booking_window_days,
      buffer_before_minutes, buffer_after_minutes
    ) values ('${companyId}', false, 'UTC', 0, 365, 0, 0);
  `);
  const { url, serviceRoleKey } = localSupabase();
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId, companyId, customerId, resourceId, serviceId, repo: new BookingRepository(client) };
}

async function destroyFixture(ids: Fixture): Promise<void> {
  await psql(`
    begin;
    set local session_replication_role = replica;
    delete from public.scheduling_bookings where company_id = '${ids.companyId}';
    delete from public.booking_number_sequences where company_id = '${ids.companyId}';
    delete from public.resource_services where company_id = '${ids.companyId}';
    delete from public.scheduling_booking_rules where company_id = '${ids.companyId}';
    delete from public.scheduling_resources where company_id = '${ids.companyId}';
    delete from public.scheduling_services where company_id = '${ids.companyId}';
    delete from public.customers where company_id = '${ids.companyId}';
    delete from public.companies where id = '${ids.companyId}';
    delete from auth.users where id = '${ids.userId}';
    commit;
  `);
}

async function setRules(ids: Fixture, before: number, after: number, overbook = false): Promise<void> {
  await psql(`
    update public.scheduling_booking_rules
    set buffer_before_minutes = ${before}, buffer_after_minutes = ${after}, allow_overbooking = ${overbook ? "true" : "false"}
    where company_id = '${ids.companyId}';
  `);
}

async function insertRange(ids: Fixture, start: string, end: string): Promise<void> {
  await psql(`
    insert into public.scheduling_bookings (
      company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
    ) values (
      '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
      '${start}', '${end}', 'UTC', 'confirmed', 'api'
    );
  `);
}

async function insertOutcome(ids: Fixture, start: string, end: string): Promise<"ok" | "blocked"> {
  try {
    await insertRange(ids, start, end);
    return "ok";
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), /SLOT_CAPACITY_EXCEEDED/);
    return "blocked";
  }
}

function generatedSlots(
  bookings: { id: string; startMinutes: number; durationMinutes: number; status: "Confirmed" }[],
  date: string,
  before: number,
  after: number,
  overbook: boolean,
  periods: { start: string; end: string }[],
  interval: number,
  duration: number,
): string[] {
  return SlotGenerationResolver.resolve({
    resourceId: "resource",
    serviceId: "service",
    date,
    timezone: "UTC",
    durationMinutes: duration,
    periods,
    availabilityReasons: [],
    availabilityAvailable: true,
    bookingRules: {
      durationMinutes: duration,
      slotIntervalMinutes: interval,
      bufferBeforeMinutes: before,
      bufferAfterMinutes: after,
      allowOverbooking: overbook,
      minBookingNoticeMinutes: 0,
      maxBookingWindowDays: 365,
    },
    existingBookings: bookings,
    options: { referenceNow: new Date("2026-10-15T08:00:00.000Z"), date, timezone: "UTC" },
  }).slots;
}

describe("midnight booking buffers", { skip: enabled ? false : "set VALUEOR_BOOKING_CONCURRENCY_TEST=1" }, () => {
  after(async () => {
    await psql(`
      drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
      drop function if exists public.enforce_scheduling_booking_slot_capacity();
    `);
  });

  it("keeps the slot list, save check, and trigger aligned across midnight", async () => {
    await psql(readFileSync(capacityMigration, "utf8"));
    const ids = await createFixture();
    try {
      await setRules(ids, 0, 30);
      await insertRange(ids, "2026-12-05T23:40:00Z", "2026-12-05T23:55:00Z");
      const nextMorning = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-12-06", "UTC", {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 30,
      });
      assert.equal(nextMorning.length, 1);
      assert.equal(nextMorning[0]?.startMinutes, -20);
      const morningSlots = generatedSlots(nextMorning, "2026-12-06", 0, 30, false, [{ start: "00:00", end: "02:00" }], 5, 30);
      assert.equal(morningSlots.includes("00:00"), false);
      assert.equal(morningSlots.includes("00:25"), true);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-06T00:00:00.000Z", "2026-12-06T00:30:00.000Z"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-06T00:25:00.000Z", "2026-12-06T00:55:00.000Z"), null);
      assert.equal(await insertOutcome(ids, "2026-12-06T00:00:00Z", "2026-12-06T00:30:00Z"), "blocked");
      assert.equal(await insertOutcome(ids, "2026-12-06T00:25:00Z", "2026-12-06T00:55:00Z"), "ok");

      await setRules(ids, 30, 0);
      await insertRange(ids, "2026-12-07T00:05:00Z", "2026-12-07T00:35:00Z");
      const previousEvening = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-12-06", "UTC", {
        bufferBeforeMinutes: 30,
        bufferAfterMinutes: 0,
      });
      const early = previousEvening.find((booking) => booking.startMinutes > 24 * 60);
      assert.ok(early);
      const eveningSlots = generatedSlots(
        previousEvening.filter((booking) => booking.id === early?.id),
        "2026-12-06",
        30,
        0,
        false,
        [{ start: "22:00", end: "23:59" }],
        15,
        30,
      );
      assert.equal(eveningSlots.includes("23:00"), true);
      assert.equal(eveningSlots.includes("23:15"), false);
      assert.equal(await insertOutcome(ids, "2026-12-06T23:15:00Z", "2026-12-06T23:45:00Z"), "blocked");
      assert.equal(await insertOutcome(ids, "2026-12-06T23:00:00Z", "2026-12-06T23:30:00Z"), "ok");

      await setRules(ids, 10, 25);
      await insertRange(ids, "2026-12-09T00:20:00Z", "2026-12-09T00:50:00Z");
      assert.equal(await insertOutcome(ids, "2026-12-08T23:25:00Z", "2026-12-08T23:55:00Z"), "ok");
      assert.equal(await insertOutcome(ids, "2026-12-08T23:30:00Z", "2026-12-09T00:00:00Z"), "blocked");
      await setRules(ids, 0, 30);
      const riyadh = bookingMinutesOnDate("2026-12-10T20:40:00Z", "2026-12-10T20:55:00Z", "Asia/Riyadh", "2026-12-11", 30);
      await insertRange(ids, "2026-12-10T20:40:00Z", "2026-12-10T20:55:00Z");
      const riyadhRows = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-12-11", "Asia/Riyadh", {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 30,
      });
      const riyadhRow = riyadhRows.find((booking) => booking.startMinutes < 0);
      assert.equal(riyadhRow?.startMinutes, riyadh?.startMinutes);
      assert.equal(riyadhRow?.durationMinutes, riyadh?.durationMinutes);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-10T21:00:00.000Z", "2026-12-10T21:30:00.000Z"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-10T21:25:00.000Z", "2026-12-10T21:55:00.000Z"), null);
      assert.equal(await insertOutcome(ids, "2026-12-10T21:00:00Z", "2026-12-10T21:30:00Z"), "blocked");

      await setRules(ids, 0, 30, true);
      await insertRange(ids, "2026-12-12T23:40:00Z", "2026-12-12T23:55:00Z");
      const overbooked = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-12-13", "UTC", {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 30,
      });
      const overSlots = generatedSlots(overbooked, "2026-12-13", 0, 30, true, [{ start: "00:00", end: "02:00" }], 5, 30);
      assert.equal(overSlots.includes("00:00"), true);
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-13T00:00:00.000Z", "2026-12-13T00:30:00.000Z"), null);
      assert.equal(await insertOutcome(ids, "2026-12-13T00:00:00Z", "2026-12-13T00:30:00Z"), "ok");

      await setRules(ids, 0, 0, false);
      const sameSlot = await Promise.allSettled([
        insertRange(ids, "2026-12-14T10:00:00Z", "2026-12-14T10:30:00Z"),
        insertRange(ids, "2026-12-14T10:00:00Z", "2026-12-14T10:30:00Z"),
      ]);
      assert.equal(sameSlot.filter((result) => result.status === "fulfilled").length, 1);
      await psql(`update public.scheduling_resources set metadata = '{"capacity":2}'::jsonb where id = '${ids.resourceId}';`);
      assert.equal(await insertOutcome(ids, "2026-12-14T11:00:00Z", "2026-12-14T11:30:00Z"), "ok");
      assert.equal(await insertOutcome(ids, "2026-12-14T11:00:00Z", "2026-12-14T11:30:00Z"), "ok");
      assert.equal(await insertOutcome(ids, "2026-12-14T11:00:00Z", "2026-12-14T11:30:00Z"), "blocked");
      await psql(`update public.scheduling_resources set metadata = '{}'::jsonb where id = '${ids.resourceId}';`);
      assert.equal(await insertOutcome(ids, "2026-12-14T23:45:00Z", "2026-12-15T00:00:00Z"), "ok");
      assert.equal(await insertOutcome(ids, "2026-12-15T00:00:00Z", "2026-12-15T00:15:00Z"), "ok");
    } finally {
      await destroyFixture(ids);
    }
  });
});
