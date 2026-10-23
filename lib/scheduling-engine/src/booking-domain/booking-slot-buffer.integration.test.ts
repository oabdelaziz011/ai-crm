import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BookingDomainService } from "./booking-domain-service.js";
import { BookingRepository } from "./booking-repository.js";
import type { SlotGenerationEngine } from "../slot-generation-engine/slot-generation-engine.js";

const enabled = process.env.VALUEOR_BOOKING_CONCURRENCY_TEST === "1";
const capacityMigration = fileURLToPath(
  new URL("../../../../supabase/migrations/415_scheduling_booking_slot_capacity.sql", import.meta.url),
);
const DATE = "2026-12-03";
const REFERENCE_NOW = new Date("2026-10-15T08:00:00.000Z");

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

function everyMinute(): string[] {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 1) {
      slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }
  return slots;
}

const slotEngine = {
  async getAvailableSlots() {
    return { available: true, reasons: [], slots: everyMinute() };
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
  repo: BookingRepository;
};

async function createFixture(): Promise<Fixture> {
  await psql(`
    begin;
    set local session_replication_role = replica;
    with user_row as (
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'buffer-app-' || gen_random_uuid() || '@example.invalid')
      returning id
    ),
    company_row as (
      insert into public.companies (id, name)
      select gen_random_uuid(), 'buffer-app-' || gen_random_uuid()::text
      returning id
    ),
    customer_row as (
      insert into public.customers (id, user_id, company_id, name)
      select gen_random_uuid(), user_row.id, company_row.id, 'Buffer Test'
      from user_row, company_row
      returning id, user_id, company_id
    ),
    service_row as (
      insert into public.scheduling_services (id, company_id, name, duration_minutes)
      select gen_random_uuid(), customer_row.company_id, 'Buffer Service', 30
      from customer_row
      returning id, company_id
    ),
    resource_row as (
      insert into public.scheduling_resources (id, company_id, name, resource_type, timezone)
      select gen_random_uuid(), service_row.company_id, 'Buffer Resource', 'room', 'UTC'
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
    where c.name like 'buffer-app-%'
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
  return {
    userId,
    companyId,
    customerId,
    resourceId,
    serviceId,
    client,
    service: new BookingDomainService(client, slotEngine),
    repo: new BookingRepository(client),
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

function book(ids: Fixture, slotStart: string) {
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

function at(clock: string): string {
  return `${DATE}T${clock}:00.000Z`;
}

async function setRules(ids: Fixture, before: number, after: number, overbook = false): Promise<void> {
  await psql(`
    update public.scheduling_booking_rules
    set buffer_before_minutes = ${before}, buffer_after_minutes = ${after}, allow_overbooking = ${overbook ? "true" : "false"}
    where company_id = '${ids.companyId}';
  `);
}

async function insertRaw(ids: Fixture, start: string, end: string): Promise<string> {
  return psql(`
    insert into public.scheduling_bookings (
      company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
    ) values (
      '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
      '${DATE}T${start}:00Z', '${DATE}T${end}:00Z', 'UTC', 'confirmed', 'api'
    ) returning confirmation_number;
  `);
}

async function insertOutcome(ids: Fixture, start: string, end: string): Promise<"ok" | "blocked"> {
  try {
    await insertRaw(ids, start, end);
    return "ok";
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), /SLOT_CAPACITY_EXCEEDED/);
    return "blocked";
  }
}

async function rowOf(id: string): Promise<{ status: string; number: string; start: string }> {
  const raw = await psql(`select status || '|' || confirmation_number || '|' || start_at from public.scheduling_bookings where id = '${id}';`);
  const [status, number, start] = raw.split("|");
  return { status: status ?? "", number: number ?? "", start: start ?? "" };
}

describe("company booking buffers", { skip: enabled ? false : "set VALUEOR_BOOKING_CONCURRENCY_TEST=1" }, () => {
  after(async () => {
    await psql(`
      drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
      drop function if exists public.enforce_scheduling_booking_slot_capacity();
    `);
  });

  it("protects the company buffer at save time without doubling it", async () => {
    await psql(readFileSync(capacityMigration, "utf8"));
    const ids = await createFixture();
    try {
      await ids.service.createBooking(book(ids, "08:00"));
      await ids.service.createBooking(book(ids, "08:30"));
      await assert.rejects(() => ids.service.createBooking(book(ids, "08:00")));
      assert.equal(await insertOutcome(ids, "08:00", "08:30"), "blocked");

      await setRules(ids, 15, 0);
      await ids.service.createBooking(book(ids, "12:00"));
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("11:30"), at("12:00")));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("11:15"), at("11:45")), null);
      await assert.rejects(() => ids.service.createBooking(book(ids, "11:30")));
      await ids.service.createBooking(book(ids, "11:15"));
      assert.equal(await insertOutcome(ids, "11:50", "12:20"), "blocked");

      await setRules(ids, 0, 15);
      await ids.service.createBooking(book(ids, "14:00"));
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("14:30"), at("15:00")));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("14:45"), at("15:15")), null);
      await assert.rejects(() => ids.service.createBooking(book(ids, "14:30")));
      await ids.service.createBooking(book(ids, "14:45"));
      assert.equal(await insertOutcome(ids, "14:30", "15:00"), "blocked");

      await setRules(ids, 10, 20);
      await ids.service.createBooking(book(ids, "16:30"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("17:20"), at("17:50")), null);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("16:35"), at("17:05")));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("15:40"), at("16:10")), null);
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("15:50"), at("16:20")));
      await ids.service.createBooking(book(ids, "17:20"));
      await assert.rejects(() => ids.service.createBooking(book(ids, "16:35")));
      await ids.service.createBooking(book(ids, "15:40"));
      await assert.rejects(() => ids.service.createBooking(book(ids, "15:50")));

      await setRules(ids, 0, 15);
      const longNumber = await insertRaw(ids, "18:15", "19:45");
      assert.match(longNumber, /BK-/);
      await assert.rejects(() => ids.service.createBooking(book(ids, "19:45")));
      await ids.service.createBooking(book(ids, "20:00"));
      await assert.rejects(() => ids.service.createBooking(book(ids, "18:30")));
      assert.equal(await insertOutcome(ids, "19:45", "20:15"), "blocked");

      await psql(`update public.scheduling_resources set metadata = '{"capacity":2}'::jsonb where id = '${ids.resourceId}';`);
      await ids.service.createBooking(book(ids, "21:00"));
      await ids.service.createBooking(book(ids, "21:00"));
      await assert.rejects(() => ids.service.createBooking(book(ids, "21:00")));
      await ids.service.createBooking(book(ids, "22:00"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("22:15"), at("22:45")), null);
      await ids.service.createBooking(book(ids, "22:15"));
      assert.ok(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("22:15"), at("22:45")));
      assert.equal(await insertOutcome(ids, "22:15", "22:45"), "blocked");
      await psql(`update public.scheduling_resources set metadata = '{}'::jsonb where id = '${ids.resourceId}';`);

      await setRules(ids, 0, 15, true);
      await ids.service.createBooking(book(ids, "23:00"));
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("23:15"), at("23:45")), null);
      await ids.service.createBooking(book(ids, "23:15"));
      assert.equal(await insertOutcome(ids, "23:15", "23:45"), "ok");

      await setRules(ids, 0, 15, false);
      const held = await ids.service.createBooking(book(ids, "07:00"));
      assert.equal(await insertOutcome(ids, "07:15", "07:45"), "blocked");
      await psql(`update public.scheduling_bookings set status = 'cancelled' where id = '${held.booking.id}';`);
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("07:15"), at("07:45")), null);
      assert.equal(await insertOutcome(ids, "07:15", "07:45"), "ok");

      const soft = await ids.service.createBooking(book(ids, "06:00"));
      assert.equal(await insertOutcome(ids, "06:15", "06:45"), "blocked");
      await psql(`update public.scheduling_bookings set deleted_at = now() where id = '${soft.booking.id}';`);
      assert.equal(await ids.repo.findOverlapping(ids.companyId, ids.resourceId, at("06:15"), at("06:45")), null);
      const reclaimed = await insertRaw(ids, "06:15", "06:45");
      assert.notEqual(reclaimed, soft.booking.confirmation_number);

      await setRules(ids, 0, 0, false);
      const left = await ids.service.createBooking(book(ids, "04:00"));
      const right = await ids.service.createBooking(book(ids, "04:30"));
      const leftBefore = await rowOf(left.booking.id);
      const rightBefore = await rowOf(right.booking.id);
      await setRules(ids, 0, 15, false);
      const raced = await Promise.allSettled([
        ids.service.rescheduleBooking({ companyId: ids.companyId, bookingId: left.booking.id, date: DATE, slotStart: "03:00", referenceNow: REFERENCE_NOW }),
        ids.service.rescheduleBooking({ companyId: ids.companyId, bookingId: right.booking.id, date: DATE, slotStart: "03:30", referenceNow: REFERENCE_NOW }),
      ]);
      assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
      const loserId = raced[0]?.status === "rejected" ? left.booking.id : right.booking.id;
      const loserBefore = loserId === left.booking.id ? leftBefore : rightBefore;
      const loserAfter = await rowOf(loserId);
      assert.equal(loserAfter.status, loserBefore.status);
      assert.equal(loserAfter.number, loserBefore.number);
      assert.equal(loserAfter.start, loserBefore.start);
      const partial = await psql(`select count(*) from public.scheduling_bookings where rescheduled_from_id = '${loserId}';`);
      assert.equal(partial, "0");

      const creates = await Promise.allSettled([
        ids.service.createBooking(book(ids, "02:00")),
        ids.service.createBooking(book(ids, "02:30")),
      ]);
      assert.equal(creates.filter((result) => result.status === "fulfilled").length, 1);

      for (let hour = 0; hour < 4; hour += 1) {
        const clock = String(hour).padStart(2, "0");
        const next = String(hour + 1).padStart(2, "0");
        const pair = await Promise.allSettled([
          psql(`
            insert into public.scheduling_bookings (
              company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
            ) values (
              '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
              '2026-12-04T${clock}:00:00Z', '2026-12-04T${clock}:30:00Z', 'UTC', 'confirmed', 'api'
            );
          `),
          psql(`
            insert into public.scheduling_bookings (
              company_id, customer_id, resource_id, service_id, start_at, end_at, timezone, status, source
            ) values (
              '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
              '2026-12-04T${clock}:30:00Z', '2026-12-04T${next}:00:00Z', 'UTC', 'confirmed', 'api'
            );
          `),
        ]);
        assert.equal(pair.filter((result) => result.status === "fulfilled").length, 1, `buffer race ${clock}`);
      }
    } finally {
      await destroyFixture(ids);
    }
  });
});
