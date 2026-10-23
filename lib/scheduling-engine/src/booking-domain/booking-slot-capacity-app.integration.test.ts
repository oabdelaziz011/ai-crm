import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BookingDomainService } from "./booking-domain-service.js";
import { BookingRepository } from "./booking-repository.js";
import type { SlotGenerationEngine } from "../slot-generation-engine/slot-generation-engine.js";

const enabled = process.env.VALUEOR_BOOKING_CONCURRENCY_TEST === "1";
const capacityMigration = fileURLToPath(
  new URL("../../../../supabase/migrations/415_scheduling_booking_slot_capacity.sql", import.meta.url),
);
const DATE = "2026-12-01";
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
  if (!url.startsWith("http://127.0.0.1:")) {
    throw new Error("refusing non-local Supabase URL");
  }
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRoleKey) throw new Error("local service role key missing");
  return { url, serviceRoleKey };
}

function uuidOf(raw: string): string {
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) throw new Error(raw);
  return match[0];
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
  repo: BookingRepository;
};

async function createFixture(allowOverbooking = false): Promise<Fixture> {
  const raw = await psql(`
    begin;
    set local session_replication_role = replica;
    with user_row as (
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'capacity-app-' || gen_random_uuid() || '@example.invalid')
      returning id
    ),
    company_row as (
      insert into public.companies (id, name)
      select gen_random_uuid(), 'capacity-app-' || gen_random_uuid()::text
      returning id
    ),
    customer_row as (
      insert into public.customers (id, user_id, company_id, name)
      select gen_random_uuid(), user_row.id, company_row.id, 'Capacity App Test'
      from user_row, company_row
      returning id, user_id, company_id
    ),
    service_row as (
      insert into public.scheduling_services (id, company_id, name, duration_minutes)
      select gen_random_uuid(), customer_row.company_id, 'Capacity Service', 30
      from customer_row
      returning id, company_id
    ),
    resource_row as (
      insert into public.scheduling_resources (id, company_id, name, resource_type, timezone)
      select gen_random_uuid(), service_row.company_id, 'Capacity Resource', 'room', 'UTC'
      from service_row
      returning id, company_id
    )
    insert into public.resource_services (company_id, resource_id, service_id)
    select resource_row.company_id, resource_row.id, service_row.id
    from resource_row, service_row;
    commit;
  `);
  void raw;
  const ids = await psql(`
    select cu.user_id || '|' || c.id || '|' || cu.id || '|' || r.id || '|' || s.id
    from public.companies c
    join public.customers cu on cu.company_id = c.id
    join public.scheduling_resources r on r.company_id = c.id
    join public.scheduling_services s on s.company_id = c.id
    where c.name like 'capacity-app-%'
    order by c.created_at desc
    limit 1;
  `);
  const line = ids.split(/\r?\n/).find((entry) => entry.includes("|")) ?? "";
  const [userId, companyId, customerId, resourceId, serviceId] = line.trim().split("|");
  if (!userId || !companyId || !customerId || !resourceId || !serviceId) {
    throw new Error(`fixture setup failed: ${ids}`);
  }
  await psql(`
    insert into public.scheduling_booking_rules (
      company_id, allow_overbooking, timezone, min_booking_notice_minutes, max_booking_window_days
    ) values ('${companyId}', ${allowOverbooking ? "true" : "false"}, 'UTC', 0, 365);
  `);
  const { url, serviceRoleKey } = localSupabase();
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function bookInput(ids: Fixture, slotStart: string, resourceId = ids.resourceId) {
  return {
    companyId: ids.companyId,
    customerId: ids.customerId,
    resourceId,
    serviceId: ids.serviceId,
    date: DATE,
    slotStart,
    source: "api" as const,
    referenceNow: REFERENCE_NOW,
  };
}

describe("application slot capacity", { skip: enabled ? false : "set VALUEOR_BOOKING_CONCURRENCY_TEST=1" }, () => {
  before(async () => {
    await psql(readFileSync(capacityMigration, "utf8"));
  });

  after(async () => {
    await psql(`
      drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
      drop function if exists public.enforce_scheduling_booking_slot_capacity();
    `);
  });

  it("lets the application and the trigger both allow overbooking", async () => {
    const ids = await createFixture(true);
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => ids.service.createBooking(bookInput(ids, "13:00"))),
      );
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
      const overlap = await ids.repo.findOverlapping(
        ids.companyId,
        ids.resourceId,
        "2026-12-01T13:00:00.000Z",
        "2026-12-01T13:30:00.000Z",
      );
      assert.equal(overlap, null);
    } finally {
      await destroyFixture(ids);
    }
  });

  it("accepts one application create when ten requests hit the same capacity-1 slot", async () => {
    const ids = await createFixture(false);
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => ids.service.createBooking(bookInput(ids, "09:00"))),
      );
      const succeeded = results.filter((result) => result.status === "fulfilled");
      assert.equal(succeeded.length, 1);
      const active = await psql(`
        select count(*) from public.scheduling_bookings
        where company_id = '${ids.companyId}' and status = 'confirmed';
      `);
      assert.equal(active, "1");
      const numbers = await psql(`
        select count(distinct confirmation_number) || '|' || count(*)
        from public.scheduling_bookings
        where company_id = '${ids.companyId}';
      `);
      assert.equal(numbers, "1|1");
    } finally {
      await destroyFixture(ids);
    }
  });

  it("books different slots and different resources without a shared slot failure", async () => {
    const ids = await createFixture(false);
    try {
      const secondResource = uuidOf(await psql(`
        with resource_row as (
          insert into public.scheduling_resources (company_id, name, resource_type, timezone)
          values ('${ids.companyId}', 'Capacity Resource B', 'room', 'UTC')
          returning id
        )
        insert into public.resource_services (company_id, resource_id, service_id)
        select '${ids.companyId}', resource_row.id, '${ids.serviceId}' from resource_row
        returning resource_id;
      `));
      const results = await Promise.allSettled([
        ids.service.createBooking(bookInput(ids, "09:00")),
        ids.service.createBooking(bookInput(ids, "11:00")),
        ids.service.createBooking(bookInput(ids, "09:00", secondResource)),
        ids.service.createBooking(bookInput(ids, "15:00", secondResource)),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        4,
        results
          .filter((result) => result.status === "rejected")
          .map((result) => String(result.reason))
          .join(" | "),
      );
      const otherCompany = await createFixture(false);
      try {
        const both = await Promise.allSettled([
          ids.service.createBooking(bookInput(ids, "16:00")),
          otherCompany.service.createBooking(bookInput(otherCompany, "16:00")),
        ]);
        assert.equal(both.filter((result) => result.status === "fulfilled").length, 2);
      } finally {
        await destroyFixture(otherCompany);
      }
    } finally {
      await destroyFixture(ids);
    }
  });

  it("releases inactive statuses and keeps active statuses reserved", async () => {
    const ids = await createFixture(false);
    try {
      const inactive = ["cancelled", "completed", "no_show", "rescheduled", "archived"] as const;
      for (const [index, status] of inactive.entries()) {
        const slot = `${String(8 + index).padStart(2, "0")}:00`;
        const created = await ids.service.createBooking(bookInput(ids, slot));
        await psql(`
          update public.scheduling_bookings set status = '${status}' where id = '${created.booking.id}';
        `);
        const overlap = await ids.repo.findOverlapping(
          ids.companyId,
          ids.resourceId,
          `2026-12-01T${slot}:00.000Z`,
          `2026-12-01T${slot.slice(0, 2)}:30:00.000Z`,
        );
        assert.equal(overlap, null, status);
        const replacement = await ids.service.createBooking(bookInput(ids, slot));
        assert.ok(replacement.booking.id);
      }

      const active = ["pending", "checked_in", "with_nurse", "in_progress"] as const;
      for (const [index, status] of active.entries()) {
        const slot = `${String(14 + index).padStart(2, "0")}:00`;
        const created = await ids.service.createBooking(bookInput(ids, slot));
        await psql(`
          update public.scheduling_bookings set status = '${status}' where id = '${created.booking.id}';
        `);
        const overlap = await ids.repo.findOverlapping(
          ids.companyId,
          ids.resourceId,
          `2026-12-01T${slot}:00.000Z`,
          `2026-12-01T${slot.slice(0, 2)}:30:00.000Z`,
        );
        assert.ok(overlap, status);
        await assert.rejects(ids.service.createBooking(bookInput(ids, slot)));
      }
    } finally {
      await destroyFixture(ids);
    }
  });

  it("respects capacity and overlapping ranges in findOverlapping and reschedule", async () => {
    const ids = await createFixture(false);
    try {
      await psql(`
        update public.scheduling_resources
        set metadata = '{"capacity":2}'::jsonb
        where id = '${ids.resourceId}';
      `);
      const first = await ids.service.createBooking(bookInput(ids, "09:00"));
      const open = await ids.repo.findOverlapping(
        ids.companyId,
        ids.resourceId,
        "2026-12-01T09:00:00.000Z",
        "2026-12-01T09:30:00.000Z",
      );
      assert.equal(open, null);
      await ids.service.createBooking(bookInput(ids, "09:15"));
      const full = await ids.repo.findOverlapping(
        ids.companyId,
        ids.resourceId,
        "2026-12-01T09:00:00.000Z",
        "2026-12-01T09:30:00.000Z",
      );
      assert.ok(full);
      await assert.rejects(ids.service.createBooking(bookInput(ids, "09:00")));

      const later = await ids.service.createBooking(bookInput(ids, "12:00"));
      const moved = await Promise.allSettled([
        ids.service.rescheduleBooking({
          companyId: ids.companyId,
          bookingId: first.booking.id,
          date: DATE,
          slotStart: "18:00",
          referenceNow: REFERENCE_NOW,
        }),
        ids.service.rescheduleBooking({
          companyId: ids.companyId,
          bookingId: later.booking.id,
          date: DATE,
          slotStart: "18:00",
          referenceNow: REFERENCE_NOW,
        }),
      ]);
      assert.equal(moved.filter((result) => result.status === "fulfilled").length, 2);

      const third = await ids.service.createBooking(bookInput(ids, "19:00"));
      const crowded = await Promise.allSettled([
        ids.service.rescheduleBooking({
          companyId: ids.companyId,
          bookingId: third.booking.id,
          date: DATE,
          slotStart: "18:00",
          referenceNow: REFERENCE_NOW,
        }),
      ]);
      assert.equal(crowded.filter((result) => result.status === "fulfilled").length, 0);
      const restored = await psql(`
        select status from public.scheduling_bookings where id = '${third.booking.id}';
      `);
      assert.equal(restored, "confirmed");
    } finally {
      await destroyFixture(ids);
    }
  });

  it("reschedules two resources independently and rejects a partial overlap at capacity 1", async () => {
    const ids = await createFixture(false);
    try {
      const secondResource = uuidOf(await psql(`
        with resource_row as (
          insert into public.scheduling_resources (company_id, name, resource_type, timezone)
          values ('${ids.companyId}', 'Capacity Resource C', 'room', 'UTC')
          returning id
        )
        insert into public.resource_services (company_id, resource_id, service_id)
        select '${ids.companyId}', resource_row.id, '${ids.serviceId}' from resource_row
        returning resource_id;
      `));
      const left = await ids.service.createBooking(bookInput(ids, "08:00"));
      const right = await ids.service.createBooking(bookInput(ids, "08:00", secondResource));
      const moved = await Promise.allSettled([
        ids.service.rescheduleBooking({
          companyId: ids.companyId,
          bookingId: left.booking.id,
          date: DATE,
          slotStart: "17:00",
          referenceNow: REFERENCE_NOW,
        }),
        ids.service.rescheduleBooking({
          companyId: ids.companyId,
          bookingId: right.booking.id,
          date: DATE,
          slotStart: "17:00",
          referenceNow: REFERENCE_NOW,
        }),
      ]);
      assert.equal(moved.filter((result) => result.status === "fulfilled").length, 2);

      const keeper = await ids.service.createBooking(bookInput(ids, "10:00"));
      const mover = await ids.service.createBooking(bookInput(ids, "11:00"));
      await assert.rejects(
        ids.service.rescheduleBooking({
          companyId: ids.companyId,
          bookingId: mover.booking.id,
          date: DATE,
          slotStart: "10:15",
          referenceNow: REFERENCE_NOW,
        }),
      );
      const status = await psql(`select status from public.scheduling_bookings where id = '${mover.booking.id}';`);
      assert.equal(status, "confirmed");
      const keeperStillThere = await psql(`
        select count(*) from public.scheduling_bookings
        where id = '${keeper.booking.id}' and status = 'confirmed';
      `);
      assert.equal(keeperStillThere, "1");
      const numbers = await psql(`
        select count(*) - count(distinct confirmation_number)
        from public.scheduling_bookings
        where company_id = '${ids.companyId}';
      `);
      assert.equal(numbers, "0");
    } finally {
      await destroyFixture(ids);
    }
  });
});
