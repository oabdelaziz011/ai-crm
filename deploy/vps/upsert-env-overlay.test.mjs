import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./upsert-env-overlay.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

describe("upsert-env-overlay", () => {
  it("accepts Messenger OAuth keys when allow-prefix is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "valueor-overlay-"));
    const envPath = join(dir, ".env");
    const overlayPath = join(dir, "messenger.overlay");
    writeFileSync(envPath, "FOO=1\nMETA_MESSENGER_OAUTH_ENABLED=false\n", "utf8");
    writeFileSync(
      overlayPath,
      "META_MESSENGER_OAUTH_ENABLED=true\nMETA_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS=2d27f7fb-c15e-4d60-84e9-1793f36f2172\n",
      "utf8",
    );
    const result = run([
      "--env",
      envPath,
      "--overlay",
      overlayPath,
      "--allow-prefix",
      "META_MESSENGER_OAUTH_",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const body = readFileSync(envPath, "utf8");
    assert.match(body, /META_MESSENGER_OAUTH_ENABLED=true/);
    assert.match(body, /META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS=2d27f7fb-c15e-4d60-84e9-1793f36f2172/);
  });

  it("refuses Messenger keys under Instagram-only default prefix", () => {
    const dir = mkdtempSync(join(tmpdir(), "valueor-overlay-deny-"));
    const envPath = join(dir, ".env");
    const overlayPath = join(dir, "bad.overlay");
    writeFileSync(envPath, "FOO=1\n", "utf8");
    writeFileSync(overlayPath, "META_MESSENGER_OAUTH_ENABLED=true\n", "utf8");
    const result = run(["--env", envPath, "--overlay", overlayPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr || result.stdout, /refusing overlay key/);
  });

  it("accepts WhatsApp Embedded Signup keys with dual allow-prefixes", () => {
    const dir = mkdtempSync(join(tmpdir(), "valueor-overlay-wa-"));
    const envPath = join(dir, ".env");
    const overlayPath = join(dir, "whatsapp.overlay");
    writeFileSync(envPath, "FOO=1\nWHATSAPP_EMBEDDED_SIGNUP_ENABLED=false\n", "utf8");
    writeFileSync(
      overlayPath,
      [
        "WHATSAPP_EMBEDDED_SIGNUP_ENABLED=true",
        "WHATSAPP_COEXISTENCE_ENABLED=false",
        "WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS=2d27f7fb-c15e-4d60-84e9-1793f36f2172",
        "META_EMBEDDED_SIGNUP_APP_ID=1400885884891475",
        "META_EMBEDDED_SIGNUP_GRAPH_VERSION=v21.0",
      ].join("\n") + "\n",
      "utf8",
    );
    const result = run([
      "--env",
      envPath,
      "--overlay",
      overlayPath,
      "--allow-prefix",
      "WHATSAPP_EMBEDDED_SIGNUP_",
      "--allow-prefix",
      "WHATSAPP_COEXISTENCE_",
      "--allow-prefix",
      "META_EMBEDDED_SIGNUP_",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const body = readFileSync(envPath, "utf8");
    assert.match(body, /WHATSAPP_EMBEDDED_SIGNUP_ENABLED=true/);
    assert.match(body, /META_EMBEDDED_SIGNUP_APP_ID=1400885884891475/);
  });
});
