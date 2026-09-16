import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "instagram.ts"), "utf8");

describe("Instagram webhook app-ownership route", () => {
  it("exposes an authenticated ownership diagnostic and does not log secrets", () => {
    assert.match(source, /router\.post\("\/instagram\/webhook-app-ownership"/);
    assert.match(source, /inspectInstagramWebhookAppOwnership\(/);
    assert.match(source, /envAppIdIsDiagnosticOnly/);
    assert.match(source, /hmacDoesNotUseAppId/);
    const logged = source.slice(source.indexOf("instagramWebhookOwnershipDiag"));
    assert.doesNotMatch(logged, /accessToken/);
    assert.doesNotMatch(logged, /appSecret/);
    assert.doesNotMatch(logged, /verifyToken/);
    assert.doesNotMatch(logged, /x-hub-signature-256/);
    assert.doesNotMatch(logged, /runtimeConfig\.accessToken/);
  });
});
