import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { deploymentFileProblems, serverEnvProblems } from "./validate-vps-config.mjs";
import { recordedProductionSupabaseOrigin } from "./lib/env-mode.mjs";
import { VPS_PUBLIC_URLS } from "./lib/vps-runtime.mjs";

describe("VPS deployment files", () => {
  it("accepts the checked-in compose, proxy, and env template", () => {
    assert.deepEqual(deploymentFileProblems(), []);
  });

  it("rejects a server env that uses loopback or a placeholder secret", () => {
    const problems = serverEnvProblems({
      ...VPS_PUBLIC_URLS,
      VALUEOR_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: "dev-secret-change-me",
      INTERNAL_API_KEY: "real-internal-value",
      SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SUPABASE_DB_PASSWORD: "db-password-test",
      ACME_EMAIL: "ops@example.com",
      ALERT_WEBHOOK_URL: "https://alerts.example/hook",
      EMBEDDING_WORKER_ENABLED: "true",
    });
    assert.ok(problems.some((problem) => problem.includes("SESSION_SECRET")));
    assert.ok(problems.some((problem) => problem.includes("SUPABASE_URL") || problem.includes("127.0.0.1")));
    const databaseProblems = serverEnvProblems({
      ...VPS_PUBLIC_URLS,
      VALUEOR_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: "synthetic-session-value",
      INTERNAL_API_KEY: "synthetic-internal-value",
      SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      ACME_EMAIL: "ops@example.com",
      ALERT_WEBHOOK_URL: "https://alerts.example/hook",
      EMBEDDING_WORKER_ENABLED: "true",
    });
    assert.ok(databaseProblems.some((problem) => problem.includes("DATABASE_URL")));
    assert.ok(databaseProblems.some((problem) => problem.includes("recorded hosted Production project")));
  });

  it("accepts a complete synthetic server env without echoing values", () => {
    const env = {
      ...VPS_PUBLIC_URLS,
      VALUEOR_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: "synthetic-session-value",
      INTERNAL_API_KEY: "synthetic-internal-value",
      SUPABASE_URL: recordedProductionSupabaseOrigin(),
      VITE_SUPABASE_URL: recordedProductionSupabaseOrigin(),
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SUPABASE_DB_PASSWORD: "db-password-test",
      ACME_EMAIL: "ops@example.com",
      ALERT_WEBHOOK_URL: "https://alerts.example/hook",
      EMBEDDING_WORKER_ENABLED: "true",
    };
    const problems = serverEnvProblems(env);
    assert.deepEqual(problems, []);
    const directory = mkdtempSync(join(tmpdir(), "valueor-vps-"));
    const file = join(directory, "production.env");
    writeFileSync(file, Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n"));
    assert.equal(file.includes("production.env"), true);
  });
});
