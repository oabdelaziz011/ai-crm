/**
 * Phase 2H.12 Phase A — schema contract tests (no DB, no provider calls).
 * Asserts migration SQL contains required additive foundation + portal scope fix.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../../../../../supabase/migrations/332_customer_phone_identity_foundation.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("332 customer phone identity foundation (Phase A)", () => {
  it("adds four nullable derived columns without rewriting phone", () => {
    assert.match(sql, /add column if not exists phone_e164 text/i);
    assert.match(sql, /add column if not exists phone_country_iso text/i);
    assert.match(sql, /add column if not exists phone_region_source text/i);
    assert.match(sql, /add column if not exists phone_national text/i);
    assert.doesNotMatch(sql, /update\s+public\.customers/i);
    assert.doesNotMatch(sql, /set\s+phone\s*=/i);
  });

  it("defines format / region_source checks", () => {
    assert.match(sql, /customers_phone_e164_format_check/);
    assert.ok(sql.includes("^\\+[1-9][0-9]{7,14}$"));
    assert.match(sql, /customers_phone_country_iso_check/);
    assert.ok(sql.includes("^[A-Z]{2}$"));
    assert.match(sql, /customers_phone_region_source_check/);
    assert.match(sql, /'explicit'/);
    assert.match(sql, /'e164'/);
    assert.match(sql, /'channel'/);
    assert.match(sql, /'import'/);
    assert.match(sql, /'unresolved'/);
  });

  it("adds company-scoped partial unique + lookup index; keeps raw phone unique comment", () => {
    assert.match(sql, /idx_customers_company_phone_e164_unique/);
    assert.match(sql, /unique index/i);
    assert.match(sql, /company_id,\s*phone_e164/);
    assert.match(sql, /idx_customers_company_phone_e164/);
    assert.match(sql, /idx_customers_company_phone_unique/);
  });

  it("scopes portal_verify_auth_challenge by challenge company_id", () => {
    assert.match(sql, /internal\.portal_verify_auth_challenge/);
    assert.match(sql, /company_id\s*=\s*v_challenge\.company_id/);
    assert.doesNotMatch(
      sql,
      /from public\.customers where phone = v_challenge\.destination or email = v_challenge\.destination limit 1/i,
    );
  });

  it("does not install resolver packages or rewrite customer phone data", () => {
    assert.doesNotMatch(sql, /libphonenumber/i);
    assert.doesNotMatch(sql, /update\s+public\.customers/i);
    assert.doesNotMatch(sql, /insert into public\.customers/i);
  });
});
