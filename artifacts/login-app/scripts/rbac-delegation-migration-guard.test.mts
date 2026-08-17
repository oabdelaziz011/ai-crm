import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("Migration 297 — DB privilege-delegation enforcement", () => {
  const sql = readFileSync(
    resolve("../../supabase/migrations/297_rbac_permission_delegation_guard.sql"),
    "utf8",
  );

  it("TEST 5/6 — role_permissions and user_roles policies require delegation helpers", () => {
    assert.match(sql, /actor_can_delegate_permission_id\(role_permissions\.permission_id\)/);
    assert.match(sql, /actor_can_delegate_role\(user_roles\.role_id\)/);
    assert.match(sql, /actor_can_delegate_permission_id\(user_permissions\.permission_id\)/);
  });

  it("TEST 5/6 — replace_user_role\(s\) SECURITY DEFINER paths raise role_delegation_denied", () => {
    assert.match(sql, /create or replace function internal\.replace_user_role/);
    assert.match(sql, /create or replace function internal\.replace_user_roles/);
    assert.equal((sql.match(/raise exception 'role_delegation_denied'/g) ?? []).length >= 2, true);
  });

  it("TEST 7 — company isolation checks remain in assignment RPCs", () => {
    assert.match(sql, /Cross tenant access denied/);
    assert.match(sql, /current_company_id\(\) is distinct from v_company_id/);
  });

  it("TEST 9 — Super Admin bypass is explicit in helpers and policies", () => {
    assert.match(sql, /public\.is_super_admin\(\)/);
    assert.match(
      sql,
      /create or replace function public\.actor_can_delegate_permission\(p_code text\)[\s\S]*is_super_admin\(\)/,
    );
  });

  it("TEST 11 — CUSTOM-only gate preserved for role_permissions mutations", () => {
    assert.match(sql, /r\.role_type = 'CUSTOM'/);
  });
});
