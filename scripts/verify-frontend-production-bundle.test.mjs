import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./verify-frontend-production-bundle.mjs", import.meta.url));

function run(dir) {
  return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
}

describe("frontend production bundle verification", () => {
  it("accepts a dist with production hosts and rejects local API hosts", () => {
    const ok = mkdtempSync(join(tmpdir(), "valueor-fe-ok-"));
    mkdirSync(join(ok, "assets"));
    writeFileSync(join(ok, "index.html"), "<script src=\"/assets/app.js\"></script>");
    writeFileSync(
      join(ok, "assets", "app.js"),
      [
        'const api="https://api.valueor.org";',
        'const hook="https://webhook.valueor.org";',
        'const env={VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED:"true",VITE_WHATSAPP_COEXISTENCE_ENABLED:"false"};',
      ].join(" "),
    );
    const good = run(ok);
    assert.equal(good.status, 0, good.stderr || good.stdout);

    const missingFlags = mkdtempSync(join(tmpdir(), "valueor-fe-flags-"));
    mkdirSync(join(missingFlags, "assets"));
    writeFileSync(join(missingFlags, "index.html"), "<script src=\"/assets/app.js\"></script>");
    writeFileSync(
      join(missingFlags, "assets", "app.js"),
      'const api="https://api.valueor.org"; const hook="https://webhook.valueor.org";',
    );
    const flagsFailed = run(missingFlags);
    assert.notEqual(flagsFailed.status, 0);

    const bad = mkdtempSync(join(tmpdir(), "valueor-fe-bad-"));
    mkdirSync(join(bad, "assets"));
    writeFileSync(join(bad, "index.html"), "<script src=\"/assets/app.js\"></script>");
    writeFileSync(join(bad, "assets", "app.js"), 'const api="http://localhost:3000";');
    const failed = run(bad);
    assert.notEqual(failed.status, 0);
  });
});
