import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const catalogSql = readFileSync(
  resolve("supabase/migrations/416_catalog_products_permission_rls.sql"),
  "utf8",
);
const executionSql = readFileSync(
  resolve("supabase/migrations/417_tool_execution_output_column_privileges.sql"),
  "utf8",
);
const lookupToolsSql = readFileSync(
  resolve("supabase/migrations/414_ai_employee_product_lookup_tools.sql"),
  "utf8",
);

function policyCommands(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.replace(/--[^\n]*/g, "").trim())
    .filter((statement) => /^(drop|create) policy/i.test(statement));
}

describe("migration 416 catalog authorization", () => {
  it("drops the permissive for-all policies before creating split policies", () => {
    for (const name of [
      "catalog_products_tenant",
      "product_categories_tenant",
      "product_regional_prices_tenant",
      "product_bundle_items_tenant",
      "product_history_tenant",
    ]) {
      assert.match(catalogSql, new RegExp(`drop policy if exists ${name}`));
    }
    const creates = policyCommands(catalogSql).filter((statement) => /^create policy/i.test(statement));
    assert.equal(creates.some((statement) => /\sfor all\s/i.test(statement)), false);
    assert.equal(creates.length, 18);
  });

  it("binds each catalog command to its existing permission", () => {
    assert.match(catalogSql, /catalog_products_select[\s\S]*products\.view/);
    const catalogSelect = policyCommands(catalogSql).find((statement) =>
      /create policy catalog_products_select/i.test(statement),
    );
    assert.ok(catalogSelect);
    for (const permission of ["products.view", "web_presence.manage", "products.edit", "products.delete"]) {
      assert.equal(catalogSelect.includes(permission), true, permission);
    }
    assert.equal(catalogSelect.includes("products.pricing"), false);
    assert.equal(catalogSelect.includes("products.create"), false);
    assert.match(catalogSql, /catalog_products_insert[\s\S]*products\.create/);
    assert.match(catalogSql, /catalog_products_update[\s\S]*products\.edit[\s\S]*products\.delete/);
    assert.match(catalogSql, /catalog_products_delete[\s\S]*products\.delete/);
    assert.match(catalogSql, /product_permission_denied: products\.pricing/);
    assert.match(catalogSql, /product_regional_prices_insert[\s\S]*products\.pricing/);
    assert.equal(catalogSql.includes("showProductPrices"), false);
  });

  it("does not leave a write policy that is satisfied by products.view", () => {
    const writes = policyCommands(catalogSql).filter((statement) =>
      /^create policy/i.test(statement) && /\sfor (insert|update|delete)\s/i.test(statement),
    );
    assert.equal(writes.length > 0, true);
    for (const statement of writes) {
      assert.equal(statement.includes("products.view"), false);
      assert.equal(statement.includes("web_presence.manage"), false);
    }
  });
});

describe("migration 417 execution payload privileges", () => {
  it("removes table select and grants operational columns only", () => {
    assert.match(executionSql, /revoke select on table public\.tool_executions from authenticated, anon/);
    const grant = executionSql.match(/grant select \(([\s\S]*?)\) on table public\.tool_executions to authenticated/);
    assert.ok(grant);
    const columns = grant[1].split(",").map((column) => column.trim());
    for (const column of ["id", "tool_key", "status", "duration_ms", "error_message"]) {
      assert.equal(columns.includes(column), true, column);
    }
    assert.equal(columns.includes("input"), false);
    assert.equal(columns.includes("output"), false);
  });

  it("limits the read-back function to the execution creator", () => {
    assert.match(executionSql, /auth\.uid\(\) is not null/);
    assert.match(executionSql, /row\.created_by = auth\.uid\(\)/);
    assert.match(executionSql, /grant execute on function public\.read_own_tool_execution\(uuid\) to authenticated/);
    assert.equal(executionSql.includes("grant execute on function public.read_own_tool_execution(uuid) to anon"), false);
    assert.equal(executionSql.includes("grant execute on function public.read_own_tool_execution(uuid) to service_role"), false);
  });

  it("limits authenticated updates to the creator and freezes identity columns", () => {
    const updatePolicy = policyCommands(executionSql).find((statement) =>
      /create policy tool_executions_update/i.test(statement),
    );
    assert.ok(updatePolicy);
    assert.match(updatePolicy, /created_by = auth\.uid\(\)/);
    assert.match(updatePolicy, /company_id = public\.current_company_id\(\)/);
    assert.equal(updatePolicy.includes("is_super_admin"), false);
    assert.match(executionSql, /revoke update on table public\.tool_executions from authenticated, anon/);
    const updateGrant = executionSql.match(/grant update \(([\s\S]*?)\) on table public\.tool_executions to authenticated/);
    assert.ok(updateGrant);
    const columns = updateGrant[1].split(",").map((column) => column.trim());
    for (const column of ["status", "output", "error_code", "error_message", "completed_at", "duration_ms"]) {
      assert.equal(columns.includes(column), true, column);
    }
    for (const frozen of ["id", "company_id", "conversation_id", "created_by", "tool_key", "input"]) {
      assert.equal(columns.includes(frozen), false, frozen);
    }
    assert.match(executionSql, /auth\.role\(\) is distinct from 'authenticated'/);
    assert.match(executionSql, /tool_execution_identity_frozen/);
    assert.match(executionSql, /new\.tool_key is distinct from old\.tool_key/);
    const freeze = executionSql.slice(executionSql.indexOf("function public.tool_executions_freeze_identity"));
    assert.equal(freeze.slice(0, freeze.indexOf("$$;")).includes("is_super_admin"), false);
  });
});

describe("migration 414 remains untouched by this change", () => {
  it("still only registers the read-only product tools", () => {
    assert.match(lookupToolsSql, /search_products/);
    assert.match(lookupToolsSql, /get_product_details/);
    assert.equal(lookupToolsSql.includes("revoke select"), false);
    assert.equal(lookupToolsSql.includes("catalog_products"), false);
  });
});
