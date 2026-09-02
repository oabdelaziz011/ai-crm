import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("Migration 334 — Human Handoff Agent role template", () => {
  const sql = readFileSync(
    resolve("../../supabase/migrations/334_human_handoff_agent_role_template.sql"),
    "utf8",
  );

  const requiredCodes = [
    "conversation.view",
    "conversation.assign",
    "conversation.reassign",
    "conversation.take_over",
    "conversation.return_to_ai",
    "conversation.escalate",
    "conversation.resolve",
    "conversation.close",
    "handoff.view",
    "handoff.assign",
    "handoff.accept",
    "handoff.transfer",
    "handoff.escalate",
    "handoff.return_to_ai",
    "handoff.presence",
    "conversation.reply",
    "ai.conversations.view",
    "ai.conversations.reply",
    "ai.conversations.takeover",
    "ai.conversations.release",
    "channels.view",
    "customers.view",
    "conversation.reopen",
    "conversation.internal_note",
    "conversation.link_customer",
    "conversation.create_customer",
  ] as const;

  const forbiddenCodes = [
    "handoff.manage",
    "handoff.queue",
    "channels.manage",
    "conversation.internal_notes.manage",
  ] as const;

  it("defines human_handoff_agent tenant template", () => {
    assert.match(sql, /'human_handoff_agent'/);
    assert.match(sql, /'Human Handoff Agent'/);
    assert.match(sql, /template_scope[\s\S]*'tenant'|'\s*tenant'\s*,/);
  });

  it("attaches all approved permission codes by code (no UUID hardcoding)", () => {
    for (const code of requiredCodes) {
      assert.match(
        sql,
        new RegExp(`\\('human_handoff_agent',\\s*'${code.replace(/\./g, "\\.")}'\\)`),
        `missing template grant for ${code}`,
      );
    }
    assert.doesNotMatch(sql, /permission_id\s*=\s*'[0-9a-f-]{36}'/i);
  });

  it("explicitly excludes admin/routing configuration permissions", () => {
    for (const code of forbiddenCodes) {
      assert.doesNotMatch(
        sql,
        new RegExp(`\\('human_handoff_agent',\\s*'${code.replace(/\./g, "\\.")}'\\)`),
        `forbidden grant present: ${code}`,
      );
    }
    assert.match(sql, /must not include admin\/routing configuration permissions/);
  });

  it("extends provision_tenant_default_roles for admin + human_handoff_agent only", () => {
    assert.match(sql, /create or replace function public\.provision_tenant_default_roles/);
    assert.match(
      sql,
      /t\.template_key in \('admin', 'human_handoff_agent'\)/,
    );
    assert.match(sql, /failed to ensure Human Handoff Agent role/);
  });

  it("backfills existing tenant companies via trusted provisioning bootstrap", () => {
    assert.match(sql, /vault\.provisioning_bootstrap',\s*'true'/);
    assert.match(sql, /coalesce\(c\.company_type, 'tenant'\) not in \('platform', 'demo'\)/);
    assert.match(sql, /perform public\.provision_tenant_default_roles\(v_company\.id\)/);
  });

  it("repairs companies missing Human Handoff Agent as well as Admin", () => {
    assert.match(sql, /create or replace function public\.repair_companies_missing_roles/);
    assert.match(sql, /template_key = 'human_handoff_agent'/);
  });

  it("does not create new permissions or handoff/AI gate changes", () => {
    assert.doesNotMatch(sql, /insert into public\.permissions/i);
    assert.doesNotMatch(sql, /inbound.?ai.?gate/i);
    assert.doesNotMatch(sql, /create table.*employees/i);
  });
});
