import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlPath = path.join(root, "supabase/migrations/475_delivery_workers_and_order_enrichment.sql");

describe("475 delivery workers and order enrichment", () => {
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("creates delivery workers and zone link tables", () => {
    assert.match(sql, /create table if not exists public\.company_delivery_workers/);
    assert.match(sql, /create table if not exists public\.company_delivery_worker_zones/);
  });

  it("adds assign_delivery permission for admin and manager", () => {
    assert.match(sql, /orders\.assign_delivery/);
    assert.match(sql, /\('admin', 'orders\.assign_delivery'\)/);
    assert.match(sql, /\('manager', 'orders\.assign_delivery'\)/);
  });

  it("enriches sales_orders with assignment and ETA snapshot columns", () => {
    assert.match(sql, /assigned_delivery_worker_id/);
    assert.match(sql, /customer_secondary_phone/);
    assert.match(sql, /eta_min_snapshot/);
    assert.match(sql, /eta_unit_snapshot/);
  });

  it("adds customer delivery location fields", () => {
    assert.match(sql, /alter table public\.customers/);
    assert.match(sql, /secondary_phone_e164/);
    assert.match(sql, /delivery_location_url/);
  });

  it("scopes worker RLS to current company or super admin", () => {
    assert.match(sql, /company_id = public\.current_company_id\(\) or public\.is_super_admin\(\)/);
  });
});
