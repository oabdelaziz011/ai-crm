/**
 * Local DB behavioral test for migration 473.
 * Creates temporary DEFAULT + CUSTOM roles, applies the migration SQL, asserts grants.
 * Refuses any non-local DATABASE_URL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "../../lib/db/node_modules/pg/lib/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationSql = readFileSync(
  resolve(root, "supabase/migrations/473_sales_orders_role_permissions_backfill.sql"),
  "utf8",
);

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CO = "d0000010-0001-4001-8001-000000000002";

function assertLocalOnly(url: string) {
  if (!/127\.0\.0\.1|localhost/.test(url) || /supabase\.co|pooler\.supabase/i.test(url)) {
    throw new Error("Refusing sales-orders-473 local test against a non-local DATABASE_URL.");
  }
}

describe("migration 473 local DEFAULT vs CUSTOM role behavior", () => {
  it("grants orders.* to DEFAULT templates only and leaves CUSTOM roles unchanged", async () => {
    assertLocalOnly(LOCAL_URL);
    const client = new pg.Client({ connectionString: LOCAL_URL });
    await client.connect();

    try {
      await client.query("begin");

      const admin = await client.query(
        `insert into public.roles (company_id, name, role_type, template_key, description)
         values ($1, 'LOCAL-E2E Orders Admin', 'DEFAULT', 'admin', '473 test')
         returning id`,
        [CO],
      );
      const manager = await client.query(
        `insert into public.roles (company_id, name, role_type, template_key, description)
         values ($1, 'LOCAL-E2E Orders Manager', 'DEFAULT', 'manager', '473 test')
         returning id`,
        [CO],
      );
      const employee = await client.query(
        `insert into public.roles (company_id, name, role_type, template_key, description)
         values ($1, 'LOCAL-E2E Orders Employee', 'DEFAULT', 'employee', '473 test')
         returning id`,
        [CO],
      );
      const custom = await client.query(
        `insert into public.roles (company_id, name, role_type, template_key, description)
         values ($1, 'LOCAL-E2E Orders Custom', 'CUSTOM', null, '473 test')
         returning id`,
        [CO],
      );

      // Seed one unrelated permission on CUSTOM to prove preservation.
      const toolsExecute = await client.query(
        `select id from public.permissions where code = 'tools.execute' limit 1`,
      );
      if (toolsExecute.rows[0]?.id) {
        await client.query(
          `insert into public.role_permissions (role_id, permission_id) values ($1, $2)
           on conflict do nothing`,
          [custom.rows[0].id, toolsExecute.rows[0].id],
        );
      }

      const beforeCustom = await client.query(
        `select p.code from public.role_permissions rp
         join public.permissions p on p.id = rp.permission_id
         where rp.role_id = $1 order by 1`,
        [custom.rows[0].id],
      );

      await client.query(migrationSql);

      const codesFor = async (roleId: string) => {
        const r = await client.query(
          `select p.code from public.role_permissions rp
           join public.permissions p on p.id = rp.permission_id
           where rp.role_id = $1 and p.code like 'orders.%'
           order by 1`,
          [roleId],
        );
        return r.rows.map((row: { code: string }) => row.code);
      };

      assert.deepEqual(await codesFor(admin.rows[0].id), [
        "orders.create",
        "orders.delete",
        "orders.edit",
        "orders.view",
      ]);
      assert.deepEqual(await codesFor(manager.rows[0].id), [
        "orders.create",
        "orders.edit",
        "orders.view",
      ]);
      assert.deepEqual(await codesFor(employee.rows[0].id), ["orders.view"]);
      assert.deepEqual(await codesFor(custom.rows[0].id), []);

      const afterCustom = await client.query(
        `select p.code from public.role_permissions rp
         join public.permissions p on p.id = rp.permission_id
         where rp.role_id = $1 order by 1`,
        [custom.rows[0].id],
      );
      assert.deepEqual(
        afterCustom.rows.map((row: { code: string }) => row.code),
        beforeCustom.rows.map((row: { code: string }) => row.code),
      );

      // Idempotent second apply
      await client.query(migrationSql);
      assert.deepEqual(await codesFor(admin.rows[0].id), [
        "orders.create",
        "orders.delete",
        "orders.edit",
        "orders.view",
      ]);

      // Per-company DEFAULT roles: Alpha admin receives its own grants; Beta employee stays view-only.
      const alpha = await client.query(
        `insert into public.roles (company_id, name, role_type, template_key, description)
         values ('d0000010-0001-4001-8001-000000000001', 'LOCAL-E2E Alpha Orders Admin', 'DEFAULT', 'admin', '473 test')
         returning id`,
      );
      await client.query(migrationSql);
      assert.deepEqual(await codesFor(alpha.rows[0].id), [
        "orders.create",
        "orders.delete",
        "orders.edit",
        "orders.view",
      ]);
      assert.deepEqual(await codesFor(employee.rows[0].id), ["orders.view"]);
    } finally {
      await client.query("rollback").catch(() => undefined);
      await client.end();
    }
  });
});
