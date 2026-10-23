/**
 * Temporary local-only check of login-app reschedule, soft delete, and buffers.
 * Installs migration 415 for the run and drops it before exit.
 * Run: VALUEOR_BOOKING_CONCURRENCY_TEST=1 pnpm exec vite-node scripts/booking-slot-capacity-login-app.integration.mts
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BookingDomainService } from "../src/lib/scheduling/booking-domain/booking-domain-service.ts";
import { BookingRepository } from "../src/lib/scheduling/booking-domain/booking-repository.ts";
import { BookingConflictResolver } from "../src/lib/scheduling/slot-generation-engine/booking-conflict-resolver.ts";
import { BookingRepository as EngineBookingRepository } from "../../../lib/scheduling-engine/src/booking-domain/booking-repository.ts";
import type { SlotGenerationEngine } from "../src/lib/scheduling/slot-generation-engine/slot-generation-engine.ts";

if (process.env.VALUEOR_BOOKING_CONCURRENCY_TEST !== "1") {
  throw new Error("set VALUEOR_BOOKING_CONCURRENCY_TEST=1");
}

const DATE = "2026-12-01";
const REFERENCE_NOW = new Date("2026-10-15T08:00:00.000Z");
const migrationSql = readFileSync(
  new URL("../../../supabase/migrations/415_scheduling_booking_slot_capacity.sql", import.meta.url),
  "utf8",
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

function uuidOf(raw: string): string {
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) throw new Error(raw);
  return match[0];
}

function localSupabase(): { url: string; serviceRoleKey: string } {
  const env = Object.fromEntries(
    readFileSync(new URL("../../../.env.localstack", import.meta.url), "utf8")
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

function quarterHours(): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

const slotEngine = {
  async getAvailableSlots() {
    return { available: true, reasons: [], slots: quarterHours() };
  },
} as unknown as SlotGenerationEngine;

type Fixture = {
  userId: string;
  companyId: string;
  customerId: string;
  resourceId: string;
  serviceId: string;
  client: SupabaseClient;
  service: BookingDomainService;
  loginRepo: BookingRepository;
  engineRepo: EngineBookingRepository;
};

async function createFixture(): Promise<Fixture> {
  const created = await psql(`
    begin;
    set local session_replication_role = replica;
    with user_row as (
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'login-capacity-' || gen_random_uuid() || '@example.invalid')
      returning id
    ),
    company_row as (
      insert into public.companies (id, name)
      select gen_random_uuid(), 'login-capacity-' || gen_random_uuid()::text
      returning id
    ),
    customer_row as (
      insert into public.customers (id, user_id, company_id, name)
      select gen_random_uuid(), user_row.id, company_row.id, 'Login Capacity Test'
      from user_row, company_row
      returning id, user_id, company_id
    ),
    service_row as (
      insert into public.scheduling_services (id, company_id, name, duration_minutes)
      select gen_random_uuid(), customer_row.company_id, 'Login Capacity Service', 30
      from customer_row
      returning id, company_id
    ),
    resource_row as (
      insert into public.scheduling_resources (id, company_id, name, resource_type, timezone)
      select gen_random_uuid(), service_row.company_id, 'Login Capacity Resource', 'room', 'UTC'
      from service_row
      returning id
    ),
    linked as (
      insert into public.resource_services (company_id, resource_id, service_id)
      select service_row.company_id, resource_row.id, service_row.id
      from service_row, resource_row
      returning company_id
    )
    select customer_row.user_id || '|' || customer_row.company_id || '|' || customer_row.id || '|' || resource_row.id || '|' || service_row.id
    from customer_row, resource_row, service_row;
    commit;
  `);
  const line = created.split(/\r?\n/).find((entry) => entry.includes("|")) ?? "";
  const [userId, companyId, customerId, resourceId, serviceId] = line.split("|").map(uuidOf);
  await psql(`
    insert into public.scheduling_booking_rules (
      company_id, allow_overbooking, timezone, min_booking_notice_minutes, max_booking_window_days,
      buffer_before_minutes, buffer_after_minutes
    ) values ('${companyId}', false, 'UTC', 0, 365, 0, 0);
  `);
  const { url, serviceRoleKey } = localSupabase();
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    userId,
    companyId,
    customerId,
    resourceId,
    serviceId,
    client,
    service: new BookingDomainService(client, slotEngine),
    loginRepo: new BookingRepository(client),
    engineRepo: new EngineBookingRepository(client),
  };
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

function bookInput(ids: Fixture, slotStart: string) {
  return {
    companyId: ids.companyId,
    customerId: ids.customerId,
    resourceId: ids.resourceId,
    serviceId: ids.serviceId,
    date: DATE,
    slotStart,
    source: "api" as const,
    referenceNow: REFERENCE_NOW,
  };
}

async function rowOf(id: string): Promise<{ status: string; number: string; start: string }> {
  const raw = await psql(`
    select status || '|' || confirmation_number || '|' || start_at
    from public.scheduling_bookings where id = '${id}';
  `);
  const [status, number, start] = raw.split("|");
  return { status: status ?? "", number: number ?? "", start: start ?? "" };
}

async function dropCapacityGuard(): Promise<void> {
  await psql(`
    drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
    drop function if exists public.enforce_scheduling_booking_slot_capacity();
  `);
}

async function main(): Promise<void> {
  await psql(migrationSql);
  let ids: Fixture | undefined;
  try {
    ids = await createFixture();
    const directRace = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        psql(`
          insert into public.scheduling_bookings (
            company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
          ) values (
            '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
            '2026-12-01T20:00:00Z', '2026-12-01T20:30:00Z', 'UTC', 'confirmed', 'api'
          );
        `),
      ),
    );
    assert.equal(directRace.filter((result) => result.status === "fulfilled").length, 1);

    const first = await ids.service.createBooking(bookInput(ids, "09:00"));
    await psql(`update public.scheduling_bookings set deleted_at = now() where id = '${first.booking.id}';`);
    const loginOverlap = await ids.loginRepo.findOverlapping(
      ids.companyId,
      ids.resourceId,
      "2026-12-01T09:00:00.000Z",
      "2026-12-01T09:30:00.000Z",
    );
    const engineOverlap = await ids.engineRepo.findOverlapping(
      ids.companyId,
      ids.resourceId,
      "2026-12-01T09:00:00.000Z",
      "2026-12-01T09:30:00.000Z",
    );
    assert.equal(loginOverlap, null);
    assert.equal(engineOverlap, null);
    const replacement = await ids.service.createBooking(bookInput(ids, "09:00"));
    assert.notEqual(replacement.booking.confirmation_number, first.booking.confirmation_number);
    const direct = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        psql(`
          insert into public.scheduling_bookings (
            company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
          ) values (
            '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
            '2026-12-01T09:00:00Z', '2026-12-01T09:30:00Z', 'UTC', 'confirmed', 'api'
          ) returning confirmation_number;
        `),
      ),
    );
    assert.equal(direct.filter((result) => result.status === "fulfilled").length, 0);

    await psql(`
      update public.scheduling_booking_rules
      set buffer_before_minutes = 15, buffer_after_minutes = 15
      where company_id = '${ids.companyId}';
    `);
    const early = await ids.service.createBooking(bookInput(ids, "11:00"));
    assert.ok(early.booking.id);
    assert.ok(await ids.loginRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:30:00.000Z", "2026-12-01T12:00:00.000Z"));
    assert.equal(await ids.loginRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:45:00.000Z", "2026-12-01T12:15:00.000Z"), null);
    assert.ok(await ids.engineRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:30:00.000Z", "2026-12-01T12:00:00.000Z"));
    assert.equal(await ids.engineRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:45:00.000Z", "2026-12-01T12:15:00.000Z"), null);
    await assert.rejects(() => ids.service.createBooking(bookInput(ids, "11:30")));
    const directBuffered = await psql(`
      insert into public.scheduling_bookings (
        company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
      ) values (
        '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
        '2026-12-01T11:30:00Z', '2026-12-01T12:00:00Z', 'UTC', 'confirmed', 'api'
      );
    `).then(() => "inserted", (error: Error) => error.message);
    assert.match(directBuffered, /SLOT_CAPACITY_EXCEEDED/);
    const keptByGenerator = BookingConflictResolver.removeBookedSlotsFromBookings(
      ["11:30", "11:45"],
      30,
      [{ id: "buffer", startMinutes: 11 * 60, durationMinutes: 30, status: "Confirmed" }],
      { bufferBeforeMinutes: 15, bufferAfterMinutes: 15, allowOverbooking: false },
    );
    assert.deepEqual(keptByGenerator, ["11:45"]);
    await psql(`
      update public.scheduling_booking_rules
      set buffer_before_minutes = 0, buffer_after_minutes = 20
      where company_id = '${ids.companyId}';
    `);
    assert.ok(await ids.loginRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:30:00.000Z", "2026-12-01T12:00:00.000Z"));
    assert.equal(await ids.engineRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:50:00.000Z", "2026-12-01T12:20:00.000Z"), null);
    assert.equal(await ids.loginRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T11:50:00.000Z", "2026-12-01T12:20:00.000Z"), null);
    await psql(`
      update public.scheduling_booking_rules
      set buffer_before_minutes = 15, buffer_after_minutes = 15
      where company_id = '${ids.companyId}';
    `);
    const following = await ids.service.createBooking(bookInput(ids, "11:45"));
    assert.ok(following.booking.id);
    await psql(`
      update public.scheduling_booking_rules
      set buffer_before_minutes = 0, buffer_after_minutes = 0, allow_overbooking = false
      where company_id = '${ids.companyId}';
    `);

    const held = await ids.service.createBooking(bookInput(ids, "16:00"));
    await psql(`update public.scheduling_bookings set status = 'cancelled' where id = '${held.booking.id}';`);
    assert.equal(
      await ids.loginRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T16:00:00.000Z", "2026-12-01T16:30:00.000Z"),
      null,
    );
    assert.equal(
      await ids.engineRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T16:00:00.000Z", "2026-12-01T16:30:00.000Z"),
      null,
    );
    const reclaimed = await ids.service.createBooking(bookInput(ids, "16:00"));
    await psql(`update public.scheduling_bookings set status = 'checked_in' where id = '${reclaimed.booking.id}';`);
    assert.ok(await ids.loginRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T16:00:00.000Z", "2026-12-01T16:30:00.000Z"));
    assert.ok(await ids.engineRepo.findOverlapping(ids.companyId, ids.resourceId, "2026-12-01T16:00:00.000Z", "2026-12-01T16:30:00.000Z"));
    const blockedWhileActive = await psql(`
      insert into public.scheduling_bookings (
        company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
      ) values (
        '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
        '2026-12-01T16:00:00Z', '2026-12-01T16:30:00Z', 'UTC', 'confirmed', 'api'
      );
    `).then(
      () => "inserted",
      (error: Error) => error.message,
    );
    assert.match(blockedWhileActive, /SLOT_CAPACITY_EXCEEDED/);

    const left = await ids.service.createBooking(bookInput(ids, "13:00"));
    const right = await ids.service.createBooking(bookInput(ids, "14:00"));
    const leftBefore = await rowOf(left.booking.id);
    const rightBefore = await rowOf(right.booking.id);
    const raced = await Promise.allSettled([
      ids.service.rescheduleBooking({
        companyId: ids.companyId,
        bookingId: left.booking.id,
        date: DATE,
        slotStart: "18:00",
        referenceNow: REFERENCE_NOW,
      }),
      ids.service.rescheduleBooking({
        companyId: ids.companyId,
        bookingId: right.booking.id,
        date: DATE,
        slotStart: "18:00",
        referenceNow: REFERENCE_NOW,
      }),
    ]);
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    const loser = raced[0]?.status === "rejected" ? leftBefore : rightBefore;
    const loserId = raced[0]?.status === "rejected" ? left.booking.id : right.booking.id;
    const loserAfter = await rowOf(loserId);
    assert.equal(loserAfter.status, "confirmed");
    assert.equal(loserAfter.number, loser.number);
    assert.equal(loserAfter.start, loser.start);
    const partial = await psql(`
      select count(*) from public.scheduling_bookings
      where company_id = '${ids.companyId}' and rescheduled_from_id = '${loserId}';
    `);
    assert.equal(partial, "0");
    const atDestination = await psql(`
      select count(*) from public.scheduling_bookings
      where company_id = '${ids.companyId}' and status = 'confirmed' and start_at = '2026-12-01T18:00:00Z';
    `);
    assert.equal(atDestination, "1");

    await psql(`update public.scheduling_resources set metadata = '{"capacity":2}'::jsonb where id = '${ids.resourceId}';`);
    const third = await ids.service.createBooking(bookInput(ids, "15:00"));
    const fourth = await ids.service.createBooking(bookInput(ids, "15:30"));
    const fifth = await ids.service.createBooking(bookInput(ids, "17:00"));
    const beforeById = new Map([
      [third.booking.id, await rowOf(third.booking.id)],
      [fourth.booking.id, await rowOf(fourth.booking.id)],
      [fifth.booking.id, await rowOf(fifth.booking.id)],
    ]);
    const wider = await Promise.allSettled([
      ids.service.rescheduleBooking({
        companyId: ids.companyId,
        bookingId: third.booking.id,
        date: DATE,
        slotStart: "19:00",
        referenceNow: REFERENCE_NOW,
      }),
      ids.service.rescheduleBooking({
        companyId: ids.companyId,
        bookingId: fourth.booking.id,
        date: DATE,
        slotStart: "19:00",
        referenceNow: REFERENCE_NOW,
      }),
      ids.service.rescheduleBooking({
        companyId: ids.companyId,
        bookingId: fifth.booking.id,
        date: DATE,
        slotStart: "19:00",
        referenceNow: REFERENCE_NOW,
      }),
    ]);
    assert.equal(wider.filter((result) => result.status === "fulfilled").length, 2);
    const restoredIndex = wider.findIndex((result) => result.status === "rejected");
    const restoredId = [third.booking.id, fourth.booking.id, fifth.booking.id][restoredIndex] ?? "";
    const restoredBefore = beforeById.get(restoredId);
    const restoredAfter = await rowOf(restoredId);
    assert.equal(restoredAfter.status, restoredBefore?.status);
    assert.equal(restoredAfter.number, restoredBefore?.number);
    assert.equal(restoredAfter.start, restoredBefore?.start);
    const restoredPartial = await psql(`
      select count(*) from public.scheduling_bookings
      where company_id = '${ids.companyId}' and rescheduled_from_id = '${restoredId}';
    `);
    assert.equal(restoredPartial, "0");
    const duplicateNumbers = await psql(`
      select count(*) - count(distinct confirmation_number)
      from public.scheduling_bookings where company_id = '${ids.companyId}';
    `);
    assert.equal(duplicateNumbers, "0");

    await psql(`update public.scheduling_booking_rules set allow_overbooking = true where company_id = '${ids.companyId}';`);
    const overLogin = await ids.loginRepo.findOverlapping(
      ids.companyId,
      ids.resourceId,
      "2026-12-01T19:00:00.000Z",
      "2026-12-01T19:30:00.000Z",
    );
    const overEngine = await ids.engineRepo.findOverlapping(
      ids.companyId,
      ids.resourceId,
      "2026-12-01T19:00:00.000Z",
      "2026-12-01T19:30:00.000Z",
    );
    assert.equal(overLogin, null);
    assert.equal(overEngine, null);
    const extra = await ids.service.createBooking(bookInput(ids, "19:00"));
    assert.ok(extra.booking.confirmation_number);
    console.log("login-app capacity review: ok");
  } finally {
    if (ids) await destroyFixture(ids);
    await dropCapacityGuard();
  }
}

main().catch(async (error) => {
  console.error(error);
  await dropCapacityGuard().catch(() => undefined);
  process.exit(1);
});
