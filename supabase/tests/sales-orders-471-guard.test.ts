import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/471_sales_orders.sql"),
  "utf8",
);

describe("migration 471 sales orders guard", () => {
  it("creates orders tables without touching follow-up settings", () => {
    assert.match(sql, /create table if not exists public\.sales_orders/);
    assert.match(sql, /create table if not exists public\.sales_order_items/);
    assert.match(sql, /create table if not exists public\.sales_order_status_events/);
    assert.doesNotMatch(sql, /alter table public\.sales_follow_up_settings/);
    assert.doesNotMatch(sql, /drop table .*sales_follow_up/i);
  });

  it("registers order permissions and company RLS", () => {
    assert.match(sql, /'orders\.view'/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /company_id = public\.current_company_id\(\) or public\.is_super_admin\(\)/);
  });

  it("locks statuses and COD payment method", () => {
    assert.match(sql, /pending_approval/);
    assert.match(sql, /out_for_delivery/);
    assert.match(sql, /cash_on_delivery/);
  });
});
