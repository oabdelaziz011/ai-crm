/**
 * B1.2 Part 6A — Workflow transfer + webhook AI workflow bridge hardening.
 * Run: cd artifacts/login-app && npx tsx --test scripts/workflow-bridge-kill-switch-fail-closed.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { buildWorkflowTransferServiceContext } from "../src/lib/application-layer/application-layer-workflow-transfer-tool-ports.ts";

const here = dirname(fileURLToPath(import.meta.url));
const transferSource = readFileSync(
  resolve(here, "../src/lib/application-layer/application-layer-workflow-transfer-tool-ports.ts"),
  "utf8",
);
const webhookSource = readFileSync(
  resolve(here, "../../api-server/src/platform/webhook-ai-workflow-bridge.ts"),
  "utf8",
);
const webhookFactorySource = readFileSync(
  resolve(here, "../../api-server/src/platform/create-webhook-automation-services.ts"),
  "utf8",
);
const residualWebhookTransfer = readFileSync(
  resolve(here, "../../api-server/src/platform/webhook-workflow-transfer-ports.ts"),
  "utf8",
);

describe("Part 6A — hardcoded bypass removed (A/B)", () => {
  it("A transfer port no longer hardcodes feature=true technical context", () => {
    assert.doesNotMatch(transferSource, /WORKFLOW_BRIDGE_TECHNICAL_CONTEXT/);
    assert.match(transferSource, /resolveFeatureEnabledViaApplicationLayer/);
    assert.match(transferSource, /buildWorkflowTransferServiceContext/);
  });

  it("B transfer port no longer fabricates constant isSuperAdmin: true", () => {
    assert.doesNotMatch(
      transferSource,
      /const WORKFLOW_BRIDGE_TECHNICAL_CONTEXT[\s\S]*isSuperAdmin:\s*true/,
    );
  });

  it("A/B webhook AI bridge no longer hardcodes feature/super-admin allow", () => {
    assert.doesNotMatch(webhookSource, /isSuperAdmin:\s*true/);
    assert.doesNotMatch(webhookSource, /isWorkflowFeatureEnabled:\s*\(\)\s*=>\s*true/);
    assert.doesNotMatch(webhookSource, /isAiChatFeatureEnabled:\s*\(\)\s*=>\s*true/);
    assert.match(webhookSource, /isSuperAdmin:\s*false/);
    assert.match(webhookSource, /createWebhookPlatformFeatureResolver|platform_ai_feature_enabled/);
    assert.match(webhookSource, /requireCompanyFeature/);
  });

  it("webhook factory passes client for authoritative resolution", () => {
    assert.match(webhookFactorySource, /createWebhookAIWorkflowAutomationRegistry\(\{[\s\S]*client,/);
  });
});

describe("Part 6A — transfer service context matrix", () => {
  const baseCtx = {
    companyId: "company-a",
    actorUserId: "user-1",
    isSuperAdmin: false,
    hasPermission: () => false,
  };

  it("H missing company on port → DENY", async () => {
    await assert.rejects(
      () =>
        buildWorkflowTransferServiceContext(
          {} as never,
          { ...baseCtx, companyId: "" },
          "company-a",
        ),
      /Workflow feature disabled/,
    );
  });

  it("L caller cannot inject companyId (mismatch → DENY)", async () => {
    await assert.rejects(
      () => buildWorkflowTransferServiceContext({} as never, baseCtx, "company-b"),
      /Company context mismatch/,
    );
  });

  it("M super-admin only from authoritative portContext", () => {
    assert.match(transferSource, /if \(portContext\.isSuperAdmin\)/);
    assert.doesNotMatch(transferSource, /isSuperAdmin:\s*true,\s*\n\s*hasPermission:\s*\(\)\s*=>\s*true/);
  });

  it("N transfer path requires resolveFeatureEnabledViaApplicationLayer before engine.start", () => {
    assert.match(transferSource, /resolveFeatureEnabledViaApplicationLayer/);
    assert.match(transferSource, /PLATFORM_AI_FEATURE_KEY\.AUTOMATION/);
    assert.match(transferSource, /automation\.engine\.start\(serviceCtx/);
  });
});

describe("Part 6A — webhook wiring contracts (O)", () => {
  it("O webhook AI execute path uses resolved context (not fabricated allow)", () => {
    assert.match(webhookSource, /resolveWebhookAiServiceContext/);
    assert.match(webhookSource, /aiServices\.executor\.execute\(automationContext, serviceContext\)/);
  });
});

describe("Part 6B-FIX — webhook workflow transfer SYSTEM_CONTEXT closed", () => {
  it("webhook-workflow-transfer-ports no longer fabricates SYSTEM_CONTEXT super-admin", () => {
    assert.doesNotMatch(residualWebhookTransfer, /SYSTEM_CONTEXT/);
    assert.doesNotMatch(residualWebhookTransfer, /isSuperAdmin:\s*true/);
    assert.doesNotMatch(residualWebhookTransfer, /hasPermission:\s*\(\)\s*=>\s*true/);
    assert.match(residualWebhookTransfer, /buildWebhookWorkflowTransferServiceContext/);
    assert.match(residualWebhookTransfer, /isSuperAdmin:\s*false/);
    assert.match(
      residualWebhookTransfer,
      /createWebhookPlatformFeatureResolver|resolvePlatformFeatureEnabled/,
    );
  });
});

describe("Part 6C-FIX — inbound ports.automation SYSTEM_CONTEXT closed", () => {
  it("create-webhook-platform no longer wires automation: SYSTEM_CONTEXT", () => {
    const createWebhookPlatform = readFileSync(
      resolve(here, "../../api-server/src/platform/create-webhook-platform.ts"),
      "utf8",
    );
    assert.doesNotMatch(createWebhookPlatform, /automation:\s*SYSTEM_CONTEXT/);
    assert.match(createWebhookPlatform, /resolveInboundAutomationServiceContext/);
    assert.match(createWebhookPlatform, /buildWebhookWorkflowTransferServiceContext/);
    assert.match(createWebhookPlatform, /resolveServiceContext:\s*resolveInboundAutomationServiceContext/);
  });
});
