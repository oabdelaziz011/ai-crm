import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  PRODUCTION_TOPOLOGY,
  apiReleaseDir,
  assertFullGitSha,
  frontendReleaseDir,
  productionScriptProblems,
  rewriteApiSafeStartExec,
  unitReleaseDropInContents,
  workflowProductionPathProblems,
} from "./lib/systemd-release.mjs";
import { deploymentFileProblems, serverEnvProblems } from "./validate-vps-config.mjs";
import { recordedProductionSupabaseOrigin } from "./lib/env-mode.mjs";
import { VPS_PUBLIC_URLS } from "./lib/vps-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const switchJs = join(root, "scripts/systemd-release-switch.mjs");

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function seedSyntheticEnv(envPath) {
  const env = {
    ...VPS_PUBLIC_URLS,
    VITE_SITE_URL: "https://www.valueor.org",
    VALUEOR_ENV: "production",
    NODE_ENV: "production",
    SESSION_SECRET: "synthetic-session-value",
    INTERNAL_API_KEY: "synthetic-internal-value",
    SUPABASE_URL: recordedProductionSupabaseOrigin(),
    VITE_SUPABASE_URL: recordedProductionSupabaseOrigin(),
    VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    SUPABASE_DB_PASSWORD: "db-password-test",
  };
  writeFileSync(envPath, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return env;
}

function seedApiArtifact(dir, marker) {
  mkdirSync(join(dir, "artifacts/api-server/dist"), { recursive: true });
  mkdirSync(join(dir, "deploy/vps"), { recursive: true });
  mkdirSync(join(dir, "scripts/lib"), { recursive: true });
  writeFileSync(join(dir, "artifacts/api-server/dist/main.mjs"), `export const marker=${JSON.stringify(marker)};\n`);
  writeFileSync(
    join(dir, "deploy/vps/start-api.mjs"),
    "#!/usr/bin/env node\nconsole.log('start-api');\n",
  );
  cpSync(join(root, "scripts/lib"), join(dir, "scripts/lib"), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}\n");
}

function seedFrontendArtifact(dir, sha) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<html><body>ok</body></html>\n");
  writeFileSync(join(dir, "version.json"), JSON.stringify({ service: "login-app", sha }) + "\n");
}

describe("systemd release helpers", () => {
  it("rewrites only the exec line in api-safe-start.sh", () => {
    const original = [
      "#!/bin/bash",
      "set -eu",
      "export VITE_SITE_URL=https://app.valueor.org",
      "export PUBLIC_WEBHOOK_BASE_URL=https://webhook.valueor.org",
      "export NODE_PATH=/opt/valueor-runtime/node_modules",
      "exec /usr/bin/node /opt/valueor-releases/bc5125d888481ca9/deploy/vps/start-api.mjs",
      "",
    ].join("\n");
    const next = rewriteApiSafeStartExec(original, "/opt/valueor-current");
    assert.match(next, /export VITE_SITE_URL=https:\/\/app\.valueor\.org/);
    assert.match(next, /export PUBLIC_WEBHOOK_BASE_URL=https:\/\/webhook\.valueor\.org/);
    assert.match(next, /exec \/usr\/bin\/node \/opt\/valueor-current\/deploy\/vps\/start-api\.mjs/);
    assert.ok(!next.includes("/opt/valueor-releases/bc5125d888481ca9/deploy/vps/start-api.mjs"));
  });

  it("rejects invalid SHAs", () => {
    assert.throws(() => assertFullGitSha("abc"), /40-char/);
  });

  it("builds release drop-in without replacing the unit template", () => {
    const text = unitReleaseDropInContents();
    assert.match(text, /WorkingDirectory=\/opt\/valueor-current/);
    assert.ok(!text.includes("ExecStart="));
  });
});

describe("production path guards", () => {
  it("accepts checked-in deploy files for the permanent topology", () => {
    assert.deepEqual(deploymentFileProblems(), []);
  });

  it("forbids docker in production wrappers and systemd release scripts", () => {
    for (const file of [
      "deploy/vps/valueor-prod-deploy.sh",
      "deploy/vps/valueor-prod-rollback.sh",
      "deploy/vps/systemd-release-deploy.sh",
      "deploy/vps/systemd-release-rollback.sh",
    ]) {
      const text = readFileSync(join(root, file), "utf8");
      const role =
        file.endsWith("valueor-prod-deploy.sh")
          ? "prod-deploy-wrapper"
          : file.endsWith("valueor-prod-rollback.sh")
            ? "prod-rollback-wrapper"
            : file;
      assert.deepEqual(productionScriptProblems(text, { role }), []);
    }
  });

  it("requires the workflow to use self-hosted production deploy wrappers", () => {
    const workflow = readFileSync(join(root, ".github/workflows/vps-deploy.yml"), "utf8");
    assert.deepEqual(workflowProductionPathProblems(workflow), []);
    assert.ok(!workflow.includes("remote-deploy.sh"));
    assert.ok(!workflow.includes("remote-rollback.sh"));
  });

  it("does not require ACME_EMAIL for nginx-systemd topology", () => {
    const env = {
      ...VPS_PUBLIC_URLS,
      VITE_SITE_URL: "https://www.valueor.org",
      VALUEOR_ENV: "production",
      NODE_ENV: "production",
      SESSION_SECRET: "synthetic-session-value",
      INTERNAL_API_KEY: "synthetic-internal-value",
      SUPABASE_URL: recordedProductionSupabaseOrigin(),
      VITE_SUPABASE_URL: recordedProductionSupabaseOrigin(),
      VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
      SUPABASE_DB_PASSWORD: "db-password-test",
    };
    assert.deepEqual(serverEnvProblems(env, { topology: PRODUCTION_TOPOLOGY }), []);
    assert.ok(serverEnvProblems(env, { topology: "compose" }).some((p) => p.includes("ACME_EMAIL")));
  });
});

describe("isolated release switch deploy + rollback", () => {
  it("installs versioned releases, flips symlinks, preserves previous, and rolls back", () => {
    const prefix = mkdtempSync(join(tmpdir(), "valueor-release-"));
    const apiA = join(prefix, "artifact-api-a");
    const apiB = join(prefix, "artifact-api-b");
    const feA = join(prefix, "artifact-fe-a");
    const feB = join(prefix, "artifact-fe-b");
    seedApiArtifact(apiA, "A");
    seedApiArtifact(apiB, "B");
    seedFrontendArtifact(feA, SHA_A);
    seedFrontendArtifact(feB, SHA_B);

    mkdirSync(join(prefix, "opt/valueor"), { recursive: true });
    mkdirSync(join(prefix, "etc/valueor"), { recursive: true });
    mkdirSync(join(prefix, "var/lib/valueor"), { recursive: true });
    mkdirSync(join(prefix, "opt/valueor-releases"), { recursive: true });
    mkdirSync(join(prefix, "opt/valueor-frontend-releases"), { recursive: true });
    mkdirSync(join(prefix, "var/www"), { recursive: true });
    seedSyntheticEnv(join(prefix, "opt/valueor/.env"));

    writeFileSync(
      join(prefix, "etc/valueor/api-safe-start.sh"),
      [
        "#!/bin/bash",
        "set -eu",
        "export VITE_SITE_URL=https://app.valueor.org",
        "export PUBLIC_WEBHOOK_BASE_URL=https://webhook.valueor.org",
        "export NODE_PATH=/opt/valueor-runtime/node_modules",
        "exec /usr/bin/node /opt/valueor-releases/old/deploy/vps/start-api.mjs",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    // Seed an initial "current" release so rollback has a previous pointer after first deploy.
    const initialApi = join(prefix, "opt/valueor-releases/initial000000000");
    mkdirSync(join(initialApi, "deploy/vps"), { recursive: true });
    writeFileSync(join(initialApi, "deploy/vps/start-api.mjs"), "console.log('initial')\n");
    writeFileSync(join(initialApi, "RELEASE_SHA"), `${SHA_A.replace(/a/g, "0")}\n`);
    // Use valid sha file for initial — rewrite to a real 40-char later via deploy state
    writeFileSync(join(initialApi, "RELEASE_SHA"), "0000000000000000000000000000000000000000\n");
    const initialFe = join(prefix, "opt/valueor-frontend-releases/initial-fe");
    mkdirSync(initialFe, { recursive: true });
    writeFileSync(join(initialFe, "index.html"), "initial\n");
    const linkType = process.platform === "win32" ? "junction" : undefined;
    if (linkType) {
      symlinkSync(initialApi, join(prefix, "opt/valueor-current"), linkType);
      symlinkSync(initialFe, join(prefix, "var/www/valueor"), linkType);
    } else {
      symlinkSync(initialApi, join(prefix, "opt/valueor-current"));
      symlinkSync(initialFe, join(prefix, "var/www/valueor"));
    }

    const runSwitch = (args) => {
      const result = spawnSync(process.execPath, [switchJs, ...args], {
        encoding: "utf8",
        env: process.env,
      });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `exit ${result.status}`);
      }
      return result;
    };

    runSwitch([
      "deploy",
      "--sha",
      SHA_A,
      "--api-src",
      apiA,
      "--frontend-src",
      feA,
      "--root",
      prefix,
      "--skip-health",
      "--skip-restart",
    ]);

    const norm = (p) => String(p).replace(/\\/g, "/");
    const apiLink = norm(readlinkSync(join(prefix, "opt/valueor-current")));
    const feLink = norm(readlinkSync(join(prefix, "var/www/valueor")));
    assert.equal(apiLink, norm(apiReleaseDir({ apiReleasesDir: `${norm(prefix)}/opt/valueor-releases` }, SHA_A)));
    assert.equal(feLink, norm(frontendReleaseDir({ frontendReleasesDir: `${norm(prefix)}/opt/valueor-frontend-releases` }, SHA_A)));
    assert.equal(norm(readlinkSync(join(prefix, "var/www/valueor.previous"))), norm(initialFe));
    assert.match(
      readFileSync(join(prefix, "etc/valueor/api-safe-start.sh"), "utf8"),
      /export VITE_SITE_URL=https:\/\/app\.valueor\.org/,
    );
    assert.match(
      readFileSync(join(prefix, "etc/valueor/api-safe-start.sh"), "utf8"),
      /exec \/usr\/bin\/node .*opt\/valueor-current\/deploy\/vps\/start-api\.mjs/,
    );
    assert.ok(existsSync(join(prefix, "etc/systemd/system/valueor-api.service.d/50-release.conf")));
    assert.ok(existsSync(join(prefix, "var/lib/valueor/deploy-state.json")));
    assert.ok(existsSync(join(apiLink, "artifacts/api-server/dist/main.mjs")));

    runSwitch([
      "deploy",
      "--sha",
      SHA_B,
      "--api-src",
      apiB,
      "--frontend-src",
      feB,
      "--root",
      prefix,
      "--skip-health",
      "--skip-restart",
    ]);

    assert.equal(
      norm(readlinkSync(join(prefix, "opt/valueor-current"))),
      norm(apiReleaseDir({ apiReleasesDir: `${norm(prefix)}/opt/valueor-releases` }, SHA_B)),
    );
    assert.equal(
      norm(readlinkSync(join(prefix, "var/www/valueor.previous"))),
      norm(frontendReleaseDir({ frontendReleasesDir: `${norm(prefix)}/opt/valueor-frontend-releases` }, SHA_A)),
    );

    const beforeRollbackApi = norm(readlinkSync(join(prefix, "opt/valueor-current")));
    runSwitch(["rollback", "--root", prefix, "--skip-health", "--skip-restart"]);
    assert.equal(
      norm(readlinkSync(join(prefix, "opt/valueor-current"))),
      norm(apiReleaseDir({ apiReleasesDir: `${norm(prefix)}/opt/valueor-releases` }, SHA_A)),
    );
    assert.equal(
      norm(readlinkSync(join(prefix, "var/www/valueor"))),
      norm(frontendReleaseDir({ frontendReleasesDir: `${norm(prefix)}/opt/valueor-frontend-releases` }, SHA_A)),
    );
    assert.notEqual(norm(readlinkSync(join(prefix, "opt/valueor-current"))), beforeRollbackApi);

    assert.ok(existsSync(apiReleaseDir({ apiReleasesDir: `${norm(prefix)}/opt/valueor-releases` }, SHA_B)));
    assert.ok(
      existsSync(frontendReleaseDir({ frontendReleasesDir: `${norm(prefix)}/opt/valueor-frontend-releases` }, SHA_B)),
    );

    // Rollback without state must fail closed.
    rmSync(join(prefix, "var/lib/valueor/deploy-state.json"), { force: true });
    const missingState = spawnSync(process.execPath, [switchJs, "rollback", "--root", prefix, "--skip-health", "--skip-restart"], {
      encoding: "utf8",
    });
    assert.notEqual(missingState.status, 0);
    assert.match(missingState.stderr || missingState.stdout, /Missing deploy state|ERROR/);

    rmSync(prefix, { recursive: true, force: true });
  });
});
