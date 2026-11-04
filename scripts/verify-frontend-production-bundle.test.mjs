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
      'const api="https://api.valueor.org"; const hook="https://webhook.valueor.org";',
    );
    const good = run(ok);
    assert.equal(good.status, 0, good.stderr || good.stdout);

    const bad = mkdtempSync(join(tmpdir(), "valueor-fe-bad-"));
    mkdirSync(join(bad, "assets"));
    writeFileSync(join(bad, "index.html"), "<script src=\"/assets/app.js\"></script>");
    writeFileSync(join(bad, "assets", "app.js"), 'const api="http://localhost:3000";');
    const failed = run(bad);
    assert.notEqual(failed.status, 0);
  });
});
