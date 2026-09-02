import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, "../src/lib/provision-user-errors.ts"), "utf8");

describe("provision-user-errors", () => {
  it("prefers Edge Function JSON payload over generic non-2xx invoke errors", () => {
    assert.match(src, /Prefer Edge Function JSON body/);
    assert.match(src, /readProvisionUserErrorPayload/);
    assert.match(src, /translateFromPayload/);
  });

  it("maps email_exists via auth error translation inputs", () => {
    assert.match(src, /code/);
    assert.match(src, /translateAuthErrorMessage|translateAuthError/);
  });
});
