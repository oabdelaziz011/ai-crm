import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  here,
  "../../../../supabase/migrations/465_messenger_settings_upsert_update_existing.sql",
);

describe("465 Messenger settings upsert update-existing contracts", () => {
  const sql = readFileSync(migrationPath, "utf8");
  // Strip SQL line comments so header prose about the old ON CONFLICT path is ignored.
  const code = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  it("replaces internal upsert and updates when company row exists", () => {
    assert.match(code, /create or replace function internal\.upsert_company_messenger_settings/i);
    assert.match(code, /if existing\.company_id is not null then/i);
    assert.match(code, /update public\.company_messenger_settings set/i);
    assert.match(code, /where company_id = p_company_id/i);
  });

  it("inserts only when no company settings row exists", () => {
    assert.match(code, /else\s+insert into public\.company_messenger_settings/is);
    assert.doesNotMatch(code, /on conflict\s*\(\s*company_id\s*\)/i);
  });

  it("rejects page_id owned by another company without dropping the unique index", () => {
    assert.match(code, /already linked to another company/i);
    assert.match(code, /s\.company_id is distinct from p_company_id/i);
    assert.doesNotMatch(code, /drop index.*uq_company_messenger_settings_page_id/i);
  });

  it("preserves encrypted secrets via unchanged-secret path", () => {
    assert.match(code, /whatsapp_is_unchanged_secret\(resolved_access_token\)/i);
    assert.match(code, /existing\.access_token_encrypted/i);
    assert.match(code, /existing\.webhook_verify_token_encrypted/i);
    assert.match(code, /existing\.app_secret_encrypted/i);
    assert.doesNotMatch(code, /delete from public\.company_messenger_settings/i);
  });
});
