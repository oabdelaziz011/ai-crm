/**
 * Migration 335 — schema contract tests (no DB apply, no Meta/queue/campaign activity).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../../../../../supabase/migrations/335_campaign_recipient_delivery_reconciliation.sql",
);
const old334Path = join(
  __dirname,
  "../../../../../supabase/migrations/334_campaign_recipient_delivery_reconciliation.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("335 campaign recipient delivery reconciliation (schema)", () => {
  it("0) renumbered away from live 334 collision", () => {
    assert.equal(existsSync(old334Path), false);
    assert.match(migrationPath, /335_campaign_recipient_delivery_reconciliation\.sql$/);
  });

  it("1) nullable provider_message_id ensured (additive if missing)", () => {
    assert.match(sql, /add column if not exists provider_message_id text/i);
  });

  it("2-6) nullable lifecycle timestamps", () => {
    assert.match(sql, /add column if not exists sent_at timestamptz/i);
    assert.match(sql, /add column if not exists delivered_at timestamptz/i);
    assert.match(sql, /add column if not exists read_at timestamptz/i);
    assert.match(sql, /add column if not exists failed_at timestamptz/i);
    assert.match(sql, /add column if not exists replied_at timestamptz/i);
  });

  it("7) company-scoped provider message lookup index", () => {
    assert.match(
      sql,
      /idx_marketing_campaign_recipients_company_provider_message/i,
    );
    assert.match(sql, /company_id,\s*provider_message_id/i);
    assert.match(sql, /where provider_message_id is not null/i);
  });

  it("8) existing status values remain valid (constraint not rewritten)", () => {
    assert.doesNotMatch(
      sql,
      /drop constraint if exists marketing_campaign_recipients_status_check/i,
    );
    assert.doesNotMatch(sql, /status in \('pending'.*'delivered'/i);
  });

  it("9) no global provider_message_id uniqueness", () => {
    assert.doesNotMatch(sql, /unique\s+index[\s\S]{0,120}provider_message_id/i);
    assert.doesNotMatch(sql, /unique\s*\(\s*provider_message_id\s*\)/i);
  });

  it("10) no customer mutation", () => {
    assert.doesNotMatch(sql, /\b(update|delete|insert)\s+public\.customers\b/i);
  });

  it("11) no campaign/queue activity / DML on recipients", () => {
    assert.doesNotMatch(
      sql,
      /\b(update|delete)\s+public\.marketing_campaign_recipients\b/i,
    );
    assert.doesNotMatch(sql, /\binsert\s+into\s+public\.notification_queue\b/i);
    assert.doesNotMatch(sql, /graph\.facebook|processQueue|executeCampaign/i);
    assert.doesNotMatch(sql, /disable row level security/i);
  });
});
