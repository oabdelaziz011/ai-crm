import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = resolve(root, "supabase/migrations/367_profiles_department_id.sql");
const pending242 = resolve(root, "supabase/migrations/_pending/242_profiles_department_id.sql");
const collision242 = resolve(root, "supabase/migrations/242_profiles_department_id.sql");

describe("Migration 367 — profiles.department_id Phase 1", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("uses version 367 and does not collide with occupied 242", () => {
    assert.ok(existsSync(migrationPath));
    assert.equal(existsSync(collision242), false);
    assert.ok(existsSync(pending242), "pending 242 reference file should remain unused");
    assert.match(sql, /367\s+—\s+profiles\.department_id/);
  });

  it("adds nullable department_id FK with ON DELETE SET NULL", () => {
    assert.match(sql, /add column if not exists department_id uuid/);
    assert.match(
      sql,
      /references public\.organization_departments\(id\)\s+on delete set null/i,
    );
    assert.doesNotMatch(sql, /alter\s+column\s+department_id[\s\S]{0,40}set\s+not\s+null/i);
    assert.doesNotMatch(sql, /department_id\s+uuid\s+not\s+null/i);
  });

  it("indexes (company_id, department_id)", () => {
    assert.match(
      sql,
      /create index if not exists idx_profiles_company_department_id[\s\S]*\(company_id, department_id\)/i,
    );
  });

  it("keeps profiles.department text intact", () => {
    assert.doesNotMatch(sql, /drop\s+column[\s\S]{0,60}\bdepartment\b/i);
    assert.doesNotMatch(sql, /rename\s+column[\s\S]{0,60}\bdepartment\b/i);
    assert.match(sql, /profiles\.department text remains/i);
  });

  it("enforces same-company integrity via SECURITY DEFINER trigger (not composite FK)", () => {
    assert.match(sql, /profiles_validate_department_company/);
    assert.match(sql, /security definer/i);
    assert.match(sql, /must reference a department in the same company/i);
    assert.doesNotMatch(
      sql,
      /foreign key\s*\(\s*department_id\s*,\s*company_id\s*\)/i,
    );
  });

  it("backfills only unambiguous matches without LIMIT 1 guessing", () => {
    assert.match(sql, /having count\(d\.id\) = 1/i);
    assert.match(sql, /user_branch_assignments/);
    assert.doesNotMatch(sql, /order by[\s\S]{0,120}limit\s+1/i);
    assert.doesNotMatch(sql, /insert into public\.organization_departments/i);
  });

  it("remaps profiles.department_id in organization_merge_departments", () => {
    assert.match(sql, /create or replace function internal\.organization_merge_departments/i);
    assert.match(
      sql,
      /update public\.profiles[\s\S]*department_id = v_target\.id[\s\S]*department_id = v_source\.id/i,
    );
    assert.match(
      sql,
      /update public\.profiles[\s\S]*department = v_target\.name/i,
    );
  });

  it("does not change assignment, RBAC, Super Admin, or AI routing", () => {
    assert.doesNotMatch(sql, /conversation\.assign/i);
    assert.doesNotMatch(sql, /insert into public\.permissions/i);
    assert.doesNotMatch(sql, /is_super_admin\s*=/i);
    assert.doesNotMatch(sql, /ai_routing/i);
    assert.doesNotMatch(sql, /manager_user_id/i);
    assert.doesNotMatch(sql, /add column if not exists branch_id/i);
    assert.match(sql, /Does NOT:[\s\S]*add profiles\.branch_id/i);
  });
});
