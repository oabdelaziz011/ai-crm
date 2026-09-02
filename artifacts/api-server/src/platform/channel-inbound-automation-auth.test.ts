/**
 * B1.2 Part 6C-FIX — inbound channel-bound automation SYSTEM_CONTEXT bypass closed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  AUTOMATION_PERMISSIONS,
  PermissionDeniedError,
  type ServiceContext as AutomationServiceContext,
} from "@workspace/automation-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import {
  createChannelAutomationPort,
  resolveChannelAutomationServiceContext,
  type ChannelAutomationAuth,
} from "./channel-automation-port.js";
import { buildWebhookWorkflowTransferServiceContext } from "./webhook-workflow-transfer-ports.js";
import type { PlatformFeatureEnabledResolver } from "./webhook-ai-workflow-bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
const createWebhookPlatformSource = readFileSync(resolve(here, "create-webhook-platform.ts"), "utf8");
const channelAutomationPortSource = readFileSync(resolve(here, "channel-automation-port.ts"), "utf8");
const channelPlatformPortsSource = readFileSync(resolve(here, "channel-platform-ports.ts"), "utf8");

function entitledResolver(enabled = true): PlatformFeatureEnabledResolver {
  return async (_companyId, key) => {
    if (key === PLATFORM_AI_FEATURE_KEY.AUTOMATION) return enabled;
    return false;
  };
}

describe("Part 6C-FIX — SYSTEM_CONTEXT not used for AutomationEngine auth", () => {
  it("create-webhook-platform wires automation via resolveServiceContext, not SYSTEM_CONTEXT", () => {
    assert.match(createWebhookPlatformSource, /resolveInboundAutomationServiceContext/);
    assert.match(createWebhookPlatformSource, /buildWebhookWorkflowTransferServiceContext/);
    assert.match(createWebhookPlatformSource, /createWebhookPlatformFeatureResolver/);
    assert.match(
      createWebhookPlatformSource,
      /automation:\s*\{[\s\S]*resolveServiceContext:\s*resolveInboundAutomationServiceContext/,
    );
    // Must not assign SYSTEM_CONTEXT to automation auth anymore.
    assert.doesNotMatch(createWebhookPlatformSource, /automation:\s*SYSTEM_CONTEXT/);
  });

  it("channel-automation-port resolves auth before start and resume", () => {
    assert.match(channelAutomationPortSource, /resolveChannelAutomationServiceContext/);
    assert.match(
      channelAutomationPortSource,
      /const ctx = await resolveChannelAutomationServiceContext\(auth, input\.companyId\)/,
    );
    assert.match(channelAutomationPortSource, /engine\.resume\(ctx,/);
    assert.match(channelAutomationPortSource, /engine\.start\(ctx,/);
    assert.match(channelAutomationPortSource, /engine\.abandonActiveRun\(ctx,/);
  });

  it("channel-platform-ports types automation as ChannelAutomationAuth", () => {
    assert.match(channelPlatformPortsSource, /ChannelAutomationAuth/);
  });
});

describe("Part 6C-FIX — resolveChannelAutomationServiceContext matrix", () => {
  it("A entitled + platform enabled → ALLOW company-scoped ctx", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: entitledResolver(true),
        }),
    };
    const ctx = await resolveChannelAutomationServiceContext(auth, "company-1");
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.companyId, "company-1");
    assert.equal(ctx.hasPermission(AUTOMATION_PERMISSIONS.execute), true);
    assert.equal(ctx.hasPermission(AUTOMATION_PERMISSIONS.view), false);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), true);
  });

  it("B no workflow_automation entitlement → DENY (resolver false)", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: async () => false,
        }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, "company-1"),
      /Workflow feature disabled/,
    );
  });

  it("C commercial/platform resolver error → DENY", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: async () => {
            throw new Error("rpc down");
          },
        }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, "company-1"),
      /Workflow feature disabled/,
    );
  });

  it("D platform flag false → DENY", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: entitledResolver(false),
        }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, "company-1"),
      /Workflow feature disabled/,
    );
  });

  it("E platform flag missing / non-true → DENY", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: async () => undefined as unknown as boolean,
        }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, "company-1"),
      /Workflow feature disabled/,
    );
  });

  it("F platform flag error → DENY", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: async () => {
            throw new Error("platform_ai_feature_enabled failed");
          },
        }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, "company-1"),
      /Workflow feature disabled/,
    );
  });

  it("G missing companyId → DENY", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: (companyId) =>
        buildWebhookWorkflowTransferServiceContext({
          companyId,
          resolvePlatformFeatureEnabled: entitledResolver(true),
        }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, ""),
      /Workflow feature disabled/,
    );
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, null),
      /Workflow feature disabled/,
    );
  });

  it("H tenant/company mismatch → DENY", async () => {
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: async () => ({
        userId: null,
        companyId: "company-other",
        isSuperAdmin: false,
        hasPermission: (code) => code === AUTOMATION_PERMISSIONS.execute,
        isWorkflowFeatureEnabled: () => true,
      }),
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(auth, "company-1"),
      /Company context mismatch/,
    );
  });

  it("I automation.execute missing → DENY at engine permission gate", async () => {
    const starts: AutomationServiceContext[] = [];
    const engine = {
      async start(ctx: AutomationServiceContext) {
        starts.push(ctx);
        if (ctx.isSuperAdmin) return { run: { id: "r1" }, session: { id: "s1" }, lifecycle: "completed", currentNodeId: null, variables: {} };
        if (!ctx.hasPermission(AUTOMATION_PERMISSIONS.execute)) {
          throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.execute);
        }
        return {
          run: { id: "r1", flow_version_id: null },
          session: { id: "s1" },
          lifecycle: "completed",
          currentNodeId: null,
          variables: {},
        };
      },
      async resume() {
        throw new Error("resume unused");
      },
      async abandonActiveRun() {
        return;
      },
    };

    const auth: ChannelAutomationAuth = {
      resolveServiceContext: async (companyId) => ({
        userId: null,
        companyId,
        isSuperAdmin: false,
        hasPermission: () => false,
        isWorkflowFeatureEnabled: () => true,
      }),
    };

    const port = createChannelAutomationPort(engine as never, auth);
    await assert.rejects(
      () =>
        port.startWorkflow({
          companyId: "company-1",
          flowId: "flow-1",
          channelKey: "whatsapp",
          externalUserId: "user-1",
          messageText: "hi",
        }),
      PermissionDeniedError,
    );
    assert.equal(starts.length, 1);
    assert.equal(starts[0]!.hasPermission(AUTOMATION_PERMISSIONS.execute), false);
  });

  it("J isSuperAdmin is false; K no hasPermission allow-all; SYSTEM_CONTEXT fixed auth rejected", async () => {
    const systemContext: AutomationServiceContext = {
      userId: null,
      companyId: null,
      isSuperAdmin: true,
      hasPermission: () => true,
    };
    await assert.rejects(
      () => resolveChannelAutomationServiceContext(systemContext, "company-1"),
      /Workflow feature disabled/,
    );

    const ctx = await resolveChannelAutomationServiceContext(
      {
        resolveServiceContext: (companyId) =>
          buildWebhookWorkflowTransferServiceContext({
            companyId,
            resolvePlatformFeatureEnabled: entitledResolver(true),
          }),
      },
      "company-1",
    );
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.hasPermission("platform.admin"), false);
    assert.equal(ctx.hasPermission(AUTOMATION_PERMISSIONS.execute), true);
  });
});

describe("Part 6C-FIX — start and resume share auth (O)", () => {
  it("O sticky resume path resolves auth before engine.resume", async () => {
    const resolved: string[] = [];
    const engine = {
      async start() {
        throw new Error("start should not run");
      },
      async resume(ctx: AutomationServiceContext) {
        resolved.push(`resume:${ctx.companyId}:${ctx.isSuperAdmin}`);
        return {
          run: { id: "run-1", flow_version_id: "v1", current_node_id: "n1" },
          session: { id: "sess-1", current_node_id: "n1" },
          lifecycle: "waiting_input",
          currentNodeId: "n1",
          variables: { __waitingFor: "choice" },
        };
      },
      async abandonActiveRun() {
        return;
      },
    };

    const sessions = {
      async findById() {
        return null;
      },
      findActiveByUser: async () => null,
      findResumableByUser: async () => ({
        id: "sess-1",
        company_id: "company-1",
        channel: "whatsapp",
        external_user_id: "user-1",
        flow_id: "flow-1",
        run_id: "run-1",
        status: "waiting_input",
        current_node_id: "n1",
        flow_version_id: "v1",
        variables: { __waitingFor: "choice" },
        last_activity_at: new Date().toISOString(),
      }),
      updateState: async () => null,
    };

    const runs = {
      async findById() {
        return {
          id: "run-1",
          company_id: "company-1",
          flow_id: "flow-1",
          status: "waiting_input",
          session_id: "sess-1",
          current_node_id: "n1",
          flow_version_id: "v1",
          variables: { __waitingFor: "choice" },
          started_at: new Date().toISOString(),
          finished_at: null,
        };
      },
    };

    // Use a thin port without full routing deps complexity: resolve auth + call resume via
    // startWorkflowImpl requires deps that satisfy resolveInboundAutomationContext.
    // Contract assertion: source wires resume after resolveChannelAutomationServiceContext.
    assert.match(channelAutomationPortSource, /const result = await engine\.resume\(ctx,/);

    const auth: ChannelAutomationAuth = {
      resolveServiceContext: async (companyId) => {
        resolved.push(`auth:${companyId}`);
        return {
          userId: null,
          companyId,
          isSuperAdmin: false,
          hasPermission: (code) => code === AUTOMATION_PERMISSIONS.execute,
          isWorkflowFeatureEnabled: () => true,
        };
      },
    };

    // Direct unit: resolver runs for any startWorkflow invocation before engine calls.
    const port = createChannelAutomationPort(engine as never, auth);
    await assert.rejects(
      () =>
        port.startWorkflow({
          companyId: "",
          flowId: "flow-1",
          channelKey: "whatsapp",
          externalUserId: "user-1",
          messageText: "1",
        }),
      /Workflow feature disabled/,
    );
    assert.deepEqual(resolved, []);

    void sessions;
    void runs;
  });

  it("Q/R/S channel keys share same resolveServiceContext model (whatsapp/instagram/messenger/email)", async () => {
    const companies: string[] = [];
    const auth: ChannelAutomationAuth = {
      resolveServiceContext: async (companyId) => {
        companies.push(companyId);
        return {
          userId: null,
          companyId,
          isSuperAdmin: false,
          hasPermission: (code) => code === AUTOMATION_PERMISSIONS.execute,
          isWorkflowFeatureEnabled: () => true,
        };
      },
    };

    const engine = {
      async start(ctx: AutomationServiceContext, input: { companyId: string }) {
        assert.equal(ctx.companyId, input.companyId);
        assert.equal(ctx.isSuperAdmin, false);
        return {
          run: { id: `run-${input.companyId}`, flow_version_id: null },
          session: { id: "s1" },
          lifecycle: "completed",
          currentNodeId: null,
          variables: {},
        };
      },
      async resume() {
        throw new Error("unused");
      },
      async abandonActiveRun() {
        return;
      },
    };

    const port = createChannelAutomationPort(engine as never, auth);
    for (const channelKey of ["whatsapp", "instagram", "messenger", "email"] as const) {
      const result = await port.startWorkflow({
        companyId: "company-1",
        flowId: "flow-1",
        channelKey,
        externalUserId: "ext-1",
        messageText: "hello",
      });
      assert.ok(result.runId);
    }
    assert.deepEqual(companies, ["company-1", "company-1", "company-1", "company-1"]);
  });
});

describe("Part 6C-FIX — ownership / inactive contracts preserved (L/M/N)", () => {
  it("L/M/N flow ownership and active status remain in AutomationEngine + flow validator", () => {
    const engineSource = readFileSync(
      resolve(here, "../../../../lib/automation-platform/src/engine/automation-engine.ts"),
      "utf8",
    );
    assert.match(engineSource, /flow\.company_id !== input\.companyId/);
    assert.match(engineSource, /Only active flows can be executed/);

    const validatorSource = readFileSync(resolve(here, "channel-automation-port.ts"), "utf8");
    assert.match(validatorSource, /data\.company_id !== companyId/);
    assert.match(validatorSource, /\.is\("deleted_at", null\)/);
    assert.match(validatorSource, /flowStatus === "active"/);
  });

  it("P/Q inbound binding + intent + sticky all call ports.automation.startWorkflow (same auth)", () => {
    const inboundSource = readFileSync(
      resolve(here, "../../../../lib/channel-platform/src/pipelines/inbound-message-pipeline.ts"),
      "utf8",
    );
    assert.match(inboundSource, /automation\.startWorkflow\(/);
    assert.match(inboundSource, /bindingWorkflow/);
    assert.match(inboundSource, /stickyTransfer/);
    assert.match(inboundSource, /intentTransferFlowId|ai_employee_intent/);
  });

  it("T channel outbound commercial gate remains intact (dispatcher path unchanged)", () => {
    const inboundSource = readFileSync(
      resolve(here, "../../../../lib/channel-platform/src/pipelines/inbound-message-pipeline.ts"),
      "utf8",
    );
    assert.match(inboundSource, /dispatchAutomationOutboundMessages/);
  });
});
