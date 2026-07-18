import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../errors.js";
import { createContext, createTestEnvironment } from "../coordinator/test-utils.js";

describe("RuntimePolicyEngine", () => {
  it("resolves default runtime policies", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const resolved = await env.policy.resolvePolicy(ctx, "company-1");
    assert.equal(resolved.knowledgeRetrievalEnabled, true);
    assert.equal(resolved.maxPipelineDurationMs, 120000);
  });

  it("rejects invalid pipeline duration", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.policy.createPolicy(ctx, {
          companyId: "company-1",
          policyName: "invalid",
          maxPipelineDurationMs: 0,
        }),
      ValidationError,
    );
  });
});
