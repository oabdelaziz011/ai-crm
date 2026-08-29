import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyApiPortListener,
  findListeningProjectApiServer,
  resolveWebhookApiLifecycle,
  isDevWatchCommandLine,
  isWebhookOwnedApiCommandLine,
} from "./spawn-utils.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const API_MAIN = resolve(PROJECT_ROOT, "artifacts/api-server/dist/main.mjs").replace(/\\/g, "/");
const DEV_WATCH = resolve(PROJECT_ROOT, "artifacts/api-server/scripts/dev-watch.mjs").replace(
  /\\/g,
  "/",
);
const START_WITH_ENV = resolve(
  PROJECT_ROOT,
  "artifacts/api-server/scripts/start-with-env.mjs",
).replace(/\\/g, "/");

describe("webhook API reuse classification", () => {
  it("detects no listener → spawn", () => {
    const inspection = findListeningProjectApiServer(3000, PROJECT_ROOT, {
      getListeningPids: () => [],
    });
    assert.equal(inspection.status, "none");
    assert.deepEqual(resolveWebhookApiLifecycle(inspection), {
      action: "spawn",
      reason: "no_listener",
      inspection,
    });
  });

  it("detects healthy dev-watch API → reuse and never reclaim/spawn", () => {
    const inspection = findListeningProjectApiServer(3000, PROJECT_ROOT, {
      getListeningPids: () => [20088],
      getProcessCommandLine: (pid) => {
        if (pid === 20088) return `node --enable-source-maps ${API_MAIN}`;
        if (pid === 31940) return `node ${DEV_WATCH}`;
        return "";
      },
      getParentPid: (pid) => (pid === 20088 ? 31940 : null),
    });

    assert.equal(inspection.status, "project_api");
    assert.equal(inspection.ownership, "dev_watch");
    assert.equal(inspection.protected, true);
    assert.equal(inspection.kind, "project_api_dev_watch");

    const lifecycle = resolveWebhookApiLifecycle(inspection);
    assert.equal(lifecycle.action, "reuse");
    assert.equal(lifecycle.reason, "dev_watch_owned");
  });

  it("detects existing webhook API → reuse (safe)", () => {
    const inspection = findListeningProjectApiServer(3000, PROJECT_ROOT, {
      getListeningPids: () => [111],
      getProcessCommandLine: () => `node ${START_WITH_ENV}`,
      getParentPid: () => null,
    });

    assert.equal(inspection.status, "project_api");
    assert.equal(inspection.ownership, "webhook");
    assert.equal(inspection.protected, false);

    const lifecycle = resolveWebhookApiLifecycle(inspection);
    assert.equal(lifecycle.action, "reuse");
    assert.equal(lifecycle.reason, "webhook_owned");
  });

  it("fails safely for unrelated process on port", () => {
    const inspection = findListeningProjectApiServer(3000, PROJECT_ROOT, {
      getListeningPids: () => [999],
      getProcessCommandLine: () => "C:/Program Files/SomeApp/app.exe --port 3000",
      getParentPid: () => null,
    });

    assert.equal(inspection.status, "unrelated");
    const lifecycle = resolveWebhookApiLifecycle(inspection);
    assert.equal(lifecycle.action, "fail");
    assert.equal(lifecycle.reason, "unrelated_process");
  });

  it("never classifies a dev-watch child as reclaimable stale webhook", () => {
    const kind = classifyApiPortListener({
      commandLine: `node --enable-source-maps ${API_MAIN}`,
      parentCommandLine: `node ${DEV_WATCH}`,
      projectRoot: PROJECT_ROOT,
    });
    assert.equal(kind, "project_api_dev_watch");
    assert.equal(isDevWatchCommandLine(`node ${DEV_WATCH}`), true);
    assert.equal(isWebhookOwnedApiCommandLine(`node --enable-source-maps ${API_MAIN}`), false);
  });

  it("keeps Cloudflare target convention as localhost + configured port", () => {
    // Tunnel still launched via resolveCloudflaredLaunch → run-tunnel.mjs / config.yml.
    // Service URL remains http://localhost:${API_SERVER_PORT}; this suite only guards the
    // process decision so webhook reuse cannot alter that contract.
    const lifecycle = resolveWebhookApiLifecycle({
      status: "project_api",
      ownership: "dev_watch",
      protected: true,
      pid: 1,
    });
    assert.equal(lifecycle.action, "reuse");
    assert.notEqual(lifecycle.action, "spawn");
  });
});
