import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TOOL_REGISTRY,
  buildToolRouterAuditReport,
  resolveLlmToolExposure,
} from "./llm-tool-catalog.js";
import { CREATE_CUSTOMER_TOOL_KEY } from "./tools/create-customer-tool.js";
import { listRegisteredToolHandlerKeys as listHandlerKeys } from "./tool-handler-registry.js";

describe("llm-tool-catalog", () => {
  it("registers every known tool with a classification", () => {
    assert.equal(TOOL_REGISTRY.length, 46);
    for (const entry of TOOL_REGISTRY) {
      assert.ok(entry.key);
      assert.ok(entry.classification);
    }
  });

  it("exposes production-ready and read-only tools when handlers are registered", () => {
    const registered = listHandlerKeys({
      customerService: {} as never,
      crmAgentPorts: {} as never,
      schedulingToolPorts: {} as never,
      ticketAgentPorts: {} as never,
      leadAgentPorts: {} as never,
      handoffAgentPorts: {} as never,
      workflowTransferPorts: {} as never,
    });

    const exposure = resolveLlmToolExposure(registered);
    assert.ok(exposure.allowedToolKeys.includes("create_customer"));
    assert.ok(exposure.allowedToolKeys.includes("create_booking"));
    assert.ok(exposure.allowedToolKeys.includes("search_ticket"));
    assert.equal(exposure.excludedMocks.length, 7);
    assert.equal(exposure.protectedConfirmation.length, 2);
    assert.equal(exposure.gaps.length, 0);
  });

  it("leaves CRM and ticket tools as gaps when only create_customer handler is wired", () => {
    const registered = listHandlerKeys({ customerService: {} as never });
    const exposure = resolveLlmToolExposure(registered);
    assert.deepEqual(exposure.allowedToolKeys, [CREATE_CUSTOMER_TOOL_KEY]);
    assert.equal(exposure.gaps.length, 36);
  });

  it("builds audit report with newly exposed tools", () => {
    const registered = listHandlerKeys({
      customerService: {} as never,
      crmAgentPorts: {} as never,
      schedulingToolPorts: {} as never,
      ticketAgentPorts: {} as never,
      leadAgentPorts: {} as never,
      handoffAgentPorts: {} as never,
      workflowTransferPorts: {} as never,
    });
    const report = buildToolRouterAuditReport(registered);
    assert.ok(report.llmExposure.exposedCount >= 24);
    assert.equal(report.excludedMockTools.length, 7);
    assert.equal(report.protectedConfirmationTools.length, 2);
    assert.equal(report.remainingGaps.length, 0);
  });

  it("excludes mock builtin tools from production handler registration by default", () => {
    const registered = listHandlerKeys({
      customerService: {} as never,
      includeMockTools: false,
    });
    assert.equal(registered.includes("faq"), false);
    assert.equal(registered.includes("knowledge_lookup"), false);
  });
});
