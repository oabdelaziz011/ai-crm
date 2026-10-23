import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_B2B_REQUIRED_EVIDENCE,
  DEFAULT_B2C_REQUIRED_EVIDENCE,
  evaluateLeadQualificationPolicy,
  resolveLeadQualificationPolicyConfig,
  type SalesEvidence,
} from "./lead-qualification-policy.js";

const unqualifiedLead = { isQualified: false, score: 95, temperature: "hot" as const };

describe("LeadQualificationPolicy (P1a)", () => {
  it("1. B2C product interest without buying intent is not qualified", () => {
    const result = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence: { productInterest: true, contactAvailable: true },
    });
    assert.equal(result.outcome, "interested_not_qualified");
    assert.equal(result.reason, "interest_without_buying_intent");
    assert.ok(result.missingRequiredEvidence.includes("explicitBuyingIntent"));
  });

  it("2. B2C explicit buying intent with required evidence can qualify", () => {
    const evidence: SalesEvidence = {
      productInterest: true,
      explicitBuyingIntent: true,
      contactAvailable: true,
    };
    const result = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence,
    });
    assert.equal(result.outcome, "qualified");
    assert.equal(result.reason, "policy_requirements_met");
    assert.deepEqual(result.missingRequiredEvidence, []);
    assert.equal(result.requiresHumanReview, false);
  });

  it("3. B2B missing configured required evidence is not qualified", () => {
    const result = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: {
        salesMotion: "b2b",
        requiredEvidenceFields: ["statedNeed", "contactAvailable", "explicitBuyingIntent", "companyIdentified"],
      },
      evidence: {
        statedNeed: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
        // companyIdentified intentionally absent
      },
    });
    assert.equal(result.outcome, "needs_more_information");
    assert.deepEqual(result.missingRequiredEvidence, ["companyIdentified"]);
    assert.notEqual(result.outcome, "qualified");
  });

  it("4. Budget and authority are optional by default", () => {
    const b2c = resolveLeadQualificationPolicyConfig({ salesMotion: "b2c" });
    const b2b = resolveLeadQualificationPolicyConfig({ salesMotion: "b2b" });
    assert.ok(!b2c.requiredEvidenceFields.includes("budgetKnown"));
    assert.ok(!b2c.requiredEvidenceFields.includes("decisionAuthorityKnown"));
    assert.ok(!b2b.requiredEvidenceFields.includes("budgetKnown"));
    assert.ok(!b2b.requiredEvidenceFields.includes("decisionAuthorityKnown"));

    const qualifiedWithoutBudget = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2b" },
      evidence: {
        statedNeed: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
        budgetKnown: false,
        decisionAuthorityKnown: false,
      },
    });
    assert.equal(qualifiedWithoutBudget.outcome, "qualified");
  });

  it("5. Mixed mode respects configured requirements", () => {
    const result = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: {
        salesMotion: "mixed",
        requiredEvidenceFields: ["productInterest", "statedNeed", "explicitBuyingIntent", "contactAvailable"],
      },
      evidence: {
        productInterest: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
        // statedNeed missing
      },
    });
    assert.equal(result.outcome, "needs_more_information");
    assert.deepEqual(result.missingRequiredEvidence, ["statedNeed"]);

    const ok = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: {
        salesMotion: "mixed",
        requiredEvidenceFields: ["productInterest", "statedNeed", "explicitBuyingIntent", "contactAvailable"],
      },
      evidence: {
        productInterest: true,
        statedNeed: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
      },
    });
    assert.equal(ok.outcome, "qualified");
  });

  it("6. Missing evidence is reported accurately", () => {
    const result = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence: { explicitBuyingIntent: true },
    });
    assert.equal(result.outcome, "needs_more_information");
    assert.deepEqual(result.missingRequiredEvidence, ["productInterest", "contactAvailable"]);
  });

  it("7. Existing qualified leads return already_qualified", () => {
    const result = evaluateLeadQualificationPolicy({
      lead: { isQualified: true, score: 10, temperature: "cold" },
      config: { salesMotion: "b2c" },
      evidence: { productInterest: true, explicitBuyingIntent: true, contactAvailable: true },
    });
    assert.equal(result.outcome, "already_qualified");
    assert.equal(result.reason, "lead_already_qualified");
    assert.deepEqual(result.missingRequiredEvidence, []);
  });

  it("8. Explicitly supported not-a-fit evidence returns not_a_fit", () => {
    const result = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence: {
        productInterest: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
        notAFit: true,
      },
    });
    assert.equal(result.outcome, "not_a_fit");
    assert.equal(result.reason, "explicit_not_a_fit");
  });

  it("9. Conflicting or insufficient evidence does not produce false qualification", () => {
    const conflict = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence: {
        productInterest: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
        conflictingSignals: true,
      },
    });
    assert.equal(conflict.outcome, "requires_human_review");
    assert.equal(conflict.requiresHumanReview, true);

    // High score / hot temperature alone must never qualify.
    const scoreOnly = evaluateLeadQualificationPolicy({
      lead: { isQualified: false, score: 99, temperature: "hot" },
      config: { salesMotion: "b2c" },
      evidence: {},
    });
    assert.notEqual(scoreOnly.outcome, "qualified");

    const priceInquiryShape = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence: { productInterest: true },
    });
    assert.equal(priceInquiryShape.outcome, "interested_not_qualified");
  });

  it("10. Policy configuration and evaluation are deterministic", () => {
    const configA = resolveLeadQualificationPolicyConfig({ salesMotion: "b2c" });
    const configB = resolveLeadQualificationPolicyConfig({ salesMotion: "b2c" });
    assert.deepEqual(configA, configB);
    assert.deepEqual([...configA.requiredEvidenceFields], [...DEFAULT_B2C_REQUIRED_EVIDENCE]);
    assert.deepEqual(
      [...resolveLeadQualificationPolicyConfig({ salesMotion: "b2b" }).requiredEvidenceFields],
      [...DEFAULT_B2B_REQUIRED_EVIDENCE],
    );

    const evidence: SalesEvidence = {
      productInterest: true,
      explicitBuyingIntent: true,
      contactAvailable: true,
    };
    const first = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence,
    });
    const second = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c" },
      evidence,
    });
    assert.deepEqual(first, second);

    const incompleteReview = evaluateLeadQualificationPolicy({
      lead: unqualifiedLead,
      config: { salesMotion: "b2c", requireHumanReviewWhenIncomplete: true },
      evidence: { explicitBuyingIntent: true },
    });
    assert.equal(incompleteReview.outcome, "requires_human_review");
    assert.equal(incompleteReview.requiresHumanReview, true);
  });
});
