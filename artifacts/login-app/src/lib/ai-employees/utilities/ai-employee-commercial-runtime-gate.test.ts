/**
 * Phase 2 — runtime commercial authorization security tests.
 * Gate: applyToolScopeBeforeRoute / createScopedRuntimeToolPort
 * Mapping: Phase 1 ai-employee-capability-catalog (same FEATURE_TOOL_KEYS).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRequiredFeatureCodesForTool,
} from "./ai-employee-capability-catalog.js";
import {
  AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE,
  evaluateCommercialToolAccess,
} from "./ai-employee-commercial-runtime-gate.js";
import { applyToolScopeBeforeRoute } from "./scoped-runtime-tool-port.js";
import { TOOL_NOT_ASSIGNED_CODE } from "./tool-scope-filter.js";
import { runWithEmployeeToolScope } from "./tool-scope-context.js";

const EMPLOYEE_ID = "employee-commercial-1";
const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

function entitledPort(enabledByCompany: Record<string, ReadonlySet<string>>) {
  const checks: Array<{ companyId: string; featureCode: string }> = [];
  return {
    checks,
    async isFeatureEnabled(companyId: string, featureCode: string) {
      checks.push({ companyId, featureCode });
      return enabledByCompany[companyId]?.has(featureCode) === true;
    },
  };
}

async function routeUnderScope(input: {
  toolKey: string;
  allowedToolKeys: readonly string[];
  companyId: string | null;
  isSuperAdmin?: boolean;
  isFeatureEnabled: (companyId: string, featureCode: string) => Promise<boolean>;
  routeInput?: Record<string, unknown>;
}) {
  let routerCalled = false;
  const result = await runWithEmployeeToolScope(
    { allowedToolKeys: input.allowedToolKeys, employeeId: EMPLOYEE_ID },
    () =>
      applyToolScopeBeforeRoute(
        {
          route: async () => {
            routerCalled = true;
            return {
              executionId: "exec-ok",
              toolKey: input.toolKey,
              status: "succeeded",
              output: { success: true },
              durationMs: 1,
              errorCode: null,
              errorMessage: null,
            };
          },
        },
        {
          userId: "user-1",
          companyId: input.companyId,
          isSuperAdmin: input.isSuperAdmin ?? false,
          hasPermission: () => true,
        },
        {
          conversationId: "conv-commercial",
          toolKey: input.toolKey,
          input: input.routeInput ?? {},
        },
        {
          commercialEntitlement: {
            isFeatureEnabled: input.isFeatureEnabled,
          },
        },
      ),
  );
  return { result, routerCalled };
}

describe("Phase 2 runtime commercial authorization", () => {
  it("1. Assigned + entitled → ALLOW", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(result.status, "succeeded");
    assert.equal(routerCalled, true);
  });

  it("2. Assigned + not entitled → DENY FEATURE_NOT_ENTITLED", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "FEATURE_NOT_ENTITLED");
    assert.equal(result.output?.denialReason, "FEATURE_NOT_ENTITLED");
    assert.equal(result.errorMessage, AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE);
  });

  it("3. Not assigned + entitled → DENY TOOL_NOT_ASSIGNED", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["knowledge_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, TOOL_NOT_ASSIGNED_CODE);
  });

  it("4. Unknown tool (empty key) → DENY UNKNOWN_TOOL", async () => {
    const decision = await evaluateCommercialToolAccess({
      toolKey: "   ",
      companyId: COMPANY_A,
      isFeatureEnabled: async () => true,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.denialReason, "UNKNOWN_TOOL");
  });

  it("5. Tool with no feature mapping → DENY UNMAPPED_TOOL", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings", "customers"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "totally_unmapped_tool_xyz",
      allowedToolKeys: ["totally_unmapped_tool_xyz"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "UNMAPPED_TOOL");
  });

  it("6. Missing company context → DENY TENANT_CONTEXT_REQUIRED", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: null,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "TENANT_CONTEXT_REQUIRED");
  });

  it("7. Company A entitlement cannot authorize Company B", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
      [COMPANY_B]: new Set(["ai_employee"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_B,
      isFeatureEnabled: port.isFeatureEnabled,
      routeInput: { companyId: COMPANY_A },
    });
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "FEATURE_NOT_ENTITLED");
    assert.ok(port.checks.every((check) => check.companyId === COMPANY_B));
    assert.equal(port.checks.some((check) => check.companyId === COMPANY_A), false);
  });

  it("8. Ticketing dual-gate: both ticketing + ai_ticketing required", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("create_ticket"), [
      "ai_employee",
      "ticketing",
      "ai_ticketing",
    ]);

    const onlyTicketing = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "ticketing"]),
    });
    const denied = await routeUnderScope({
      toolKey: "create_ticket",
      allowedToolKeys: ["create_ticket"],
      companyId: COMPANY_A,
      isFeatureEnabled: onlyTicketing.isFeatureEnabled,
    });
    assert.equal(denied.routerCalled, false);
    assert.equal(denied.result.errorCode, "FEATURE_NOT_ENTITLED");

    const both = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "ticketing", "ai_ticketing"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "create_ticket",
      allowedToolKeys: ["create_ticket"],
      companyId: COMPANY_A,
      isFeatureEnabled: both.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("Phase 5C: invoice_search requires ai_employee + finance commercial entitlement", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("invoice_search"), [
      "ai_employee",
      "finance",
    ]);

    const withoutFinance = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const denied = await routeUnderScope({
      toolKey: "invoice_search",
      allowedToolKeys: ["invoice_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: withoutFinance.isFeatureEnabled,
    });
    assert.equal(denied.routerCalled, false);
    assert.equal(denied.result.errorCode, "FEATURE_NOT_ENTITLED");

    const withFinance = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "finance"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "invoice_search",
      allowedToolKeys: ["invoice_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: withFinance.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("Phase 5D: booking_search requires ai_employee + bookings commercial entitlement", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("booking_search"), [
      "ai_employee",
      "bookings",
    ]);

    const withoutBookings = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const denied = await routeUnderScope({
      toolKey: "booking_search",
      allowedToolKeys: ["booking_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: withoutBookings.isFeatureEnabled,
    });
    assert.equal(denied.routerCalled, false);
    assert.equal(denied.result.errorCode, "FEATURE_NOT_ENTITLED");

    const withBookings = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "booking_search",
      allowedToolKeys: ["booking_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: withBookings.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("9. Core customers capability still works when entitled", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "customers"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_customer",
      allowedToolKeys: ["create_customer", "search_customer"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, true);
    assert.equal(result.status, "succeeded");
    assert.deepEqual(resolveRequiredFeatureCodesForTool("create_customer"), [
      "ai_employee",
      "customers",
    ]);
  });

  it("10. Booking execution works when bookings is entitled", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking", "search_availability"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, true);
    assert.equal(result.status, "succeeded");
  });

  it("11. Removing bookings entitlement blocks create_booking despite assignment", async () => {
    const enabled = new Set(["ai_employee", "bookings"]);
    const port = {
      async isFeatureEnabled(_companyId: string, featureCode: string) {
        return enabled.has(featureCode);
      },
    };

    const on = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(on.result.status, "succeeded");

    enabled.delete("bookings");
    const off = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(off.routerCalled, false);
    assert.equal(off.result.errorCode, "FEATURE_NOT_ENTITLED");
  });

  it("12. Re-enabling bookings allows the assigned tool again", async () => {
    const enabled = new Set(["ai_employee"]);
    const port = {
      async isFeatureEnabled(_companyId: string, featureCode: string) {
        return enabled.has(featureCode);
      },
    };

    const off = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(off.result.errorCode, "FEATURE_NOT_ENTITLED");

    enabled.add("bookings");
    const on = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(on.routerCalled, true);
    assert.equal(on.result.status, "succeeded");
  });

  it("13. isSuperAdmin=true does NOT bypass commercial entitlement", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const { result, routerCalled } = await routeUnderScope({
      toolKey: "create_booking",
      allowedToolKeys: ["create_booking"],
      companyId: COMPANY_A,
      isSuperAdmin: true,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "FEATURE_NOT_ENTITLED");
  });

  it("TOOL_DISABLED when tool is explicitly disabled", async () => {
    const decision = await evaluateCommercialToolAccess({
      toolKey: "create_booking",
      companyId: COMPANY_A,
      isFeatureEnabled: async () => true,
      disabledToolKeys: ["create_booking"],
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.denialReason, "TOOL_DISABLED");
  });

  it("O. search/reschedule/cancel require bookings entitlement (Phase 2)", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    for (const toolKey of ["search_bookings", "reschedule_booking", "cancel_booking"] as const) {
      const { result, routerCalled } = await routeUnderScope({
        toolKey,
        allowedToolKeys: [toolKey],
        companyId: COMPANY_A,
        isFeatureEnabled: port.isFeatureEnabled,
      });
      assert.equal(routerCalled, false, toolKey);
      assert.equal(result.errorCode, "FEATURE_NOT_ENTITLED", toolKey);
    }

    const entitled = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "cancel_booking",
      allowedToolKeys: ["cancel_booking"],
      companyId: COMPANY_A,
      isFeatureEnabled: entitled.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("Phase 5F: escalate_to_human requires ai_employee + omnichannel", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("escalate_to_human"), [
      "ai_employee",
      "omnichannel",
    ]);
    const missing = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const denied = await routeUnderScope({
      toolKey: "escalate_to_human",
      allowedToolKeys: ["escalate_to_human"],
      companyId: COMPANY_A,
      isFeatureEnabled: missing.isFeatureEnabled,
    });
    assert.equal(denied.routerCalled, false);
    assert.equal(denied.result.errorCode, "FEATURE_NOT_ENTITLED");

    const entitled = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "omnichannel"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "escalate_to_human",
      allowedToolKeys: ["escalate_to_human"],
      companyId: COMPANY_A,
      isFeatureEnabled: entitled.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("Phase 5F: handoff tools deny when unassigned; super-admin does not bypass", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "omnichannel"]),
    });
    const unassigned = await routeUnderScope({
      toolKey: "queue_handoff",
      allowedToolKeys: ["escalate_to_human"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(unassigned.routerCalled, false);
    assert.equal(unassigned.result.errorCode, TOOL_NOT_ASSIGNED_CODE);

    const bypass = await routeUnderScope({
      toolKey: "return_to_ai",
      allowedToolKeys: [],
      companyId: COMPANY_A,
      isSuperAdmin: true,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(bypass.routerCalled, false);
    assert.equal(bypass.result.errorCode, TOOL_NOT_ASSIGNED_CODE);
  });

  it("Phase 5G: create_lead requires ai_employee + leads", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("create_lead"), [
      "ai_employee",
      "leads",
    ]);
    const missing = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const denied = await routeUnderScope({
      toolKey: "create_lead",
      allowedToolKeys: ["create_lead"],
      companyId: COMPANY_A,
      isFeatureEnabled: missing.isFeatureEnabled,
    });
    assert.equal(denied.routerCalled, false);
    assert.equal(denied.result.errorCode, "FEATURE_NOT_ENTITLED");

    const entitled = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "leads"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "create_lead",
      allowedToolKeys: ["create_lead"],
      companyId: COMPANY_A,
      isFeatureEnabled: entitled.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("Phase 5G: lead tools deny when unassigned; super-admin does not bypass", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "leads"]),
    });
    const unassigned = await routeUnderScope({
      toolKey: "search_lead",
      allowedToolKeys: ["create_lead"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(unassigned.routerCalled, false);
    assert.equal(unassigned.result.errorCode, TOOL_NOT_ASSIGNED_CODE);

    const bypass = await routeUnderScope({
      toolKey: "qualify_lead",
      allowedToolKeys: [],
      companyId: COMPANY_A,
      isSuperAdmin: true,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(bypass.routerCalled, false);
    assert.equal(bypass.result.errorCode, TOOL_NOT_ASSIGNED_CODE);
  });

  it("Phase 5H: check_in/check_out require ai_employee + bookings", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("check_in"), ["ai_employee", "bookings"]);
    assert.deepEqual(resolveRequiredFeatureCodesForTool("check_out"), ["ai_employee", "bookings"]);

    const missing = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    for (const toolKey of ["check_in", "check_out"] as const) {
      const denied = await routeUnderScope({
        toolKey,
        allowedToolKeys: [toolKey],
        companyId: COMPANY_A,
        isFeatureEnabled: missing.isFeatureEnabled,
      });
      assert.equal(denied.routerCalled, false, toolKey);
      assert.equal(denied.result.errorCode, "FEATURE_NOT_ENTITLED", toolKey);
    }

    const entitled = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const allowed = await routeUnderScope({
      toolKey: "check_in",
      allowedToolKeys: ["check_in"],
      companyId: COMPANY_A,
      isFeatureEnabled: entitled.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });

  it("Phase 5H: check_in deny when unassigned; super-admin does not bypass", async () => {
    const port = entitledPort({
      [COMPANY_A]: new Set(["ai_employee", "bookings"]),
    });
    const unassigned = await routeUnderScope({
      toolKey: "check_out",
      allowedToolKeys: ["check_in"],
      companyId: COMPANY_A,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(unassigned.routerCalled, false);
    assert.equal(unassigned.result.errorCode, TOOL_NOT_ASSIGNED_CODE);

    const bypass = await routeUnderScope({
      toolKey: "check_in",
      allowedToolKeys: [],
      companyId: COMPANY_A,
      isSuperAdmin: true,
      isFeatureEnabled: port.isFeatureEnabled,
    });
    assert.equal(bypass.routerCalled, false);
    assert.equal(bypass.result.errorCode, TOOL_NOT_ASSIGNED_CODE);
  });

  it("Phase 5K.1: knowledge_search requires ai_employee; assignment gate remains", async () => {
    assert.deepEqual(resolveRequiredFeatureCodesForTool("knowledge_search"), ["ai_employee"]);

    const missingAiEmployee = entitledPort({
      [COMPANY_A]: new Set(["bookings"]),
    });
    const noEntitlement = await routeUnderScope({
      toolKey: "knowledge_search",
      allowedToolKeys: ["knowledge_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: missingAiEmployee.isFeatureEnabled,
    });
    assert.equal(noEntitlement.routerCalled, false);
    assert.equal(noEntitlement.result.errorCode, "FEATURE_NOT_ENTITLED");

    const entitled = entitledPort({
      [COMPANY_A]: new Set(["ai_employee"]),
    });
    const unassigned = await routeUnderScope({
      toolKey: "knowledge_search",
      allowedToolKeys: ["search_customer"],
      companyId: COMPANY_A,
      isFeatureEnabled: entitled.isFeatureEnabled,
    });
    assert.equal(unassigned.routerCalled, false);
    assert.equal(unassigned.result.errorCode, TOOL_NOT_ASSIGNED_CODE);

    const allowed = await routeUnderScope({
      toolKey: "knowledge_search",
      allowedToolKeys: ["knowledge_search"],
      companyId: COMPANY_A,
      isFeatureEnabled: entitled.isFeatureEnabled,
    });
    assert.equal(allowed.routerCalled, true);
    assert.equal(allowed.result.status, "succeeded");
  });
});
