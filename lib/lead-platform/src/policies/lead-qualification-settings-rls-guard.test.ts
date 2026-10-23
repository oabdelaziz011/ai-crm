import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  resolve(here, "../../../../supabase/migrations/425_lead_qualification_settings.sql"),
  "utf8",
);

function policyCommands(source: string): string[] {
  return source
    .split(";")
    .map((statement) => statement.replace(/--[^\n]*/g, "").trim())
    .filter((statement) => /^(drop|create) policy/i.test(statement));
}

describe("migration 425 lead_qualification_settings RLS (P1d)", () => {
  it("creates a dedicated company-scoped table with sales_motion check", () => {
    assert.match(sql, /create table if not exists public\.lead_qualification_settings/);
    assert.match(sql, /company_id uuid primary key references public\.companies\(id\) on delete cascade/);
    assert.match(sql, /sales_motion in \('b2b', 'b2c', 'mixed'\)/);
    assert.match(sql, /required_evidence_fields text\[]/);
    assert.match(sql, /enable row level security/);
  });

  it("splits select and write policies with lead permissions (not company_id-only)", () => {
    assert.match(sql, /create policy lead_qualification_settings_select/);
    assert.match(sql, /create policy lead_qualification_settings_write/);
    const select = policyCommands(sql).find((s) => /create policy lead_qualification_settings_select/i.test(s));
    const write = policyCommands(sql).find((s) => /create policy lead_qualification_settings_write/i.test(s));
    assert.ok(select);
    assert.ok(write);
    assert.match(select!, /current_company_id\(\)/);
    assert.match(select!, /leads\.view/);
    assert.match(select!, /leads\.qualify/);
    assert.match(select!, /leads\.manage/);
    assert.match(write!, /leads\.manage/);
    assert.equal(/leads\.view/.test(write!), false);
    // Must not copy the weaker follow-up "for all" company_id-only pattern as sole guard.
    assert.match(select!, /company_has_permission/);
    assert.match(write!, /company_has_permission/);
  });

  it("revokes anon/public and grants authenticated + service_role", () => {
    assert.match(sql, /revoke all on table public\.lead_qualification_settings from anon, public/);
    assert.match(sql, /grant select, insert, update on table public\.lead_qualification_settings to authenticated/);
    assert.match(sql, /grant select, insert, update on table public\.lead_qualification_settings to service_role/);
  });

  it("does not define credential/secret storage columns", () => {
    // Comments may mention "No secrets"; assert against column-like identifiers only.
    assert.equal(/\b\w*(token|password|api_key|secret_key)\w*\s+(text|bytea|jsonb)/i.test(sql), false);
    assert.match(sql, /No secrets/);
  });
});
