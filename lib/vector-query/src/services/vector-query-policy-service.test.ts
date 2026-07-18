import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../errors.js";
import { createContext, createTestEnvironment } from "./test-utils.js";

describe("VectorQueryPolicyService", () => {
  it("resolves tenant defaults and validates limits", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const resolved = await env.policiesService.resolvePolicy(ctx, "company-1");
    assert.equal(resolved.defaultTopK, 2);
    assert.equal(resolved.minimumSimilarityScore, 0.1);

    assert.throws(
      () => env.policiesService.validateMetadataFilters({ unsupported_key: "x" }),
      ValidationError,
    );
  });

  it("lists policies through findByCompany contract", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const listed = await env.policiesService.listPolicies(ctx, "company-1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, "policy-1");
  });

  it("archives policies without deleting records", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await env.policiesService.archivePolicy(ctx, "policy-1");
    const listed = await env.policiesService.listPolicies(ctx, "company-1");
    assert.equal(listed.length, 0);
    assert.equal(env.policies.length, 1);
  });
});
