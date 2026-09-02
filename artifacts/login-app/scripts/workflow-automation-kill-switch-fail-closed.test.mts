/**
 * B1.2 Part 6 — Workflow / automation kill-switch hardening.
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/workflow-automation-kill-switch-fail-closed.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  assertWorkflowFeatureEnabled,
} from "../../../lib/automation-platform/src/utils/workflow-guards.ts";
import { WorkflowFeatureDisabledError } from "../../../lib/automation-platform/src/errors.ts";
import type { ServiceContext } from "../../../lib/automation-platform/src/types.ts";
import {
  assertWorkflowAutomationEnabled,
  WorkflowAiFeatureDisabledError,
} from "../../../lib/ai-workflow-platform/src/utils/workflow-guards.ts";
import type { AIWorkflowServiceContext } from "../../../lib/ai-workflow-platform/src/adapters/ai-workflow-execution-adapter.ts";

const here = dirname(fileURLToPath(import.meta.url));
const writePortSource = readFileSync(
  resolve(here, "../src/lib/application-layer/adapters/workflow-write-port-adapter.ts"),
  "utf8",
);
const resolveFeatureFlagSource = readFileSync(
  resolve(here, "../src/lib/application-layer/resolve-feature-flag.ts"),
  "utf8",
);
const automationGuardsSource = readFileSync(
  resolve(here, "../../../lib/automation-platform/src/utils/workflow-guards.ts"),
  "utf8",
);
const aiGuardsSource = readFileSync(
  resolve(here, "../../../lib/ai-workflow-platform/src/utils/workflow-guards.ts"),
  "utf8",
);

function automationCtx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
    isWorkflowFeatureEnabled: () => true,
    ...overrides,
  };
}

function aiCtx(overrides?: Partial<AIWorkflowServiceContext>): AIWorkflowServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
    isWorkflowFeatureEnabled: () => true,
    ...overrides,
  };
}

/** Mirrors resolveFeatureEnabledViaApplicationLayer Platform-AI commercial ∧ flag composition. */
function decideCommercialAndPlatform(input: {
  commercialEntitled: boolean;
  platformFlag: boolean | null | undefined;
  platformError?: boolean;
  companyId?: string | null;
}): boolean {
  if (!input.companyId?.trim()) return false;
  if (!input.commercialEntitled) return false;
  if (input.platformError) return false;
  return input.platformFlag === true;
}

describe("Part 6 — write-port wiring contract", () => {
  it("C/D no longer hardcodes isWorkflowFeatureEnabled: () => true", () => {
    assert.doesNotMatch(writePortSource, /isWorkflowFeatureEnabled:\s*\(\)\s*=>\s*true/);
    assert.match(writePortSource, /resolveFeatureEnabledViaApplicationLayer/);
    assert.match(writePortSource, /PLATFORM_AI_FEATURE_KEY\.AUTOMATION/);
    assert.match(writePortSource, /resolveWorkflowWritePortFeatureEnabled/);
  });

  it("uses trusted portContext.companyId (tenant isolation)", () => {
    assert.match(writePortSource, /if \(!ctx\.companyId\?\.trim\(\)\)/);
    assert.match(writePortSource, /tenantId !== ctx\.companyId/);
  });
});

describe("Part 6 — automation guard matrix", () => {
  it("A true → ALLOW", () => {
    assert.doesNotThrow(() =>
      assertWorkflowFeatureEnabled(automationCtx({ isWorkflowFeatureEnabled: () => true })),
    );
  });

  it("B false → DENY", () => {
    assert.throws(
      () => assertWorkflowFeatureEnabled(automationCtx({ isWorkflowFeatureEnabled: () => false })),
      WorkflowFeatureDisabledError,
    );
  });

  it("D callback missing → DENY", () => {
    assert.throws(
      () => assertWorkflowFeatureEnabled(automationCtx({ isWorkflowFeatureEnabled: undefined })),
      WorkflowFeatureDisabledError,
    );
  });

  it("E undefined return → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          automationCtx({ isWorkflowFeatureEnabled: () => undefined as unknown as boolean }),
        ),
      WorkflowFeatureDisabledError,
    );
  });

  it("F throw → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          automationCtx({
            isWorkflowFeatureEnabled: () => {
              throw new Error("x");
            },
          }),
        ),
      WorkflowFeatureDisabledError,
    );
  });

  it("G automation callback missing → DENY", () => {
    assert.throws(
      () => assertWorkflowFeatureEnabled(automationCtx({ isWorkflowFeatureEnabled: undefined })),
      WorkflowFeatureDisabledError,
    );
  });

  it("L missing company → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          automationCtx({ companyId: null, isWorkflowFeatureEnabled: () => true }),
        ),
      WorkflowFeatureDisabledError,
    );
  });
});

describe("Part 6 — AI workflow guard matrix", () => {
  it("H AI workflow callback missing → DENY", () => {
    assert.throws(
      () => assertWorkflowAutomationEnabled(aiCtx({ isWorkflowFeatureEnabled: undefined })),
      WorkflowAiFeatureDisabledError,
    );
  });

  it("readFlag no longer fail-opens with ?? true", () => {
    assert.doesNotMatch(aiGuardsSource, /enabled\?\.\(\)\s*\?\?\s*true/);
    assert.match(aiGuardsSource, /return enabled\(\) === true/);
  });

  it("automation guard requires enabled !== true (not only false)", () => {
    assert.match(automationGuardsSource, /enabled !== true/);
    assert.doesNotMatch(
      automationGuardsSource,
      /if \(ctx\.isWorkflowFeatureEnabled && !ctx\.isWorkflowFeatureEnabled\(\)\)/,
    );
  });
});

describe("Part 6 — commercial ∧ platform interaction", () => {
  it("I commercial false + flag true → DENY", () => {
    assert.equal(
      decideCommercialAndPlatform({
        companyId: "co-1",
        commercialEntitled: false,
        platformFlag: true,
      }),
      false,
    );
  });

  it("J commercial true + flag false → DENY", () => {
    assert.equal(
      decideCommercialAndPlatform({
        companyId: "co-1",
        commercialEntitled: true,
        platformFlag: false,
      }),
      false,
    );
  });

  it("K commercial true + flag true → ALLOW", () => {
    assert.equal(
      decideCommercialAndPlatform({
        companyId: "co-1",
        commercialEntitled: true,
        platformFlag: true,
      }),
      true,
    );
  });

  it("C missing platform flag → DENY", () => {
    assert.equal(
      decideCommercialAndPlatform({
        companyId: "co-1",
        commercialEntitled: true,
        platformFlag: null,
      }),
      false,
    );
  });

  it("resolver still commercial-first for Platform AI keys", () => {
    assert.match(resolveFeatureFlagSource, /requireCompanyFeature/);
    assert.match(resolveFeatureFlagSource, /platform_ai_feature_enabled/);
    assert.match(resolveFeatureFlagSource, /return data === true/);
  });
});

describe("Part 6B-FIX — webhook workflow transfer residual closed", () => {
  it("webhook-workflow-transfer-ports no longer fabricates SYSTEM_CONTEXT super-admin", () => {
    const webhookTransfer = readFileSync(
      resolve(here, "../../api-server/src/platform/webhook-workflow-transfer-ports.ts"),
      "utf8",
    );
    assert.doesNotMatch(webhookTransfer, /SYSTEM_CONTEXT/);
    assert.doesNotMatch(webhookTransfer, /isSuperAdmin:\s*true/);
    assert.match(webhookTransfer, /buildWebhookWorkflowTransferServiceContext/);
    assert.match(webhookTransfer, /isSuperAdmin:\s*false/);
  });
});

describe("Part 6C-FIX — inbound ports.automation residual closed", () => {
  it("create-webhook-platform automation auth is per-call resolveServiceContext", () => {
    const createWebhookPlatform = readFileSync(
      resolve(here, "../../api-server/src/platform/create-webhook-platform.ts"),
      "utf8",
    );
    assert.doesNotMatch(createWebhookPlatform, /automation:\s*SYSTEM_CONTEXT/);
    assert.match(createWebhookPlatform, /resolveInboundAutomationServiceContext/);
  });
});
