import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupPackageFeaturesForEditor,
  isCorePackageFeature,
  resolvePackageFeatureGroupId,
} from "../src/lib/billing/package-feature-groups.ts";

describe("package-feature-groups (Phase 7.3)", () => {
  it("groups catalog features without hardcoding feature codes as SoT", () => {
    const grouped = groupPackageFeaturesForEditor([
      { code: "core_crm", label: "CRM", category: "crm", is_billable: false, requires_subscription: false },
      { code: "leads", label: "Leads", category: "crm", is_billable: true, requires_subscription: true },
      { code: "ai_assistant", label: "AI", category: "ai", is_billable: true, requires_subscription: true },
      { code: "whatsapp_channel", label: "WA", category: "channels", is_billable: true, requires_subscription: true },
      { code: "workflow_automation", label: "WF", category: "automation", is_billable: true, requires_subscription: true },
      { code: "basic_reports", label: "Reports", category: "reporting", is_billable: true, requires_subscription: true },
      { code: "api_access", label: "API", category: "integrations", is_billable: true, requires_subscription: true },
    ]);

    assert.deepEqual(
      grouped.map((g) => g.id),
      ["core", "crm_ops", "ai", "channels", "automation", "reporting", "integration"],
    );
    assert.equal(grouped[0].features[0].code, "core_crm");
  });

  it("marks core vs commercial for packaging UI", () => {
    assert.equal(
      isCorePackageFeature({
        code: "customers",
        label: "Customers",
        category: "crm",
        is_billable: false,
        requires_subscription: false,
      }),
      true,
    );
    assert.equal(
      resolvePackageFeatureGroupId({
        code: "operations",
        label: "Ops",
        category: "operations",
        is_billable: true,
        requires_subscription: true,
      }),
      "crm_ops",
    );
  });
});
