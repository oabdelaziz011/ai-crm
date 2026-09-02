/**
 * Unit tests: cloudflared launch selection (config vs token).
 * Run: node scripts/cloudflare/run-tunnel.test.mjs
 */
import assert from "node:assert/strict";
import { resolveCloudflaredTunnelLaunch } from "./resolve-tunnel-launch.mjs";

const CONFIG_PATH = "/repo/infra/cloudflare/config.yml";

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

test("config.yml takes precedence over CLOUDFLARE_TUNNEL_TOKEN", () => {
  const launch = resolveCloudflaredTunnelLaunch({
    configPath: CONFIG_PATH,
    configExists: true,
    token: "dashboard-token",
  });

  assert.equal(launch?.mode, "config");
  assert.deepEqual(launch?.args, ["tunnel", "--config", CONFIG_PATH, "run"]);
  assert.match(launch?.logMessage ?? "", /config\.yml/);
});

test("token mode is used only when config.yml is absent", () => {
  const launch = resolveCloudflaredTunnelLaunch({
    configPath: CONFIG_PATH,
    configExists: false,
    token: "dashboard-token",
  });

  assert.equal(launch?.mode, "token");
  assert.deepEqual(launch?.args, ["tunnel", "run", "--token", "dashboard-token"]);
});

test("returns null when neither config nor token is available", () => {
  const launch = resolveCloudflaredTunnelLaunch({
    configPath: CONFIG_PATH,
    configExists: false,
    token: "",
  });

  assert.equal(launch, null);
});

console.log("All run-tunnel launch tests passed.");
