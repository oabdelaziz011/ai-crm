import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations/470_company_order_delivery_settings.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("migration 470 company order delivery settings guard", () => {
  it("creates isolated settings tables without touching sales_follow_up_*", () => {
    assert.match(sql, /create table if not exists public\.company_order_settings/);
    assert.match(sql, /create table if not exists public\.company_delivery_zones/);
    assert.doesNotMatch(sql, /alter table public\.sales_follow_up_settings/);
    assert.doesNotMatch(sql, /drop table .*sales_follow_up/i);
  });

  it("keeps safe defaults for AI collection off and human approval on", () => {
    assert.match(sql, /ai_order_collection_enabled boolean not null default false/);
    assert.match(sql, /require_human_approval boolean not null default true/);
    assert.match(sql, /cash_on_delivery/);
  });

  it("validates delivery ETA range and fee at the database layer", () => {
    assert.match(sql, /eta_max >= eta_min/);
    assert.match(sql, /delivery_fee >= 0/);
    assert.match(sql, /eta_unit in \('hours', 'days'\)/);
  });

  it("scopes RLS to current company or super admin", () => {
    assert.match(sql, /company_id = public\.current_company_id\(\) or public\.is_super_admin\(\)/);
    assert.match(sql, /enable row level security/);
  });
});
