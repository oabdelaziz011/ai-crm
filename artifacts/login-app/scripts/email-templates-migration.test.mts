import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/293_company_email_templates.sql"),
  "utf8",
);

describe("company_email_templates migration (Sprint 1)", () => {
  it("creates tenant-scoped table with unique code and RLS", () => {
    assert.match(migration, /create table if not exists public\.company_email_templates/);
    assert.match(migration, /constraint company_email_templates_company_code_unique unique \(company_id, code\)/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /company_id = public\.current_company_id\(\)/);
    assert.match(migration, /user_has_permission\('settings\.view'\)/);
    assert.match(migration, /user_has_permission\('settings\.edit'\)/);
    assert.match(migration, /created_by uuid/);
    assert.match(migration, /updated_by uuid/);
  });

  it("does not alter email routing or notification systems", () => {
    assert.doesNotMatch(migration, /company_email_routing_category_targets/);
    assert.doesNotMatch(migration, /create table.*billing_email_templates/);
    assert.doesNotMatch(migration, /alter table public\.billing_email_templates/);
  });
});
