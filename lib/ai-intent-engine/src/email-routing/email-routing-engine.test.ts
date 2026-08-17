import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmailRoutingEngine,
  type EmailRoutingEngineInput,
  type EmailRoutingTargetResolver,
} from "./index.js";

function classification(
  category: EmailRoutingEngineInput["classification"]["category"],
  confidence = 0.9,
): EmailRoutingEngineInput["classification"] {
  return {
    category,
    confidence,
    reason: `classified ${category}`,
    source: "llm",
    subcategory: null,
  };
}

describe("DefaultEmailRoutingEngine (Sprint 4)", () => {
  it("maps sales classification to Sales routing decision", async () => {
    const decision = await createEmailRoutingEngine().route({
      companyId: "co-1",
      classification: classification("sales"),
    });
    assert.equal(decision.category, "sales");
    assert.equal(decision.targetType, "unresolved");
    assert.equal(decision.targetId, null);
    assert.equal(decision.source, "classification");
    assert.equal(decision.configurationRequired, true);
    assert.match(decision.reason, /Sales/i);
  });

  it("maps support classification to Support routing decision", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("support"),
    });
    assert.equal(decision.category, "support");
    assert.match(decision.reason, /Support/i);
  });

  it("maps billing classification to Billing routing decision", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("billing"),
    });
    assert.equal(decision.category, "billing");
    assert.match(decision.reason, /Billing/i);
  });

  it("maps complaint classification to Complaint routing decision", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("complaint"),
    });
    assert.equal(decision.category, "complaint");
    assert.match(decision.reason, /Complaint/i);
  });

  it("maps hr classification to HR routing decision", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("hr"),
    });
    assert.equal(decision.category, "hr");
    assert.match(decision.reason, /HR/i);
  });

  it("maps general_inquiry to default/general routing decision", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("general_inquiry", 0.5),
    });
    assert.equal(decision.category, "general_inquiry");
    assert.equal(decision.targetType, "unresolved");
    assert.match(decision.reason, /General Inquiry/i);
  });

  it("consumes the existing classification result without inventing categories", async () => {
    const input = {
      companyId: "co-2",
      classification: classification("billing", 0.88),
    };
    const decision = await createEmailRoutingEngine().route(input);
    assert.equal(decision.category, input.classification.category);
    assert.equal(decision.confidence, input.classification.confidence);
    assert.equal(decision.source, "classification");
  });

  it("does not call an LLM (engine is deterministic)", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("sales"),
    });
    assert.equal(decision.source, "classification");
    assert.equal(decision.targetType, "unresolved");
  });

  it("uses configured target when resolver returns one", async () => {
    const resolver: EmailRoutingTargetResolver = {
      resolveTarget({ category }) {
        if (category !== "support") return null;
        return { targetType: "team", targetId: "team-support-1" };
      },
    };
    const decision = await createEmailRoutingEngine({ targetResolver: resolver }).route({
      companyId: "co-1",
      classification: classification("support"),
    });
    assert.equal(decision.targetType, "team");
    assert.equal(decision.targetId, "team-support-1");
    assert.equal(decision.configurationRequired, false);
  });

  it("defaults to general_inquiry route on low confidence using existing threshold", async () => {
    const decision = await createEmailRoutingEngine().route({
      classification: classification("sales", 0.2),
    });
    assert.equal(decision.category, "general_inquiry");
    assert.equal(decision.targetType, "unresolved");
    assert.match(decision.reason, /Low classification confidence/i);
  });
});
