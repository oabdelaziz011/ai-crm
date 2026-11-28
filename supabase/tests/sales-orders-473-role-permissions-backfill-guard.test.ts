import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../migrations/473_sales_orders_role_permissions_backfill.sql",
  ),
  "utf8",
);

describe("migration 473 sales orders role permissions backfill guard", () => {
  it("follows migration 224 DEFAULT-role backfill pattern", () => {
    assert.match(sql, /role_type = 'DEFAULT'/);
    assert.match(sql, /r\.company_id is not null/);
    assert.match(sql, /platform_role_template_permissions/);
    assert.match(sql, /insert into public\.role_permissions/);
    assert.match(sql, /not exists/);
  });

  it("grants only the 471 template mapping and never touches CUSTOM roles", () => {
    assert.match(sql, /'admin', 'orders\.view'/);
    assert.match(sql, /'admin', 'orders\.delete'/);
    assert.match(sql, /'manager', 'orders\.edit'/);
    assert.match(sql, /'employee', 'orders\.view'/);
    assert.doesNotMatch(sql, /'employee', 'orders\.create'/);
    assert.doesNotMatch(sql, /'employee', 'orders\.delete'/);
    assert.doesNotMatch(sql, /'manager', 'orders\.delete'/);
    assert.doesNotMatch(sql, /role_type = 'CUSTOM'/);
    assert.doesNotMatch(sql, /update public\.role_permissions/i);
    assert.doesNotMatch(sql, /delete from public\.role_permissions/i);
  });

  it("does not alter sales_follow_up or channel tables", () => {
    assert.doesNotMatch(sql, /sales_follow_up/i);
    assert.doesNotMatch(sql, /whatsapp/i);
    assert.doesNotMatch(sql, /instagram/i);
    assert.doesNotMatch(sql, /messenger/i);
  });
});
