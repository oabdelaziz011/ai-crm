import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_ROUTING_CATEGORIES,
  classifyInboundEmail,
  createRuleBasedEmailRoutingClassifier,
  emailClassificationInputFromNormalized,
} from "./index.js";

describe("AI Email Routing classification core (Sprint 1)", () => {
  const classifier = createRuleBasedEmailRoutingClassifier();

  it("classifies a sales email", async () => {
    const result = await classifier.classify({
      subject: "Demo request",
      body: "We are interested in purchasing the enterprise plan. Can you send pricing information?",
    });
    assert.equal(result.category, "sales");
    assert.ok(result.confidence >= 0.45);
    assert.equal(result.source, "rule_based");
  });

  it("classifies a support email", async () => {
    const result = await classifier.classify({
      subject: "App not working",
      body: "I need technical help. I cannot login and keep seeing an error message.",
    });
    assert.equal(result.category, "support");
    assert.ok(result.confidence >= 0.45);
  });

  it("classifies a billing email", async () => {
    const result = await classifier.classify({
      subject: "Invoice question",
      body: "Our last invoice number INV-100 shows we were double charged. Please check billing.",
    });
    assert.equal(result.category, "billing");
    assert.ok(result.confidence >= 0.45);
  });

  it("classifies a complaint email", async () => {
    const result = await classifier.classify({
      subject: "Formal complaint",
      body: "I want to file a complaint. This is unacceptable and I am extremely disappointed.",
    });
    assert.equal(result.category, "complaint");
    assert.ok(result.confidence >= 0.45);
  });

  it("classifies an HR email", async () => {
    const result = await classifier.classify({
      subject: "Job application",
      body: "Please find my resume attached. I would like to apply for the position listed on careers.",
    });
    assert.equal(result.category, "hr");
    assert.ok(result.confidence >= 0.45);
  });

  it("classifies a general inquiry", async () => {
    const result = await classifier.classify({
      subject: "Hello",
      body: "Just saying hi from a long-time customer. Hope you are well.",
    });
    assert.equal(result.category, "general_inquiry");
    assert.ok(result.confidence <= 0.45);
  });

  it("lets subject materially clarify classification", async () => {
    const withoutSubject = await classifier.classify({
      subject: "",
      body: "Please look into this as soon as you can. Thank you.",
    });
    assert.equal(withoutSubject.category, "general_inquiry");

    const withSubject = await classifier.classify({
      subject: "Invoice overdue - payment failed",
      body: "Please look into this as soon as you can. Thank you.",
    });
    assert.equal(withSubject.category, "billing");
    assert.ok(withSubject.confidence >= 0.45);
  });

  it("handles empty/missing subject using body", async () => {
    const result = await classifier.classify({
      subject: null,
      body: "Request a quote for 50 seats please.",
    });
    assert.equal(result.category, "sales");
  });

  it("handles empty/missing body using subject", async () => {
    const result = await classifier.classify({
      subject: "Bug report: cannot login",
      body: "",
    });
    assert.equal(result.category, "support");
  });

  it("falls back to general_inquiry for unknown/low-confidence input", async () => {
    const result = await classifier.classify({
      subject: "xyzzy",
      body: "qwerty asdf lorem ipsum dolor",
    });
    assert.equal(result.category, "general_inquiry");
    assert.ok(result.confidence < 0.45);
  });

  it("falls back when both subject and body are empty", async () => {
    const result = await classifier.classify({ subject: "  ", body: null });
    assert.equal(result.category, "general_inquiry");
    assert.ok(result.confidence <= 0.15);
  });

  it("exposes exactly the six supported categories", () => {
    assert.deepEqual([...EMAIL_ROUTING_CATEGORIES], [
      "sales",
      "support",
      "billing",
      "complaint",
      "hr",
      "general_inquiry",
    ]);
  });

  it("builds input from normalized inbound fields via classifyInboundEmail helper", async () => {
    const input = emailClassificationInputFromNormalized({
      text: "Our payment failed on renewal.",
      metadata: { subject: "Billing issue" },
      companyId: "co-1",
    });
    assert.equal(input.subject, "Billing issue");
    assert.equal(input.body, "Our payment failed on renewal.");

    const result = await classifyInboundEmail(input);
    assert.equal(result.category, "billing");
    assert.equal(result.source, "rule_based");
  });
});
