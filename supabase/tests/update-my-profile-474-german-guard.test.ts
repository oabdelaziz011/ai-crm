import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sqlPath = path.join(root, "supabase/migrations/474_update_my_profile_allow_german.sql");

describe("474 update_my_profile German language allowlist", () => {
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("allows preferred_language de alongside en/ar", () => {
    assert.match(sql, /not in \('en', 'ar', 'de'\)/);
  });

  it("does not drop or recreate the public wrapper signature", () => {
    assert.doesNotMatch(sql, /drop function/i);
  });

  it("keeps security definer on the internal body", () => {
    assert.match(sql, /security definer/i);
  });
});
