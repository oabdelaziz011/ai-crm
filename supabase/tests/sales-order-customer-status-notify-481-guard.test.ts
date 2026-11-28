import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlPath = path.join(root, "supabase/migrations/481_sales_order_customer_status_notify.sql");

describe("481 sales order customer status notify", () => {
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("adds additive customer_status_notify columns on sales_orders", () => {
    assert.match(sql, /customer_status_notify_status/);
    assert.match(sql, /customer_status_notify_message_id/);
    assert.match(sql, /customer_status_notify_idempotency_key/);
    assert.match(sql, /customer_status_notify_for_status/);
    assert.match(sql, /add column if not exists/);
  });

  it("constrains notify status to none|pending|sent|failed|skipped", () => {
    assert.match(sql, /sales_orders_customer_status_notify_status_chk/);
    assert.match(sql, /'none', 'pending', 'sent', 'failed', 'skipped'/);
  });
});
