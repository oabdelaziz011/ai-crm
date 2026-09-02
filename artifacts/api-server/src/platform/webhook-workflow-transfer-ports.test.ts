/**
 * B1.2 Part 6B-FIX — webhook workflow transfer SYSTEM_CONTEXT bypass closed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { AUTOMATION_PERMISSIONS } from "@workspace/automation-platform";
import { PLATFORM_AI_FEATURE_KEY } from "@workspace/platform-ai-provider";
import {
  buildWebhookWorkflowTransferServiceContext,
  type BuildWebhookWorkflowTransferServiceContextInput,
} from "./webhook-workflow-transfer-ports.js";
import type { PlatformFeatureEnabledResolver } from "./webhook-ai-workflow-bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
const transferSource = readFileSync(resolve(here, "webhook-workflow-transfer-ports.ts"), "utf8");

function baseInput(
  overrides: Partial<BuildWebhookWorkflowTransferServiceContextInput> & {
    resolvePlatformFeatureEnabled?: PlatformFeatureEnabledResolver;
  } = {},
): BuildWebhookWorkflowTransferServiceContextInput {
  return {
    companyId: "company-1",
    resolvePlatformFeatureEnabled: async () => true,
    ...overrides,
  };
}

describe("Part 6B-FIX — source contract (no fabricated SYSTEM_CONTEXT)", () => {
  it("E removes fabricated SYSTEM_CONTEXT isSuperAdmin/hasPermission allow-all", () => {
    assert.doesNotMatch(transferSource, /SYSTEM_CONTEXT/);
    assert.doesNotMatch(transferSource, /isSuperAdmin:\s*true/);
    assert.doesNotMatch(transferSource, /hasPermission:\s*\(\)\s*=>\s*true/);
    // Context object must not assign companyId: null (type unions may still mention null).
    assert.doesNotMatch(transferSource, /companyId:\s*null,/);
    assert.match(transferSource, /isSuperAdmin:\s*false/);
    assert.match(transferSource, /createWebhookPlatformFeatureResolver|resolvePlatformFeatureEnabled/);
    assert.match(transferSource, /buildWebhookWorkflowTransferServiceContext/);
    assert.match(transferSource, /PLATFORM_AI_FEATURE_KEY\.AUTOMATION/);
  });
});

describe("Part 6B-FIX — buildWebhookWorkflowTransferServiceContext matrix", () => {
  it("A flag true → ALLOW company-scoped context", async () => {
    const ctx = await buildWebhookWorkflowTransferServiceContext(baseInput());
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.companyId, "company-1");
    assert.equal(ctx.userId, null);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), true);
    assert.equal(ctx.hasPermission(AUTOMATION_PERMISSIONS.execute), true);
    assert.equal(ctx.hasPermission(AUTOMATION_PERMISSIONS.view), false);
    assert.equal(ctx.hasPermission("platform.admin"), false);
  });

  it("B flag false → DENY", async () => {
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({ resolvePlatformFeatureEnabled: async () => false }),
        ),
      /Workflow feature disabled/,
    );
  });

  it("C flag missing / non-true → DENY", async () => {
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({
            resolvePlatformFeatureEnabled: async () => undefined as unknown as boolean,
          }),
        ),
      /Workflow feature disabled/,
    );
  });

  it("D resolver error → DENY", async () => {
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({
            resolvePlatformFeatureEnabled: async () => {
              throw new Error("rpc failed");
            },
          }),
        ),
      /Workflow feature disabled/,
    );
  });

  it("E ordinary path never yields isSuperAdmin true (even if resolver would allow)", async () => {
    const ctx = await buildWebhookWorkflowTransferServiceContext(baseInput());
    assert.equal(ctx.isSuperAdmin, false);
    assert.notEqual(ctx.hasPermission, undefined);
    // Blanket allow-all must not exist
    assert.equal(ctx.hasPermission("anything.else"), false);
  });

  it("F missing / null companyId → DENY", async () => {
    await assert.rejects(
      () => buildWebhookWorkflowTransferServiceContext(baseInput({ companyId: "" })),
      /Workflow feature disabled/,
    );
    await assert.rejects(
      () => buildWebhookWorkflowTransferServiceContext(baseInput({ companyId: null })),
      /Workflow feature disabled/,
    );
    await assert.rejects(
      () => buildWebhookWorkflowTransferServiceContext(baseInput({ companyId: undefined })),
      /Workflow feature disabled/,
    );
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({ companyId: "company-1", trustedCompanyId: "" }),
        ),
      /Workflow feature disabled/,
    );
  });

  it("G company mismatch → DENY", async () => {
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({ companyId: "company-a", trustedCompanyId: "company-b" }),
        ),
      /Company context mismatch/,
    );
  });

  it("H commercial denied + platform would-be true → DENY (resolver false)", async () => {
    // Production createWebhookPlatformFeatureResolver returns false when commercial fails.
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({
            resolvePlatformFeatureEnabled: async (_c, key) => {
              void key;
              return false; // commercial∩platform combined deny
            },
          }),
        ),
      /Workflow feature disabled/,
    );
  });

  it("I commercial allowed + platform false → DENY", async () => {
    await assert.rejects(
      () =>
        buildWebhookWorkflowTransferServiceContext(
          baseInput({
            resolvePlatformFeatureEnabled: async (_c, key) => {
              if (key === PLATFORM_AI_FEATURE_KEY.AUTOMATION) return false;
              return true;
            },
          }),
        ),
      /Workflow feature disabled/,
    );
  });

  it("J commercial allowed + platform true → ALLOW", async () => {
    const ctx = await buildWebhookWorkflowTransferServiceContext(
      baseInput({
        trustedCompanyId: "company-1",
        resolvePlatformFeatureEnabled: async (_c, key) =>
          key === PLATFORM_AI_FEATURE_KEY.AUTOMATION,
      }),
    );
    assert.equal(ctx.companyId, "company-1");
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.isWorkflowFeatureEnabled?.(), true);
    assert.equal(ctx.hasPermission(AUTOMATION_PERMISSIONS.execute), true);
  });
});

describe("Part 6B-FIX — shared transfer gates remain wired (K/L/M)", () => {
  it("K/L/M createWebhookWorkflowTransferPorts still uses createWorkflowTransferToolPorts", () => {
    assert.match(transferSource, /createWorkflowTransferToolPorts/);
    // Shared adapter enforces allowed_tool_keys, transferableFlowId, flow/conversation company.
    const sharedAdapter = readFileSync(
      resolve(
        here,
        "../../../../lib/ai-tool-router/src/adapters/workflow-transfer-tool-ports.ts",
      ),
      "utf8",
    );
    assert.match(sharedAdapter, /transfer_to_workflow is not enabled on this AI employee/);
    assert.match(sharedAdapter, /Requested workflow is not allowed for this AI employee/);
    assert.match(sharedAdapter, /conversation\.company_id !== companyId/);
  });

  it("M engine still enforces flow.company_id ownership under company-scoped context", () => {
    const engineSource = readFileSync(
      resolve(here, "../../../../lib/automation-platform/src/engine/automation-engine.ts"),
      "utf8",
    );
    assert.match(engineSource, /flow\.company_id !== input\.companyId/);
  });
});
