import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = readFileSync(
  fileURLToPath(new URL("../deploy/vps/deploy-production.sh", import.meta.url)),
  "utf8",
);
const unit = readFileSync(
  fileURLToPath(new URL("../deploy/vps/systemd/valueor-api.service", import.meta.url)),
  "utf8",
);
const nginxApi = readFileSync(
  fileURLToPath(new URL("../deploy/vps/nginx/valueor-api.conf", import.meta.url)),
  "utf8",
);
const nginxFe = readFileSync(
  fileURLToPath(new URL("../deploy/vps/nginx/valueor-frontend.conf", import.meta.url)),
  "utf8",
);

describe("deploy-production safety gates", () => {
  it("requires explicit confirmation before stopping processes or reloading nginx", () => {
    assert.match(script, /--confirm-stop-port-holder/);
    assert.match(script, /--confirm-reload-nginx/);
    assert.match(script, /Refusing handover without --confirm-stop-port-holder/);
    assert.match(script, /Refusing Nginx reload without --confirm-reload-nginx/);
    assert.match(script, /Never modifies DNS, Meta, Supabase SQL/);
    assert.equal(script.includes("pkill"), false);
    assert.equal(script.includes("DROP "), false);
  });

  it("keeps systemd on port 3001 with workers off and required EnvironmentFile", () => {
    assert.match(unit, /EnvironmentFile=\/opt\/valueor\/\.env/);
    assert.match(unit, /PORT=3001/);
    assert.match(unit, /EMAIL_POLL_WORKER_ENABLED=false/);
    assert.match(unit, /SESSION_IDLE_TIMEOUT_WORKER_ENABLED=false/);
    assert.match(unit, /BILLING_LIFECYCLE_WORKER_ENABLED=false/);
    assert.match(unit, /MemoryMax=1200M/);
    assert.match(unit, /deploy\/vps\/start-api\.mjs/);
  });

  it("routes api and webhook to 3001 and www to /var/www/valueor", () => {
    assert.match(nginxApi, /api\.valueor\.org/);
    assert.match(nginxApi, /webhook\.valueor\.org/);
    assert.match(nginxApi, /127\.0\.0\.1:3001/);
    assert.match(nginxApi, /server_tokens off/);
    assert.match(nginxFe, /www\.valueor\.org/);
    assert.match(nginxFe, /\/var\/www\/valueor/);
    assert.equal(nginxFe.includes("app.valueor.org"), false);
  });
});
