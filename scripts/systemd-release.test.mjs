import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_TOPOLOGY,
  apiReleaseDir,
  assertFullGitSha,
  frontendReleaseDir,
  githubWorkflowProductionEntryProblems,
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

  it("allows only one production deploy and rollback entry across all workflows", () => {
    const workflowDir = join(root, ".github/workflows");
    const workflows = readdirSync(workflowDir)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .map((name) => ({ name, text: readFileSync(join(workflowDir, name), "utf8") }));

    assert.deepEqual(githubWorkflowProductionEntryProblems(workflows), []);

    const frontend = workflows.find((item) => item.name === "frontend-production-artifact.yml");
    assert.ok(frontend, "frontend-production-artifact.yml must exist as build-only CI");
    assert.ok(!/publish-www|publish_www|VPS_SSH_KEY|\bscp\b/.test(frontend.text));

    const deployWorkflows = workflows.filter((item) => /\bvalueor-prod-deploy\b/.test(item.text));
    const rollbackWorkflows = workflows.filter((item) => /\bvalueor-prod-rollback\b/.test(item.text));
    assert.deepEqual(
      deployWorkflows.map((item) => item.name).sort(),
      ["contabo-fe-replace.yml", "vps-deploy.yml"],
    );
    assert.equal(rollbackWorkflows.length, 1);
    assert.equal(rollbackWorkflows[0].name, "vps-deploy.yml");
    const feReplace = workflows.find((item) => item.name === "contabo-fe-replace.yml");
    assert.ok(feReplace, "contabo-fe-replace.yml must exist for FE-only corrective installs");
    assert.ok(/\.replace-frontend-only\b/.test(feReplace.text));
    assert.ok(/confirm\s*==\s*'replace-frontend'/.test(feReplace.text));

    const sshPublish = workflows.filter(
      (item) => /\bVPS_SSH_KEY\b/.test(item.text) || (/\bscp\b/.test(item.text) && /\bVPS_HOST\b/.test(item.text)),
    );
    assert.deepEqual(sshPublish.map((item) => item.name), []);
  });

  it("detects a bypass frontend SSH publish workflow", () => {
    const problems = githubWorkflowProductionEntryProblems([
      {
        name: "vps-deploy.yml",
        text: readFileSync(join(root, ".github/workflows/vps-deploy.yml"), "utf8"),
      },
      {
        name: "frontend-production-artifact.yml",
        text: [
          "name: leak",
          "jobs:",
          "  publish-www:",
          "    environment: production",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: scp file $VPS_USER@$VPS_HOST:/tmp/x",
          "        env:",
          "          VPS_SSH_KEY: secret",
          "          VPS_HOST: example",
          "          VPS_USER: valueor",
        ].join("\n"),
      },
    ]);
    assert.ok(problems.some((problem) => problem.includes("frontend-production-artifact.yml")));
    assert.ok(problems.some((problem) => /VPS_SSH_KEY|scp|publish-www/.test(problem)));
  });

  it("flags valueor-prod-deploy even inside comments in non-approved workflows", () => {
    const problems = githubWorkflowProductionEntryProblems([
      {
        name: "vps-deploy.yml",
        text: readFileSync(join(root, ".github/workflows/vps-deploy.yml"), "utf8"),
      },
      {
        name: "build-production-release-artifact.yml",
        text: [
          "name: Build production release artifact",
          "# Does NOT call valueor-prod-deploy",
          "on: workflow_dispatch",
          "jobs:",
          "  build:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo build-only",
        ].join("\n"),
      },
    ]);
    assert.ok(
      problems.some(
        (problem) =>
          problem.includes("build-production-release-artifact.yml") &&
          problem.includes("valueor-prod-deploy"),
      ),
      "comment-only mentions of valueor-prod-deploy must still fail validation",
    );
  });

  it("keeps build-production-release-artifact.yml free of Contabo publish markers", () => {
    const text = readFileSync(
      join(root, ".github/workflows/build-production-release-artifact.yml"),
      "utf8",
    );
    assert.ok(!/\bvalueor-prod-deploy\b/.test(text));
    assert.ok(!/\bvalueor-prod-rollback\b/.test(text));
    assert.ok(!/\bVPS_SSH_KEY\b/.test(text));
    assert.ok(!/\bscp\b/.test(text));
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

  it("replace-frontend quarantines corrupt same-SHA dir without touching API", () => {
    const prefix = mkdtempSync(join(tmpdir(), "vo-fe-replace-"));
    mkdirSync(join(prefix, "opt/valueor-releases"), { recursive: true });
    mkdirSync(join(prefix, "opt/valueor-frontend-releases"), { recursive: true });
    mkdirSync(join(prefix, "opt"), { recursive: true });
    mkdirSync(join(prefix, "var/www"), { recursive: true });
    mkdirSync(join(prefix, "var/lib/valueor"), { recursive: true });
    mkdirSync(join(prefix, "etc/valueor"), { recursive: true });
    writeFileSync(
      join(prefix, "etc/valueor/api-safe-start.sh"),
      "#!/bin/bash\nset -eu\nexport VALUEOR_ENV=production\nexec /usr/bin/node /opt/valueor-releases/placeholder/deploy/vps/start-api.mjs\n",
    );

    const apiKeep = join(prefix, "opt/valueor-releases/aaaaaaaaaaaaaaaa");
    mkdirSync(join(apiKeep, "deploy/vps"), { recursive: true });
    writeFileSync(join(apiKeep, "deploy/vps/start-api.mjs"), "console.log('api')\n");
    writeFileSync(join(apiKeep, "RELEASE_SHA"), `${SHA_A}\n`);
    const linkType = process.platform === "win32" ? "junction" : undefined;
    if (linkType) symlinkSync(apiKeep, join(prefix, "opt/valueor-current"), linkType);
    else symlinkSync(apiKeep, join(prefix, "opt/valueor-current"));

    const corruptFe = join(prefix, "opt/valueor-frontend-releases", SHA_A.slice(0, 16));
    mkdirSync(join(corruptFe, "assets"), { recursive: true });
    writeFileSync(join(corruptFe, "index.html"), `<meta name="valueor-build" content="${SHA_B}" />\n`);
    writeFileSync(join(corruptFe, "version.json"), `${JSON.stringify({ service: "login-app", sha: SHA_B })}\n`);
    writeFileSync(join(corruptFe, "assets/old.js"), "old-bundle\n");
    const goodPrev = join(prefix, "opt/valueor-frontend-releases/prev-good");
    mkdirSync(goodPrev, { recursive: true });
    writeFileSync(join(goodPrev, "index.html"), "prev\n");
    if (linkType) {
      symlinkSync(corruptFe, join(prefix, "var/www/valueor"), linkType);
      symlinkSync(goodPrev, join(prefix, "var/www/valueor.previous"), linkType);
    } else {
      symlinkSync(corruptFe, join(prefix, "var/www/valueor"));
      symlinkSync(goodPrev, join(prefix, "var/www/valueor.previous"));
    }

    writeFileSync(
      join(prefix, "var/lib/valueor/deploy-state.json"),
      `${JSON.stringify(
        {
          topology: "nginx-systemd",
          sha: SHA_A,
          apiRelease: apiKeep.replace(/\\/g, "/"),
          frontendRelease: corruptFe.replace(/\\/g, "/"),
          previousApiRelease: null,
          previousFrontendRelease: goodPrev.replace(/\\/g, "/"),
          previousFrontendPrevious: null,
        },
        null,
        2,
      )}\n`,
    );

    const feGood = mkdtempSync(join(tmpdir(), "vo-fe-good-"));
    mkdirSync(join(feGood, "assets"), { recursive: true });
    writeFileSync(
      join(feGood, "index.html"),
      `<html><head><meta name="valueor-build" content="${SHA_A}" /></head></html>\n`,
    );
    writeFileSync(join(feGood, "version.json"), `${JSON.stringify({ service: "login-app", sha: SHA_A })}\n`);
    writeFileSync(
      join(feGood, "assets/new.js"),
      "assignedAiEmployeeId missingConfigKeys MSL_META_CONFIG_MISSING\n",
    );

    const result = spawnSync(
      process.execPath,
      [
        switchJs,
        "replace-frontend",
        "--sha",
        SHA_A,
        "--frontend-src",
        feGood,
        "--root",
        prefix,
      ],
      { encoding: "utf8", env: process.env },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `exit ${result.status}`);
    }

    const norm = (p) => String(p).replace(/\\/g, "/");
    assert.equal(
      norm(readlinkSync(join(prefix, "var/www/valueor"))),
      norm(frontendReleaseDir({ frontendReleasesDir: `${norm(prefix)}/opt/valueor-frontend-releases` }, SHA_A)),
    );
    assert.equal(norm(readlinkSync(join(prefix, "var/www/valueor.previous"))), norm(goodPrev));
    assert.equal(norm(readlinkSync(join(prefix, "opt/valueor-current"))), norm(apiKeep));
    const version = JSON.parse(readFileSync(join(prefix, "var/www/valueor/version.json"), "utf8"));
    assert.equal(version.sha, SHA_A);
    assert.match(readFileSync(join(prefix, "var/www/valueor/assets/new.js"), "utf8"), /assignedAiEmployeeId/);
    assert.match(result.stdout, /api_untouched=yes/);
    assert.match(result.stdout, /quarantined/);

    rmSync(feGood, { recursive: true, force: true });
    rmSync(prefix, { recursive: true, force: true });
  });
});
