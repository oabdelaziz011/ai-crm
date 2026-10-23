import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_B2B_REQUIRED_EVIDENCE,
  DEFAULT_B2C_REQUIRED_EVIDENCE,
  evaluateLeadQualificationPolicy,
} from "./lead-qualification-policy.js";
import {
  DEFAULT_OPTIONAL_EVIDENCE_FIELDS,
  InMemoryCompanyLeadQualificationSettingsStore,
  normalizeCompanyLeadQualificationSettings,
  resolveCompanyLeadQualificationPolicyConfig,
  toLeadQualificationPolicyConfig,
} from "./company-lead-qualification-settings.js";

describe("CompanyLeadQualificationSettings (P1b)", () => {
  it("resolves B2C defaults when configuration is missing", () => {
    const { settings, policyConfig, warnings } = resolveCompanyLeadQualificationPolicyConfig("co-a", null);
    assert.equal(settings.companyId, "co-a");
    assert.equal(settings.source, "defaults");
    assert.equal(settings.salesMotion, "b2c");
    assert.deepEqual([...settings.requiredEvidenceFields], [...DEFAULT_B2C_REQUIRED_EVIDENCE]);
    assert.equal(policyConfig.salesMotion, "b2c");
    assert.deepEqual(warnings, []);
    for (const optional of DEFAULT_OPTIONAL_EVIDENCE_FIELDS) {
      assert.ok(!settings.requiredEvidenceFields.includes(optional));
    }
  });

  it("validates and drops invalid fields; falls back safely for bad salesMotion", () => {
    const { settings, warnings } = normalizeCompanyLeadQualificationSettings("co-a", {
      salesMotion: "enterprise",
      requiredEvidenceFields: ["productInterest", "not_a_real_field", 42, "explicitBuyingIntent"],
    });
    assert.equal(settings.salesMotion, "b2c");
    assert.ok(warnings.some((w) => /Invalid salesMotion/.test(w)));
    assert.ok(warnings.some((w) => /invalid required evidence field/.test(w)));
    assert.deepEqual([...settings.requiredEvidenceFields], ["productInterest", "explicitBuyingIntent"]);
    assert.equal(settings.source, "override");
  });

  it("treats empty requiredEvidenceFields as motion defaults (never require nothing)", () => {
    const { settings, warnings } = normalizeCompanyLeadQualificationSettings("co-b", {
      salesMotion: "b2b",
      requiredEvidenceFields: [],
    });
    assert.equal(settings.salesMotion, "b2b");
    assert.deepEqual([...settings.requiredEvidenceFields], [...DEFAULT_B2B_REQUIRED_EVIDENCE]);
    assert.ok(warnings.some((w) => /empty/.test(w)));
  });

  it("partial configuration merges onto defaults without inventing evidence", () => {
    const { settings } = normalizeCompanyLeadQualificationSettings("co-partial", {
      salesMotion: "b2b",
      requireHumanReviewWhenIncomplete: true,
    });
    assert.equal(settings.salesMotion, "b2b");
    assert.equal(settings.requireHumanReviewWhenIncomplete, true);
    assert.equal(settings.requireHumanReviewOnConflict, true);
    assert.deepEqual([...settings.requiredEvidenceFields], [...DEFAULT_B2B_REQUIRED_EVIDENCE]);
    assert.ok(!settings.requiredEvidenceFields.includes("budgetKnown"));
    assert.ok(!settings.requiredEvidenceFields.includes("decisionAuthorityKnown"));
  });

  it("allows a company to opt into budget/authority requirements explicitly", () => {
    const { settings } = normalizeCompanyLeadQualificationSettings("co-opt-in", {
      salesMotion: "b2b",
      requiredEvidenceFields: [
        "statedNeed",
        "explicitBuyingIntent",
        "contactAvailable",
        "budgetKnown",
        "decisionAuthorityKnown",
      ],
    });
    assert.ok(settings.requiredEvidenceFields.includes("budgetKnown"));
    assert.ok(settings.requiredEvidenceFields.includes("decisionAuthorityKnown"));
  });

  it("enforces tenant isolation at the configuration store boundary", async () => {
    const store = new InMemoryCompanyLeadQualificationSettingsStore();
    await store.upsert("company-a", {
      salesMotion: "b2b",
      requiredEvidenceFields: ["statedNeed", "explicitBuyingIntent", "contactAvailable", "companyIdentified"],
    });
    await store.upsert("company-b", {
      salesMotion: "b2c",
      requiredEvidenceFields: ["productInterest", "explicitBuyingIntent", "contactAvailable"],
    });

    const a = await store.resolve("company-a");
    const b = await store.resolve("company-b");
    assert.equal(a.settings.companyId, "company-a");
    assert.equal(b.settings.companyId, "company-b");
    assert.equal(a.settings.salesMotion, "b2b");
    assert.equal(b.settings.salesMotion, "b2c");
    assert.ok(a.settings.requiredEvidenceFields.includes("companyIdentified"));
    assert.ok(!b.settings.requiredEvidenceFields.includes("companyIdentified"));
    assert.deepEqual(store.companyIds(), ["company-a", "company-b"]);

    // Resolving A never returns B's requirements.
    assert.notDeepEqual(
      [...a.settings.requiredEvidenceFields],
      [...b.settings.requiredEvidenceFields],
    );
  });

  it("missing company in store resolves pure defaults for that company only", async () => {
    const store = new InMemoryCompanyLeadQualificationSettingsStore();
    await store.upsert("company-a", { salesMotion: "mixed" });
    const missing = await store.resolve("company-z");
    assert.equal(missing.settings.companyId, "company-z");
    assert.equal(missing.settings.source, "defaults");
    assert.equal(missing.settings.salesMotion, "b2c");
    assert.equal(await store.get("company-z"), null);
  });

  it("rejects empty companyId", () => {
    assert.throws(() => normalizeCompanyLeadQualificationSettings("", null), /companyId is required/);
    assert.throws(() => normalizeCompanyLeadQualificationSettings("   ", null), /companyId is required/);
  });

  it("resolution is deterministic for the same inputs", () => {
    const patch = {
      salesMotion: "mixed" as const,
      requiredEvidenceFields: ["statedNeed", "productInterest", "contactAvailable", "explicitBuyingIntent"],
      requireHumanReviewOnConflict: false,
    };
    const first = resolveCompanyLeadQualificationPolicyConfig("co-det", patch);
    const second = resolveCompanyLeadQualificationPolicyConfig("co-det", patch);
    assert.deepEqual(first.settings, second.settings);
    assert.deepEqual(first.policyConfig, second.policyConfig);
    assert.deepEqual(first.warnings, second.warnings);
  });

  it("preserves P1a interest vs intent vs qualification via resolved company config", () => {
    const { policyConfig } = resolveCompanyLeadQualificationPolicyConfig("co-a", {
      salesMotion: "b2c",
    });
    const interested = evaluateLeadQualificationPolicy({
      lead: { isQualified: false },
      config: policyConfig,
      evidence: { productInterest: true, contactAvailable: true },
    });
    assert.equal(interested.outcome, "interested_not_qualified");

    const ready = evaluateLeadQualificationPolicy({
      lead: { isQualified: false },
      config: toLeadQualificationPolicyConfig(
        normalizeCompanyLeadQualificationSettings("co-a", { salesMotion: "b2c" }).settings,
      ),
      evidence: {
        productInterest: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
      },
    });
    assert.equal(ready.outcome, "qualified");
  });
});
