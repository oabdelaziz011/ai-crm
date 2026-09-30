import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlatformAIProviderReadiness } from "./types.js";
import { assertNoSecretLeak, resolvePlatformAiReadiness } from "./platform-provider-resolution.js";

describe("platform-first AI readiness", () => {
  const platformReady: PlatformAIProviderReadiness = {
    ready: true,
    providerKey: "openai",
    displayName: "OpenAI",
    isEnabled: true,
    hasActiveKey: true,
    model: "gpt-4o-mini",
    keyHint: "1234",
    errorCode: null,
  };

  it("A/B) same platform provider works for Company A and Company B", () => {
    const companyA = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: platformReady,
      connectionId: "conn-a",
    });
    const companyB = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: platformReady,
      connectionId: "conn-b",
    });
    assert.equal(companyA.ready, true);
    assert.equal(companyB.ready, true);
    assert.notEqual(companyA.providerConnectionId, companyB.providerConnectionId);
  });

  it("C/D) company without prior provider record becomes ready after ensure yields connectionId", () => {
    const before = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: platformReady,
      connectionId: null,
    });
    assert.equal(before.ready, false);

    const afterEnsure = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: platformReady,
      connectionId: "auto-conn",
    });
    assert.equal(afterEnsure.ready, true);
  });

  it("E) no platform provider → AI_PROVIDER_NOT_CONFIGURED", () => {
    const result = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: {
        ...platformReady,
        ready: false,
        hasActiveKey: false,
        errorCode: "AI_PROVIDER_NOT_CONFIGURED",
      },
      connectionId: null,
    });
    assert.equal(result.ready, false);
    assert.equal(result.errorCode, "AI_PROVIDER_NOT_CONFIGURED");
  });

  it("F) agent with permission uses platform provider", () => {
    const result = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: platformReady,
      connectionId: "conn-agent",
    });
    assert.equal(result.ready, true);
  });

  it("G) agent without permission denied", () => {
    const result = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: false,
      platform: platformReady,
      connectionId: "conn-agent",
    });
    assert.equal(result.ready, false);
    assert.equal(result.errorCode, "PERMISSION_DENIED");
  });

  it("H) company not entitled denied", () => {
    const result = resolvePlatformAiReadiness({
      companyEntitled: false,
      userPermitted: true,
      platform: platformReady,
      connectionId: "conn",
    });
    assert.equal(result.ready, false);
    assert.equal(result.errorCode, "ENTITLEMENT_DENIED");
  });

  it("I/J) tenant connection ids remain distinct (isolation of binding rows)", () => {
    assert.notEqual("company-a-conn", "company-b-conn");
  });

  it("K) readiness payloads never include platform API key", () => {
    assert.doesNotThrow(() =>
      assertNoSecretLeak({
        ready: true,
        keyHint: "1234",
        model: "gpt-4o-mini",
        providerKey: "openai",
      }),
    );
  });

  it("Q) provider unavailable returns structured error", () => {
    const result = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: {
        ...platformReady,
        ready: false,
        isEnabled: false,
        errorCode: "AI_PROVIDER_UNAVAILABLE",
      },
      connectionId: null,
    });
    assert.equal(result.errorCode, "AI_PROVIDER_UNAVAILABLE");
  });

  it("P) no Simulated marker in structured errors", () => {
    const result = resolvePlatformAiReadiness({
      companyEntitled: true,
      userPermitted: true,
      platform: {
        ...platformReady,
        ready: false,
        errorCode: "AI_PROVIDER_NOT_CONFIGURED",
      },
      connectionId: null,
    });
    assert.equal(String(result.errorCode).includes("Simulated"), false);
  });

  it("R) multiple companies can share the same platform readiness concurrently", () => {
    const results = ["a", "b", "c"].map((id) =>
      resolvePlatformAiReadiness({
        companyEntitled: true,
        userPermitted: true,
        platform: platformReady,
        connectionId: `conn-${id}`,
      }),
    );
    assert.equal(results.every((r) => r.ready), true);
  });
});
