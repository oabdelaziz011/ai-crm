import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../supabase/migrations/199_crm_agent_permission_alignment_sprint6_3_4.sql",
);

describe("migration 199 CRM permission alignment", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("aligns search tools to customers.view", () => {
    assert.match(sql, /search_customer.*customers\.view/s);
    assert.match(sql, /find_duplicate_customers/);
  });

  it("aligns update_customer to customers.edit", () => {
    assert.match(sql, /update_customer[\s\S]*customers\.edit/);
  });

  it("aligns merge_customers to customers.edit and customers.delete", () => {
    assert.match(sql, /merge_customers[\s\S]*customers\.edit[\s\S]*customers\.delete/);
  });

  it("aligns import_customers to customers.create", () => {
    assert.match(sql, /import_customers[\s\S]*customers\.create/);
  });

  it("backfills RLS permissions from legacy agent codes", () => {
    assert.match(sql, /customers\.search[\s\S]*customers\.view/);
    assert.match(sql, /customers\.update[\s\S]*customers\.edit/);
    assert.match(sql, /customers\.import[\s\S]*customers\.create/);
  });

  it("seeds CRM agent codes into role templates", () => {
    assert.match(sql, /'admin', 'customers\.search'/);
    assert.match(sql, /'manager', 'customers\.search'/);
    assert.match(sql, /'employee', 'customers\.search'/);
  });
});
