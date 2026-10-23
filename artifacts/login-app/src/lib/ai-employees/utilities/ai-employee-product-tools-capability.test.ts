import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupAvailableToolsByCapability,
  resolveAvailableEmployeeTools,
  resolveCapabilityGroup,
  resolveRequiredFeatureCodesForTool,
  toggleAvailableToolKey,
} from "./ai-employee-capability-catalog.js";
import { mapAiEmployeeRow } from "../selectors/ai-employee-selectors.js";
import type { AiEmployeeDbRow } from "../types/ai-employee-types.js";
import {
  formValuesToUpdate,
  recordToFormValues,
  resolveFormRuntimeConfiguration,
} from "../validators/ai-employee-validators.js";
import { evaluateCommercialToolAccess } from "./ai-employee-commercial-runtime-gate.js";

const PRODUCT_TOOLS = ["search_products", "get_product_details"];
const DRAFT_QUOTE_TOOL = "create_draft_quote";
const DELIVERY_TOOLS = ["request_send_quote", "get_quote_delivery_status"] as const;

const catalog = [
  { key: "search_customer", displayName: "Search Customers", category: "crm" },
  { key: "create_booking", displayName: "Create Booking", category: "scheduling" },
  { key: "search_products", displayName: "Search Products", category: "products" },
  { key: "get_product_details", displayName: "Get Product Details", category: "products" },
  { key: "create_draft_quote", displayName: "Create Draft Quote", category: "sales" },
  { key: "request_send_quote", displayName: "Request Send Quote", category: "sales" },
  { key: "get_quote_delivery_status", displayName: "Get Quote Delivery Status", category: "sales" },
];

const COMPANY = "company-1";

function entitlements(codes: string[]) {
  const enabled = new Set(codes);
  return async (_companyId: string, featureCode: string) => enabled.has(featureCode);
}

describe("AI Employee product tools capability", () => {
  it("maps both tools to the products group behind ai_employee + opportunities", () => {
    for (const key of PRODUCT_TOOLS) {
      assert.equal(resolveCapabilityGroup(key), "products");
      assert.deepEqual(resolveRequiredFeatureCodesForTool(key), ["ai_employee", "opportunities"]);
    }
  });

  for (const webhookFacing of [false, true]) {
    it(`shows product tools when opportunities is enabled (webhookFacing=${webhookFacing})`, () => {
      const tools = resolveAvailableEmployeeTools({
        enabledFeatureCodes: ["ai_employee", "opportunities"],
        catalogTools: catalog.filter((tool) => PRODUCT_TOOLS.includes(tool.key)),
        webhookFacing,
      });
      assert.deepEqual(
        tools.map((tool) => tool.key).sort(),
        [...PRODUCT_TOOLS].sort(),
      );
      const groups = groupAvailableToolsByCapability(tools);
      assert.deepEqual(groups.map((group) => group.group), ["products"]);
    });
  }

  it("maps create_draft_quote to sales group behind ai_employee + opportunities", () => {
    assert.equal(resolveCapabilityGroup(DRAFT_QUOTE_TOOL), "sales");
    assert.deepEqual(resolveRequiredFeatureCodesForTool(DRAFT_QUOTE_TOOL), [
      "ai_employee",
      "opportunities",
    ]);
  });

  it("shows create_draft_quote when opportunities is enabled and tool_definitions includes it", () => {
    const tools = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "opportunities"],
      catalogTools: catalog,
      webhookFacing: true,
    });
    const keys = tools.map((tool) => tool.key).sort();
    assert.ok(keys.includes(DRAFT_QUOTE_TOOL));
    assert.ok(PRODUCT_TOOLS.every((key) => keys.includes(key)));
  });

  it("maps delivery tools to sales behind opportunities and shows them in the wizard catalog", () => {
    for (const key of DELIVERY_TOOLS) {
      assert.equal(resolveCapabilityGroup(key), "sales");
      assert.deepEqual(resolveRequiredFeatureCodesForTool(key), ["ai_employee", "opportunities"]);
    }
    const keys = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "opportunities"],
      catalogTools: catalog,
      webhookFacing: true,
    }).map((tool) => tool.key);
    for (const key of DELIVERY_TOOLS) assert.ok(keys.includes(key));
  });

  it("hides product tools without opportunities or without ai_employee", () => {
    for (const codes of [["ai_employee", "customers", "bookings"], ["opportunities"]]) {
      const keys = resolveAvailableEmployeeTools({
        enabledFeatureCodes: codes,
        catalogTools: catalog,
        webhookFacing: false,
      }).map((tool) => tool.key);
      for (const key of PRODUCT_TOOLS) assert.equal(keys.includes(key), false);
    }
  });

  it("hides product tools when the tool_definitions catalog has no row for them", () => {
    const keys = resolveAvailableEmployeeTools({
      enabledFeatureCodes: ["ai_employee", "opportunities"],
      catalogTools: catalog.filter(
        (tool) =>
          !PRODUCT_TOOLS.includes(tool.key) &&
          tool.key !== DRAFT_QUOTE_TOOL &&
          !(DELIVERY_TOOLS as readonly string[]).includes(tool.key),
      ),
      webhookFacing: false,
    }).map((tool) => tool.key);
    assert.deepEqual(keys, []);
  });

  it("toggles each product tool on and off without touching other assignments", () => {
    const available = PRODUCT_TOOLS;
    const assigned = ["create_booking"];
    const on = toggleAvailableToolKey(assigned, available, "search_products", true);
    assert.deepEqual(on, ["create_booking", "search_products"]);
    const both = toggleAvailableToolKey(on, available, "get_product_details", true);
    assert.deepEqual(both, ["create_booking", "search_products", "get_product_details"]);
    const off = toggleAvailableToolKey(both, available, "search_products", false);
    assert.deepEqual(off, ["create_booking", "get_product_details"]);
  });

  it("does not enable a product tool that is not available to the company", () => {
    const next = toggleAvailableToolKey(["create_booking"], [], "search_products", true);
    assert.deepEqual(next, ["create_booking"]);
  });
});

describe("AI Employee product tools commercial gate", () => {
  it("allows product tools when ai_employee and opportunities are entitled", async () => {
    for (const toolKey of PRODUCT_TOOLS) {
      const decision = await evaluateCommercialToolAccess({
        toolKey,
        companyId: COMPANY,
        isFeatureEnabled: entitlements(["ai_employee", "opportunities"]),
      });
      assert.deepEqual(decision, { allowed: true });
    }
  });

  it("denies when opportunities is not entitled, even for super admins", async () => {
    const decision = await evaluateCommercialToolAccess({
      toolKey: "search_products",
      companyId: COMPANY,
      isSuperAdmin: true,
      isFeatureEnabled: entitlements(["ai_employee"]),
    });
    assert.deepEqual(decision, { allowed: false, denialReason: "FEATURE_NOT_ENTITLED" });
  });

  it("fails closed when the entitlement lookup errors", async () => {
    const decision = await evaluateCommercialToolAccess({
      toolKey: "get_product_details",
      companyId: COMPANY,
      isFeatureEnabled: async () => {
        throw new Error("rpc down");
      },
    });
    assert.deepEqual(decision, { allowed: false, denialReason: "FEATURE_NOT_ENTITLED" });
  });

  it("denies an explicitly disabled product tool", async () => {
    const decision = await evaluateCommercialToolAccess({
      toolKey: "search_products",
      companyId: COMPANY,
      isFeatureEnabled: entitlements(["ai_employee", "opportunities"]),
      disabledToolKeys: ["search_products"],
    });
    assert.deepEqual(decision, { allowed: false, denialReason: "TOOL_DISABLED" });
  });

  it("requires a tenant context", async () => {
    const decision = await evaluateCommercialToolAccess({
      toolKey: "search_products",
      companyId: "",
      isFeatureEnabled: entitlements(["ai_employee", "opportunities"]),
    });
    assert.deepEqual(decision, { allowed: false, denialReason: "TENANT_CONTEXT_REQUIRED" });
  });
});

describe("showProductPrices persistence", () => {
  it("defaults to hidden and round-trips an enabled setting through the form", () => {
    assert.equal(resolveFormRuntimeConfiguration(undefined).showProductPrices, false);
    assert.equal(resolveFormRuntimeConfiguration({ showProductPrices: false }).showProductPrices, false);

    const enabled = resolveFormRuntimeConfiguration({
      showProductPrices: true,
      disabledToolKeys: ["get_product_details"],
    });
    assert.equal(enabled.showProductPrices, true);
    assert.deepEqual(enabled.disabledToolKeys, ["get_product_details"]);

    const row = {
      id: "employee-1",
      company_id: "company-1",
      name: "sales",
      display_name: "Sales",
      description: "",
      avatar: null,
      department: null,
      owner_id: null,
      status: "draft",
      provider: null,
      model: null,
      temperature: null,
      max_tokens: null,
      system_prompt: "",
      system_prompt_summary: "",
      welcome_message: "",
      knowledge_source_ids: [],
      knowledge_summary: "",
      allowed_tool_keys: ["search_products"],
      tool_summary: "",
      allowed_skill_ids: [],
      skills_summary: "",
      tags: [],
      created_at: "2026-10-15T00:00:00.000Z",
      updated_at: "2026-10-15T00:00:00.000Z",
      deleted_at: null,
      created_by: null,
      updated_by: null,
      prompt_version_label: "v1",
      runtime_configuration: { showProductPrices: true, disabledToolKeys: ["get_product_details"] },
      published_version_id: null,
      current_version_number: 0,
      has_unpublished_draft: true,
    } as AiEmployeeDbRow;

    const form = recordToFormValues(mapAiEmployeeRow(row));
    assert.equal(form.runtimeConfiguration?.showProductPrices, true);
    assert.deepEqual(form.allowedToolKeys, ["search_products"]);
    const update = formValuesToUpdate(form, []);
    const stored = update.runtime_configuration as { showProductPrices?: boolean; disabledToolKeys?: string[] };
    assert.equal(stored.showProductPrices, true);
    assert.deepEqual(stored.disabledToolKeys, ["get_product_details"]);
  });
});
