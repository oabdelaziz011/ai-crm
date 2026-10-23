import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Real-database concurrency check. Runs only when VALUEOR_BOOKING_CONCURRENCY_TEST=1
 * and talks to the local Supabase container as the postgres superuser.
 * It creates a disposable company and deletes it. It never uses a customer company.
 */
const enabled = process.env.VALUEOR_BOOKING_CONCURRENCY_TEST === "1";
const capacityMigration = fileURLToPath(
  new URL(
    "../../../../supabase/migrations/415_scheduling_booking_slot_capacity.sql",
    import.meta.url,
  ),
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

function bookingNumber(raw: string): string {
  return raw.split(/\r?\n/).find((entry) => entry.startsWith("BK-")) ?? raw.trim();
}

async function insertBooking(ids: Fixture, start: string, end: string): Promise<string> {
  const raw = await psql(`
    insert into public.scheduling_bookings (
      company_id, customer_id, resource_id, service_id,
      start_at, end_at, timezone, status, source
    ) values (
      '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
      '${start}', '${end}', 'UTC', 'confirmed', 'api'
    )
    returning confirmation_number;
  `);
  return bookingNumber(raw);
}

type Fixture = {
  userId: string;
  companyId: string;
  customerId: string;
  resourceId: string;
  serviceId: string;
};

async function createFixture(): Promise<Fixture> {
  const raw = await psql(`
    begin;
    set local session_replication_role = replica;
    with user_row as (
      insert into auth.users (id, email)
      values (gen_random_uuid(), 'concurrency-' || gen_random_uuid() || '@example.invalid')
      returning id
    ),
    company_row as (
      insert into public.companies (id, name)
      select gen_random_uuid(), 'concurrency-test-' || gen_random_uuid()::text
      returning id
    ),
    customer_row as (
      insert into public.customers (id, user_id, company_id, name)
      select gen_random_uuid(), user_row.id, company_row.id, 'Concurrency Test'
      from user_row, company_row
      returning id, user_id, company_id
    ),
    service_row as (
      insert into public.scheduling_services (id, company_id, name, duration_minutes)
      select gen_random_uuid(), customer_row.company_id, 'Concurrency Service', 30
      from customer_row
      returning id
    ),
    resource_row as (
      insert into public.scheduling_resources (id, company_id, name, resource_type)
      select gen_random_uuid(), customer_row.company_id, 'Concurrency Resource', 'room'
      from customer_row
      returning id
    )
    select customer_row.user_id || '|' || customer_row.company_id || '|' || customer_row.id || '|' || resource_row.id || '|' || service_row.id
    from customer_row, resource_row, service_row;
    commit;
  `);
  const line = raw.split(/\r?\n/).find((entry) => entry.includes("|"));
  const [userId, companyId, customerId, resourceId, serviceId] = (line ?? "").trim().split("|");
  if (!companyId || !customerId || !resourceId || !serviceId || !userId) {
    throw new Error(`fixture setup failed: ${raw}`);
  }
  return { userId, companyId, customerId, resourceId, serviceId };
}

async function destroyFixture(ids: Fixture): Promise<void> {
  await psql(`
    begin;
    set local session_replication_role = replica;
    delete from public.scheduling_bookings where company_id = '${ids.companyId}';
    delete from public.booking_number_sequences where company_id = '${ids.companyId}';
    delete from public.scheduling_resources where company_id = '${ids.companyId}';
    delete from public.scheduling_services where company_id = '${ids.companyId}';
    delete from public.customers where company_id = '${ids.companyId}';
    delete from public.companies where id = '${ids.companyId}';
    delete from auth.users where id = '${ids.userId}';
    commit;
  `);
}

describe("booking confirmation concurrency", { skip: enabled ? false : "set VALUEOR_BOOKING_CONCURRENCY_TEST=1" }, () => {
  before(async () => {
    await psql(readFileSync(capacityMigration, "utf8"));
  });

  after(async () => {
    await psql(`
      drop trigger if exists trg_scheduling_booking_slot_capacity on public.scheduling_bookings;
      drop function if exists public.enforce_scheduling_booking_slot_capacity();
    `);
  });

  it("gives 12 simultaneous bookings unique numbers and does not reuse a cancelled number", async () => {
    const ids = await createFixture();
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) => {
          const minute = String(index).padStart(2, "0");
          return insertBooking(
            ids,
            `2031-06-01T10:${minute}:00Z`,
            `2031-06-01T10:${minute}:30Z`,
          );
        }),
      );
      const succeeded = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value.split(/\r?\n/).find((entry) => entry.startsWith("BK-")) ?? result.value.trim());
      const failed = results.filter((result) => result.status === "rejected");
      assert.equal(failed.length, 0, failed.map((result) => String(result.reason)).join("\n"));
      assert.equal(succeeded.length, 12);
      assert.equal(new Set(succeeded).size, 12);

      const numbers = succeeded.map((value) => Number(value.replace(/\D/g, "")));
      numbers.sort((a, b) => a - b);
      assert.deepEqual(numbers, Array.from({ length: 12 }, (_, index) => index + 1));

      const cancelled = succeeded[3];
      await psql(`
        update public.scheduling_bookings
        set status = 'cancelled'
        where company_id = '${ids.companyId}'
          and confirmation_number = '${cancelled}';
      `);
      const next = await insertBooking(ids, "2031-06-01T12:00:00Z", "2031-06-01T12:30:00Z");
      assert.notEqual(next, cancelled);
      assert.equal(next, "BK-000013");

      const duplicates = await psql(`
        select count(*) from (
          select confirmation_number
          from public.scheduling_bookings
          where company_id = '${ids.companyId}'
          group by confirmation_number
          having count(*) > 1
        ) duplicates;
      `);
      assert.equal(duplicates, "0");

      const stored = await psql(`
        select confirmation_number
        from public.scheduling_bookings
        where company_id = '${ids.companyId}'
          and status = 'cancelled';
      `);
      assert.equal(stored, cancelled);
    } finally {
      await destroyFixture(ids);
    }
  });

  it("rolls a failed insert back without skipping the next booking number", async () => {
    const ids = await createFixture();
    try {
      const first = await insertBooking(ids, "2031-07-01T09:00:00Z", "2031-07-01T09:30:00Z");
      assert.equal(first, "BK-000001");

      await assert.rejects(
        psql(`
          begin;
          insert into public.scheduling_bookings (
            company_id, customer_id, resource_id, service_id,
            start_at, end_at, timezone, status, source
          ) values (
            '${ids.companyId}', '${ids.customerId}', '${ids.resourceId}', '${ids.serviceId}',
            '2031-07-01T09:40:00Z', '2031-07-01T10:10:00Z', 'UTC', 'confirmed', 'api'
          );
          insert into public.scheduling_bookings (
            company_id, customer_id, resource_id, service_id,
            start_at, end_at, timezone, status, source
          ) values (
            '${ids.companyId}', '00000000-0000-4000-8000-000000000000', '${ids.resourceId}', '${ids.serviceId}',
            '2031-07-01T10:20:00Z', '2031-07-01T10:50:00Z', 'UTC', 'confirmed', 'api'
          );
          commit;
        `),
      );

      const count = await psql(`
        select count(*) from public.scheduling_bookings where company_id = '${ids.companyId}';
      `);
      assert.equal(count, "1");

      const second = await insertBooking(ids, "2031-07-01T11:00:00Z", "2031-07-01T11:30:00Z");
      assert.equal(second, "BK-000002");
    } finally {
      await destroyFixture(ids);
    }
  });

  it("does not let the database accept ten active bookings on the same slot", async () => {
    const ids = await createFixture();
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          insertBooking(ids, "2031-08-01T15:00:00Z", "2031-08-01T15:30:00Z"),
        ),
      );
      const succeeded = results.filter((result) => result.status === "fulfilled");
      const active = await psql(`
        select count(*) from public.scheduling_bookings
        where company_id = '${ids.companyId}' and deleted_at is null and status = 'confirmed';
      `);
      assert.equal(succeeded.length, 1, `database accepted ${succeeded.length} active bookings for one slot`);
      assert.equal(active, "1");
    } finally {
      await destroyFixture(ids);
    }
  });

  it("accepts two concurrent bookings for different slots and only one for the same slot", async () => {
    const ids = await createFixture();
    try {
      const pair = await Promise.allSettled([
        insertBooking(ids, "2031-09-01T09:00:00Z", "2031-09-01T09:30:00Z"),
        insertBooking(ids, "2031-09-01T09:00:00Z", "2031-09-01T09:30:00Z"),
      ]);
      assert.equal(pair.filter((result) => result.status === "fulfilled").length, 1);

      const different = await Promise.allSettled([
        insertBooking(ids, "2031-09-01T11:00:00Z", "2031-09-01T11:30:00Z"),
        insertBooking(ids, "2031-09-01T11:30:00Z", "2031-09-01T12:00:00Z"),
      ]);
      assert.equal(different.filter((result) => result.status === "fulfilled").length, 2);
    } finally {
      await destroyFixture(ids);
    }
  });

  it("allows only the resource capacity when it is greater than one", async () => {
    const ids = await createFixture();
    try {
      await psql(`
        update public.scheduling_resources
        set metadata = '{"capacity": 2}'::jsonb
        where id = '${ids.resourceId}';
      `);
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          insertBooking(ids, "2031-10-01T14:00:00Z", "2031-10-01T14:30:00Z"),
        ),
      );
      const succeeded = results.filter((result) => result.status === "fulfilled");
      assert.equal(succeeded.length, 2);
      const overlap = await insertBooking(ids, "2031-10-01T14:15:00Z", "2031-10-01T14:45:00Z").then(
        () => "accepted",
        () => "rejected",
      );
      assert.equal(overlap, "rejected");
    } finally {
      await destroyFixture(ids);
    }
  });

  it("releases a cancelled slot and keeps the cancelled booking number", async () => {
    const ids = await createFixture();
    try {
      const first = await insertBooking(ids, "2031-11-01T08:00:00Z", "2031-11-01T08:30:00Z");
      await psql(`
        update public.scheduling_bookings
        set status = 'cancelled'
        where company_id = '${ids.companyId}' and confirmation_number = '${first}';
      `);
      const second = await insertBooking(ids, "2031-11-01T08:00:00Z", "2031-11-01T08:30:00Z");
      assert.notEqual(second, first);
      assert.equal(second, "BK-000002");
      const active = await psql(`
        select count(*) from public.scheduling_bookings
        where company_id = '${ids.companyId}' and status = 'confirmed';
      `);
      assert.equal(active, "1");
    } finally {
      await destroyFixture(ids);
    }
  });

  it("lets only one of two concurrent reschedules claim the destination slot", async () => {
    const ids = await createFixture();
    try {
      await insertBooking(ids, "2031-12-01T09:00:00Z", "2031-12-01T09:30:00Z");
      await insertBooking(ids, "2031-12-01T10:00:00Z", "2031-12-01T10:30:00Z");
      const idsToMove = (await psql(`
        select id from public.scheduling_bookings
        where company_id = '${ids.companyId}' and status = 'confirmed'
        order by start_at;
      `)).split(/\r?\n/).filter(Boolean);
      assert.equal(idsToMove.length, 2);
      const moved = await Promise.allSettled(
        idsToMove.map((bookingId) =>
          psql(`
            update public.scheduling_bookings
            set start_at = '2031-12-01T16:00:00Z', end_at = '2031-12-01T16:30:00Z'
            where id = '${bookingId}';
          `),
        ),
      );
      assert.equal(moved.filter((result) => result.status === "fulfilled").length, 1);
      const atDestination = await psql(`
        select count(*) from public.scheduling_bookings
        where company_id = '${ids.companyId}'
          and status = 'confirmed'
          and start_at = '2031-12-01T16:00:00Z';
      `);
      assert.equal(atDestination, "1");
      const stillOriginal = await psql(`
        select count(*) from public.scheduling_bookings
        where company_id = '${ids.companyId}'
          and status = 'confirmed'
          and start_at < '2031-12-01T16:00:00Z';
      `);
      assert.equal(stillOriginal, "1");
    } finally {
      await destroyFixture(ids);
    }
  });
});
