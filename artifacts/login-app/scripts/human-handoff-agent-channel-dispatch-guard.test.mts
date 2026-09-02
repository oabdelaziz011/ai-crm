import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("Migration 337 — HHA channel.platform.dispatch", () => {
  const sql = readFileSync(
    resolve(here, "../../../supabase/migrations/337_human_handoff_agent_channel_dispatch.sql"),
    "utf8",
  );

  it("adds channel.platform.dispatch to human_handoff_agent template and backfills roles", () => {
    assert.match(sql, /'human_handoff_agent',\s*'channel\.platform\.dispatch'/);
    assert.match(sql, /template_key = 'human_handoff_agent'/);
    assert.match(sql, /insert into public\.role_permissions/);
  });
});
