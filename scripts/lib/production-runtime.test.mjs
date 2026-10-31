import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productionRuntimeProblems } from "./production-runtime.mjs";
import { normalizeProjectEnv } from "./load-project-env.mjs";

const ready = {
  VALUEOR_ENV: "production",
  NODE_ENV: "production",
  SESSION_SECRET: "prod-session-secret-value",
  INTERNAL_API_KEY: "prod-internal-key-value",
  WEBHOOK_BASE_URL: "https://webhook.valueor.org",
  VITE_API_SERVER_URL: "https://api.valueor.internal",
  SUPABASE_URL: "https://example.supabase.co",
};

describe("production runtime", () => {
  it("accepts a complete production profile", () => {
    assert.deepEqual(productionRuntimeProblems(ready), []);
  });

  it("rejects development placeholders and loopback", () => {
    const problems = productionRuntimeProblems({
      ...ready,
      NODE_ENV: "development",
      SESSION_SECRET: "dev-secret-change-me",
      INTERNAL_API_KEY: "dev-internal-api-key",
      WEBHOOK_BASE_URL: "https://developer.example",
      VITE_API_SERVER_URL: "http://localhost:3000",
    });
    assert.ok(problems.some((line) => line.includes("NODE_ENV")));
    assert.ok(problems.some((line) => line.includes("SESSION_SECRET")));
    assert.ok(problems.some((line) => line.includes("INTERNAL_API_KEY")));
    assert.ok(problems.some((line) => line.includes("WEBHOOK_BASE_URL")));
    assert.ok(problems.some((line) => line.includes("VITE_API_SERVER_URL")));
  });

  it("does not invent development secrets for production mode", () => {
    const env = normalizeProjectEnv({}, { mode: "production" });
    assert.equal(env.NODE_ENV, "production");
    assert.equal(env.SESSION_SECRET, undefined);
    assert.equal(env.INTERNAL_API_KEY, undefined);
  });
  it("keeps the billing lifecycle worker off until it is confirmed", () => {
    const problems = productionRuntimeProblems({
      ...ready,
      BILLING_LIFECYCLE_WORKER_ENABLED: "true",
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /BILLING_LIFECYCLE_WORKER_CONFIRMED/);
  });
});
