import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  assertLocalExternalOutboundAllowed,
  isLocalExternalOutboundPermitted,
} from "./local-outbound-guard.ts";

const KEYS = [
  "VALUEOR_ENV",
  "NODE_ENV",
  "ALLOW_LOCAL_EXTERNAL_OUTBOUND",
  "LOCAL_INTEGRATION_ENABLED",
] as const;

const snapshot: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of KEYS) snapshot[key] = process.env[key];
}

function restoreEnv() {
  for (const key of KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

saveEnv();
afterEach(restoreEnv);

describe("local-outbound-guard", () => {
  it("LOCAL + outbound disabled → blocked", () => {
    process.env.VALUEOR_ENV = "local";
    delete process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND;
    delete process.env.LOCAL_INTEGRATION_ENABLED;
    assert.equal(isLocalExternalOutboundPermitted(), false);
    assert.throws(
      () => assertLocalExternalOutboundAllowed("whatsapp/test-message"),
      (err: { statusCode?: number; code?: string }) =>
        err?.statusCode === 403 && err?.code === "LOCAL_OUTBOUND_BLOCKED",
    );
  });

  it("LOCAL + ALLOW only (no LOCAL_INTEGRATION_ENABLED) → still blocked", () => {
    process.env.VALUEOR_ENV = "local";
    process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND = "1";
    delete process.env.LOCAL_INTEGRATION_ENABLED;
    assert.equal(isLocalExternalOutboundPermitted(), false);
    assert.throws(() => assertLocalExternalOutboundAllowed("omnichannel/outbound/dispatch"));
  });

  it("LOCAL + explicit integration outbound → permitted", () => {
    process.env.VALUEOR_ENV = "local";
    process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND = "1";
    process.env.LOCAL_INTEGRATION_ENABLED = "true";
    assert.equal(isLocalExternalOutboundPermitted(), true);
    assert.doesNotThrow(() => assertLocalExternalOutboundAllowed("whatsapp/test-message"));
  });

  it("production mode → guard is a no-op (unchanged)", () => {
    process.env.VALUEOR_ENV = "production";
    delete process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND;
    delete process.env.LOCAL_INTEGRATION_ENABLED;
    assert.equal(isLocalExternalOutboundPermitted(), true);
    assert.doesNotThrow(() => assertLocalExternalOutboundAllowed("whatsapp/test-message"));
  });
});
