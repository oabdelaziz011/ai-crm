/**
 * Phase 6D Step 4 — visibility permission packing migration guard.
 * Asserts migration 372 packs Model D correctly without touching
 * CUSTOM roles, user_permissions, RLS, AG, or audit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const sql = readFileSync(
  resolve("../../supabase/migrations/372_phase6d_conversation_visibility_permission_packing.sql"),
  "utf8",
);

/** Executable SQL only (strip line comments) for mutation-scope assertions. */
const executable = sql
  .split(/\r?\n/)
  .filter((line) => !/^\s*--/.test(line))
  .join("\n");

describe("Migration 372 — Phase 6D visibility permission packing", () => {
  it("targets only human_handoff_agent and manager templates for packing changes", () => {
    assert.match(sql, /human_handoff_agent/);
    assert.match(sql, /manager/);
    assert.match(sql, /ai\.conversations\.view_assigned/);
  });

  it("A. Agent (human_handoff_agent): removes view, adds view_assigned", () => {
    assert.match(
      executable,
      /\('human_handoff_agent',\s*'ai\.conversations\.view_assigned'\)/,
    );
    assert.match(
      executable,
      /delete from public\.platform_role_template_permissions\s+where template_key = 'human_handoff_agent'\s+and permission_code = 'ai\.conversations\.view'/,
    );
    assert.match(
      sql,
      /human_handoff_agent must not pack ai\.conversations\.view/,
    );
  });

  it("B. Manager: adds view_assigned and must not pack company-wide view", () => {
    assert.match(executable, /\('manager',\s*'ai\.conversations\.view_assigned'\)/);
    assert.match(sql, /manager must not pack company-wide ai\.conversations\.view/);
    assert.doesNotMatch(
      executable,
      /\('manager',\s*'ai\.conversations\.view'\)/,
    );
  });

  it("D. Admin retains company-wide view (no revoke of admin)", () => {
    assert.match(sql, /admin must retain ai\.conversations\.view/);
    // Only HHA template pack is deleted; admin template row is never deleted.
    assert.match(
      executable,
      /delete from public\.platform_role_template_permissions\s+where template_key = 'human_handoff_agent'\s+and permission_code = 'ai\.conversations\.view'/,
    );
    assert.match(
      executable,
      /delete from public\.role_permissions rp[\s\S]*r\.template_key = 'human_handoff_agent'/,
    );
    assert.doesNotMatch(
      executable,
      /delete from public\.platform_role_template_permissions\s+where template_key = 'admin'/,
    );
  });

  it("E. human_handoff_agent is treated as operational agent (not admin)", () => {
    assert.match(sql, /Agent desk/);
    assert.match(sql, /REMOVE default ai\.conversations\.view/);
  });

  it("F/G. CUSTOM roles and user_permissions are not modified", () => {
    assert.match(sql, /Does NOT modify CUSTOM roles/);
    assert.match(sql, /Does NOT modify user_permissions/);
    assert.doesNotMatch(executable, /user_permissions/i);
    assert.match(executable, /r\.role_type = 'DEFAULT'/);
    assert.match(
      executable,
      /r\.template_key in \('human_handoff_agent', 'manager'\)/,
    );
    assert.match(
      executable,
      /r\.template_key = 'human_handoff_agent'/,
    );
  });

  it("does not touch RLS, AG, audit, department ownership columns, or permission catalog", () => {
    assert.doesNotMatch(executable, /create policy/i);
    assert.doesNotMatch(executable, /alter policy/i);
    assert.doesNotMatch(executable, /conversation_visible_to_caller/i);
    assert.doesNotMatch(executable, /assignment_audit/i);
    assert.doesNotMatch(executable, /assignment_governance/i);
    assert.doesNotMatch(executable, /\bdepartment_id\b/i);
    assert.doesNotMatch(executable, /insert into public\.permissions/i);
    assert.doesNotMatch(executable, /delete from public\.permissions/i);
  });

  it("C. Supervisor: no platform template packing (none exists)", () => {
    assert.doesNotMatch(sql, /supervisor/i);
  });
});
