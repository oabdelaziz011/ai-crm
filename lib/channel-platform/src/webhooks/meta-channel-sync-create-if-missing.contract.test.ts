import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  here,
  "../../../../supabase/migrations/464_sync_messenger_instagram_channel_create_if_missing.sql",
);

describe("464 Messenger/Instagram sync create-if-missing contracts", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates a messenger company_channels row when none exist", () => {
    assert.match(sql, /sync_messenger_channel_references/);
    assert.match(sql, /existing_count = 0/);
    assert.match(sql, /ch\.key = 'messenger'/);
    assert.match(sql, /insert into public\.company_channels/);
    assert.match(sql, /credentialsSource',\s*'company_messenger_settings'/);
    // Must not invent Page IDs — only copy non-empty settings.page_id.
    assert.match(sql, /nullif\(trim\(settings_row\.page_id\), ''\)/);
    assert.doesNotMatch(sql, /page_id\s*=\s*'[0-9]+'/);
  });

  it("creates an instagram company_channels row when none exist", () => {
    assert.match(sql, /sync_instagram_channel_references/);
    assert.match(sql, /ch\.key = 'instagram'/);
    assert.match(sql, /credentialsSource',\s*'company_instagram_settings'/);
    assert.match(sql, /instagramBusinessAccountId/);
    assert.doesNotMatch(sql, /instagram_business_account_id\s*=\s*'[0-9]+'/);
  });

  it("updates existing channels (idempotent re-sync) and mirrors enabled state", () => {
    assert.match(sql, /is_enabled = settings_row\.enabled/);
    assert.match(sql, /when settings_row\.enabled then 'active'/);
    assert.match(sql, /for company_row in\s+select company_id from public\.company_messenger_settings/s);
    assert.match(sql, /for company_row in\s+select company_id from public\.company_instagram_settings/s);
  });

  it("keeps sync execute grants service_role-only", () => {
    assert.match(
      sql,
      /revoke all on function public\.sync_messenger_channel_references\(uuid\) from authenticated/i,
    );
    assert.match(
      sql,
      /grant execute on function public\.sync_messenger_channel_references\(uuid\) to service_role/i,
    );
    assert.match(
      sql,
      /grant execute on function public\.sync_instagram_channel_references\(uuid\) to service_role/i,
    );
  });
});
