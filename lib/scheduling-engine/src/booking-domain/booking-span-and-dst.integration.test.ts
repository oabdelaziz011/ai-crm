import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { BookingRepository } from "./booking-repository.js";
import { SlotGenerationResolver } from "../slot-generation-engine/slot-generation-resolver.js";
import type { ExistingBooking } from "../slot-generation-engine/types.js";

const enabled = process.env.VALUEOR_BOOKING_CONCURRENCY_TEST === "1";
const capacityMigration = fileURLToPath(
  new URL("../../../../supabase/migrations/415_scheduling_booking_slot_capacity.sql", import.meta.url),
);
const timezone = "America/New_York";

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
      values (gen_random_uuid(), 'span-buffer-' || gen_random_uuid() || '@example.invalid')
      returning id
    ),
    company_row as (
      insert into public.companies (id, name)
      select gen_random_uuid(), 'span-buffer-' || gen_random_uuid()::text
      returning id
    ),
    customer_row as (
      insert into public.customers (id, user_id, company_id, name)
      select gen_random_uuid(), user_row.id, company_row.id, 'Span Buffer'
      from user_row, company_row
      returning id, user_id, company_id
    ),
    service_row as (
      insert into public.scheduling_services (id, company_id, name, duration_minutes)
      select gen_random_uuid(), customer_row.company_id, 'Span Service', 30
      from customer_row
      returning id, company_id
    ),
    resource_row as (
      insert into public.scheduling_resources (id, company_id, name, resource_type, timezone)
      select gen_random_uuid(), service_row.company_id, 'Span Resource', 'room', 'America/New_York'
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
    where c.name like 'span-buffer-%'
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
    ) values ('${companyId}', false, 'America/New_York', 0, 365, 0, 0);
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

async function setRules(ids: Fixture, before: number, after: number): Promise<void> {
  await psql(`
    update public.scheduling_booking_rules
    set buffer_before_minutes = ${before}, buffer_after_minutes = ${after}, allow_overbooking = false
    where company_id = '${ids.companyId}';
  `);
}

async function insertRange(ids: Fixture, start: string, end: string): Promise<void> {
  await psql(`
    insert into public.scheduling_bookings (
      company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
    ) values (
      '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
      '${start}', '${end}', 'America/New_York', 'confirmed', 'api'
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
  bookings: ExistingBooking[],
  date: string,
  before: number,
  after: number,
  periods: { start: string; end: string }[],
): string[] {
  return SlotGenerationResolver.resolve({
    resourceId: "resource",
    serviceId: "service",
    date,
    timezone,
    durationMinutes: 30,
    periods,
    availabilityReasons: [],
    availabilityAvailable: true,
    bookingRules: {
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: before,
      bufferAfterMinutes: after,
      allowOverbooking: false,
      minBookingNoticeMinutes: 0,
      maxBookingWindowDays: 365,
    },
    existingBookings: bookings,
    options: { referenceNow: new Date("2026-01-01T00:00:00.000Z"), date, timezone },
  }).slots;
}

describe("long bookings and daylight saving buffers", { skip: enabled ? false : "set VALUEOR_BOOKING_CONCURRENCY_TEST=1" }, () => {
  after(async () => {
    await psql(`
      drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
      drop function if exists public.enforce_scheduling_booking_slot_capacity();
    `);
  });

  it("aligns the generator, save check, and trigger for long spans and DST", async () => {
    await psql(readFileSync(capacityMigration, "utf8"));
    const ids = await createFixture();
    try {
      await setRules(ids, 0, 0);
      await insertRange(ids, "2026-06-01T04:00:00Z", "2026-06-15T14:00:00Z");
      const longRows = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-06-15", timezone, {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      });
      assert.equal(longRows.length, 1);
      const longBooking = longRows[0];
      assert.ok(longBooking);
      assert.ok(longBooking.startMinutes < -1440);
      assert.equal(longBooking.startMinutes + longBooking.durationMinutes, 10 * 60);
      const longSlots = generatedSlots(longRows, "2026-06-15", 0, 0, [{ start: "09:00", end: "12:00" }]);
      assert.equal(longSlots.includes("09:30"), false);
      assert.equal(longSlots.includes("10:00"), true);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-06-15T13:30:00.000Z", "2026-06-15T14:00:00.000Z"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-06-15T14:00:00.000Z", "2026-06-15T14:30:00.000Z"), null);
      assert.equal(await insertOutcome(ids, "2026-06-15T13:30:00Z", "2026-06-15T14:00:00Z"), "blocked");
      assert.equal(await insertOutcome(ids, "2026-06-15T14:00:00Z", "2026-06-15T14:30:00Z"), "ok");

      await setRules(ids, 60, 0);
      await insertRange(ids, "2026-03-08T07:30:00Z", "2026-03-08T08:00:00Z");
      const springRows = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-03-08", timezone, {
        bufferBeforeMinutes: 60,
        bufferAfterMinutes: 0,
      });
      const springBooking = springRows.find((booking) => booking.durationMinutes === 30);
      assert.ok(springBooking);
      const springSlots = generatedSlots([springBooking], "2026-03-08", 60, 0, [{ start: "00:00", end: "06:00" }]);
      assert.equal(springSlots.includes("01:00"), true);
      assert.equal(springSlots.includes("01:30"), false);
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-03-08T06:00:00.000Z", "2026-03-08T06:30:00.000Z"), null);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-03-08T06:30:00.000Z", "2026-03-08T07:00:00.000Z"));
      assert.equal(await insertOutcome(ids, "2026-03-08T06:00:00Z", "2026-03-08T06:30:00Z"), "ok");
      assert.equal(await insertOutcome(ids, "2026-03-08T06:30:00Z", "2026-03-08T07:00:00Z"), "blocked");

      await setRules(ids, 0, 90);
      await insertRange(ids, "2026-11-01T04:30:00Z", "2026-11-01T05:30:00Z");
      const fallRows = await ids.repo.listByResourceAndDate(ids.companyId, ids.resourceId, "2026-11-01", timezone, {
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 90,
      });
      const fallBooking = fallRows.find((booking) => booking.durationMinutes === 60);
      assert.ok(fallBooking);
      const fallSlots = generatedSlots([fallBooking], "2026-11-01", 0, 90, [{ start: "00:00", end: "04:00" }]);
      assert.equal(fallSlots.includes("01:30"), false);
      assert.equal(fallSlots.includes("02:00"), true);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-11-01T05:30:00.000Z", "2026-11-01T06:00:00.000Z"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, "2026-11-01T07:00:00.000Z", "2026-11-01T07:30:00.000Z"), null);
      assert.equal(await insertOutcome(ids, "2026-11-01T07:00:00Z", "2026-11-01T07:30:00Z"), "ok");
      assert.equal(await insertOutcome(ids, "2026-11-01T05:30:00Z", "2026-11-01T06:00:00Z"), "blocked");
    } finally {
      await destroyFixture(ids);
    }
  });
});
