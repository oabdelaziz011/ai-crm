import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/472_sales_orders_journey_enrichment.sql"),
  "utf8",
);

describe("migration 472 sales orders journey enrichment guard", () => {
  it("adds attribution and location columns without touching follow-up tables", () => {
    assert.match(sql, /add column if not exists ai_employee_id/);
    assert.match(sql, /add column if not exists assigned_salesperson_id/);
    assert.match(sql, /add column if not exists delivery_lat/);
    assert.match(sql, /add column if not exists payment_status/);
    assert.match(sql, /add column if not exists confirmation_fingerprint/);
    assert.doesNotMatch(sql, /alter table public\.sales_follow_up_settings/);
    assert.doesNotMatch(sql, /drop table .*sales_follow_up/i);
  });

  it("indexes customer and conversation for CRM history queries", () => {
    assert.match(sql, /sales_orders_company_customer_idx/);
    assert.match(sql, /sales_orders_company_conversation_idx/);
  });

  it("seeds AI order tools with create requiring orders.create", () => {
    assert.match(sql, /'validate_delivery_zone'/);
    assert.match(sql, /'preview_sales_order'/);
    assert.match(sql, /'create_sales_order'/);
    assert.match(sql, /"orders\.create"/);
  });
});
