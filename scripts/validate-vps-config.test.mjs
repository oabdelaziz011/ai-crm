import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { platformWorkerProblems } from "./check-production-worker.mjs";
import {
  caddyUsesLetsEncryptEmail,
  deploymentFileProblems,
  envFileStructureProblems,
  serverEnvProblems,
} from "./validate-vps-config.mjs";
import { recordedProductionSupabaseOrigin } from "./lib/env-mode.mjs";
import { VPS_PUBLIC_URLS } from "./lib/vps-runtime.mjs";

describe("VPS deployment files", () => {
  it("accepts the checked-in compose, proxy, and env template", () => {
    assert.deepEqual(deploymentFileProblems(), []);
  });

  it("rejects orphan URI lines in dotenv files without echoing values", () => {
    const problems = envFileStructureProblems(
      ["DATABASE_URL=postgresql://example.invalid/db", "postgresql://orphan.example/db# --- Billing / payments (optional client-side) ---", ""].join(
        "\n",
      ),
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /line 2/);
    assert.match(problems[0], /orphan URI/);
    assert.ok(!problems[0].includes("postgresql://orphan"));
    assert.deepEqual(envFileStructureProblems("DATABASE_URL=postgresql://example.invalid/db\n"), []);
  });

  it("requires remote-deploy to preserve env bak sidecars and ignore them in git", () => {
    const problems = deploymentFileProblems();
    assert.deepEqual(
      problems.filter((problem) => /production\.env\.bak|preserve_env_backup|git status --short|\.gitignore/.test(problem)),
      [],
    );
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
    assert.deepEqual(serverEnvProblems({ ...env, EMBEDDING_WORKER_ENABLED: "false" }), []);
    assert.deepEqual(
      serverEnvProblems({
        ...env,
        VITE_APP_ORIGIN: "https://www.valueor.org",
        FRONTEND_ORIGIN: "https://www.valueor.org",
        VITE_SITE_URL: "https://www.valueor.org",
      }),
      [],
    );
    assert.ok(
      platformWorkerProblems({ ...env, EMBEDDING_WORKER_ENABLED: "false" }).includes("EMBEDDING_WORKER_ENABLED is false."),
    );
    const directory = mkdtempSync(join(tmpdir(), "valueor-vps-"));
    const file = join(directory, "production.env");
    writeFileSync(file, Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n"));
    assert.equal(file.includes("production.env"), true);
  });

  it("treats ALERT_WEBHOOK_URL as optional for server and worker checks", () => {
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
      EMBEDDING_WORKER_ENABLED: "true",
    };
    assert.deepEqual(serverEnvProblems(env), []);
    assert.deepEqual(serverEnvProblems({ ...env, ALERT_WEBHOOK_URL: "" }), []);
    assert.deepEqual(platformWorkerProblems(env).filter((p) => p.includes("ALERT_WEBHOOK")), []);
    assert.deepEqual(platformWorkerProblems({ ...env, ALERT_WEBHOOK_URL: "" }).filter((p) => p.includes("ALERT_WEBHOOK")), []);
  });

  it("requires ACME_EMAIL only for the Let's Encrypt Caddyfile path", () => {
    assert.equal(caddyUsesLetsEncryptEmail({}), true);
    assert.equal(caddyUsesLetsEncryptEmail({ CADDYFILE: "./Caddyfile" }), true);
    assert.equal(caddyUsesLetsEncryptEmail({ CADDYFILE: "./Caddyfile.cloudflare" }), false);
    assert.equal(caddyUsesLetsEncryptEmail({ CADDYFILE: "deploy/vps/Caddyfile.cloudflare" }), false);

    const base = {
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
      EMBEDDING_WORKER_ENABLED: "true",
    };

    const letsEncryptMissing = serverEnvProblems(base);
    assert.ok(letsEncryptMissing.some((problem) => problem.includes("ACME_EMAIL")));

    assert.deepEqual(
      serverEnvProblems({ ...base, CADDYFILE: "./Caddyfile.cloudflare" }),
      [],
    );
    assert.deepEqual(
      serverEnvProblems({ ...base, ACME_EMAIL: "ops@example.com" }),
      [],
    );
  });
});
