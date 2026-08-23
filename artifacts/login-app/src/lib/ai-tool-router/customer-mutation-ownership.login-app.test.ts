/**
 * Phase 5J.1 — assignment/commercial gates + login-app merge blocked.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyToolScopeBeforeRoute } from "@/lib/ai-employees/utilities/scoped-runtime-tool-port";
import { runWithEmployeeToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";
import { createApplicationLayerCrmAgentToolPorts } from "@/lib/application-layer/application-layer-crm-agent-tool-ports";

const COMPANY_A = "company-a";

describe("Phase 5J.1 customer mutation gates + login-app merge", () => {
  async function gateCase(input: {
    toolKey: string;
    allowedToolKeys: string[];
    entitled: boolean;
    expected: string;
  }) {
    let routerCalled = false;
    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: input.allowedToolKeys, employeeId: "emp-1" },
      () =>
        applyToolScopeBeforeRoute(
          {
            route: async () => {
              routerCalled = true;
              return {
                executionId: "x",
                toolKey: input.toolKey,
                status: "succeeded",
                output: {},
                durationMs: 1,
                errorCode: null,
                errorMessage: null,
              };
            },
          },
          {
            userId: "user-1",
            companyId: COMPANY_A,
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { conversationId: "conv-1", toolKey: input.toolKey, input: {} },
          {
            commercialEntitlement: {
              async isFeatureEnabled(_c, featureCode) {
                if (!input.entitled) return featureCode === "ai_employee";
                return featureCode === "ai_employee" || featureCode === "customers";
              },
            },
          },
        ),
    );
    assert.equal(routerCalled, false);
    assert.equal(result.errorCode, input.expected);
  }

  it("20. merge without assignment → TOOL_NOT_ASSIGNED", async () => {
    await gateCase({
      toolKey: "merge_customers",
      allowedToolKeys: ["update_customer"],
      entitled: true,
      expected: "TOOL_NOT_ASSIGNED",
    });
  });

  it("21. merge without customers entitlement → FEATURE_NOT_ENTITLED", async () => {
    await gateCase({
      toolKey: "merge_customers",
      allowedToolKeys: ["merge_customers"],
      entitled: false,
      expected: "FEATURE_NOT_ENTITLED",
    });
  });

  it("22. import without assignment → TOOL_NOT_ASSIGNED", async () => {
    await gateCase({
      toolKey: "import_customers",
      allowedToolKeys: ["update_customer"],
      entitled: true,
      expected: "TOOL_NOT_ASSIGNED",
    });
  });

  it("23. import without entitlement → FEATURE_NOT_ENTITLED", async () => {
    await gateCase({
      toolKey: "import_customers",
      allowedToolKeys: ["import_customers"],
      entitled: false,
      expected: "FEATURE_NOT_ENTITLED",
    });
  });

  it("24. login-app merge remains safely blocked after confirmation", async () => {
    const ports = createApplicationLayerCrmAgentToolPorts({
      portContext: {
        companyId: COMPANY_A,
        actorUserId: "user-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
    });

    const unconfirmed = await ports.mergeCustomers({
      companyId: COMPANY_A,
      userId: "user-1",
      primaryCustomerId: "cust-a-1",
      duplicateCustomerIds: ["cust-a-2"],
      confirmed: false,
    });
    assert.equal(unconfirmed.merged, false);

    await assert.rejects(
      () =>
        ports.mergeCustomers({
          companyId: COMPANY_A,
          userId: "user-1",
          primaryCustomerId: "cust-a-1",
          duplicateCustomerIds: ["cust-a-2"],
          confirmed: true,
        }),
      /not yet exposed via Application Layer/i,
    );
  });
});
