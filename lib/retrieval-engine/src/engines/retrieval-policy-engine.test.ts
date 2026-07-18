import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../errors.js";
import { createContext, createTestEnvironment } from "./test-utils.js";

describe("RetrievalPolicyEngine", () => {
  it("resolves tenant defaults and validates limits", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const resolved = await env.policy.resolvePolicy(ctx, "company-1");
    assert.equal(resolved.maxContextTokens, 500);
    assert.equal(resolved.maxChunks, 3);
    assert.equal(resolved.defaultLanguage, "en");
  });

  it("archives policies without deleting records", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await env.policy.archivePolicy(ctx, "policy-1");
    const listed = await env.policy.listPolicies(ctx, "company-1");
    assert.equal(listed.length, 0);
    assert.equal(env.policies.length, 1);
  });

  it("rejects invalid policy limits", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.policy.createPolicy(ctx, {
          companyId: "company-1",
          policyName: "invalid",
          maxContextTokens: 0,
        }),
      ValidationError,
    );
  });
});
