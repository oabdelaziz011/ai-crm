import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadProjectEnv, validateApiServerEnv } from "./lib/load-project-env.mjs";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const tempRoot = mkdtempSync(resolve(tmpdir(), "ensure-root-env-"));

after(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("ensure-root-env injected environment support", () => {
  it("uses injected process values without replacing existing local env behavior", () => {
    writeFileSync(
      resolve(tempRoot, ".env"),
      [
        "SUPABASE_URL=https://local-file.invalid",
        "SUPABASE_SERVICE_ROLE_KEY=",
        "DATABASE_URL=",
        "LOCAL_ONLY=preserved",
      ].join("\n"),
      "utf8",
    );

    const previous = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      DATABASE_URL: process.env.DATABASE_URL,
    };
    process.env.SUPABASE_URL = "https://injected.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "injected-service-role";
    process.env.DATABASE_URL = "postgresql://injected.invalid/database";

    try {
      const env = loadProjectEnv(tempRoot, { mergeProcessEnv: true });
      assert.equal(env.SUPABASE_URL, "https://injected.invalid");
      assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "injected-service-role");
      assert.equal(env.DATABASE_URL, "postgresql://injected.invalid/database");
      assert.equal(env.LOCAL_ONLY, "preserved");
      assert.equal(validateApiServerEnv(env).ok, true);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("configures ensure-root-env to merge process values and does not log them", () => {
    const source = readFileSync(resolve(scriptsDir, "ensure-root-env.mjs"), "utf8");
    assert.match(source, /loadProjectEnv\(projectRoot, \{ mergeProcessEnv: true \}\)/);
    assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /console\.(?:log|error)\([^)]*DATABASE_URL/);
  });
});
