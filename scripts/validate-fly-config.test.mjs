import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const flyToml = readFileSync(new URL("../fly.toml", import.meta.url), "utf8");

describe("Fly API machine config", () => {
  it("keeps one always-on 1 GB machine and a liveness check", () => {
    assert.match(flyToml, /auto_stop_machines = "off"/);
    assert.match(flyToml, /auto_start_machines = false/);
    assert.match(flyToml, /memory = "1gb"/);
    assert.match(flyToml, /internal_port = 3000/);
    assert.match(flyToml, /path = "\/api\/healthz"/);
    assert.match(flyToml, /kill_signal = "SIGTERM"/);
    assert.match(flyToml, /kill_timeout = 30/);
    assert.match(flyToml, /build-target = "app"/);
    assert.match(flyToml, /EMBEDDING_WORKER_ENABLED = "false"/);
    assert.equal(flyToml.includes("min_machines_running"), false);
    assert.equal((flyToml.match(/^\[\[vm\]\]/gm) ?? []).length, 1);
  });

  it("does not commit secret material", () => {
    assert.equal(/sk_live|sk_test|eyJ|postgres(?:ql)?:\/\//i.test(flyToml), false);
    for (const key of ["SESSION_SECRET", "INTERNAL_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "SUPABASE_DB_PASSWORD"]) {
      assert.equal(flyToml.includes(`${key} =`), false, key);
    }
  });
});
