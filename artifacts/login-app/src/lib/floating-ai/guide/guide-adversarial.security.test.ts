/**
 * Adversarial, fail-closed security tests for AI Guide.
 * Guide must stay tool-less, navigation must stay client-authorized, and
 * Production dual gates (ai_guide_locked, handoff runtime) must stay intact.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  RuntimeToolPort,
  RuntimeToolRouteInput,
  RuntimeToolRouteResult,
  ServiceContext,
} from "@workspace/ai-execution-engine";
import {
  AI_GUIDE_TOOL_DENIED_CODE,
  ASSIST_CONVERSATION_STORAGE_PREFIX,
  ASSIST_FLOATING_CONVERSATION_SOURCE,
  GUIDE_ALLOWED_TOOL_KEYS,
  GUIDE_CONVERSATION_SOURCE,
  GUIDE_CONVERSATION_STORAGE_PREFIX,
  applyGuidePageContextRestrictions,
  conversationSourceForSurface,
  conversationStorageKeyForSurface,
  createGuideToolGuard,
  isGuideConversationMetadata,
} from "./guide-security";
import { authorizeGuideNavigation } from "./guide-navigation";
import type { GuideEffectiveAuth } from "./guide-auth";
import { createGuideWorkflowRuntime, type GuideWorkflowState } from "./guide-workflow-runtime";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../../..");

const ATTACK_TOOLS = ["knowledge_search", "create_customer", "escalate_to_human"] as const;

function recordingPort(routed: string[]): RuntimeToolPort {
  return {
    allowedToolKeys: () => [...ATTACK_TOOLS],
    listLlmTools: () =>
      ATTACK_TOOLS.map((name) => ({
        type: "function" as const,
        function: { name, description: name, parameters: { type: "object", properties: {} } },
      })),
    async route(_ctx, input) {
      routed.push(input.toolKey);
      return {
        executionId: `ok-${input.toolKey}`,
        toolKey: input.toolKey,
        status: "completed",
        output: { ok: true },
        durationMs: 1,
      } satisfies RuntimeToolRouteResult;
    },
  };
}

const ctx: ServiceContext = {
  userId: "user-1",
  companyId: "company-a",
  isSuperAdmin: false,
  hasPermission: () => true,
};

function auth(overrides: Partial<GuideEffectiveAuth> = {}): GuideEffectiveAuth {
  return {
    userId: "u",
    companyId: "c",
    isSuperAdmin: false,
    permissionCodes: [],
    permissionsAvailable: true,
    ...overrides,
  };
}

describe("Guide adversarial security (fail-closed)", () => {
  it("1. GUIDE_ALLOWED_TOOL_KEYS remains empty and frozen", () => {
    assert.deepEqual([...GUIDE_ALLOWED_TOOL_KEYS], []);
    assert.equal(GUIDE_ALLOWED_TOOL_KEYS.length, 0);
    assert.ok(Object.isFrozen(GUIDE_ALLOWED_TOOL_KEYS));
    // Forged page-context tool lists are overwritten.
    const restricted = applyGuidePageContextRestrictions({
      allowedToolKeys: ["knowledge_search", "create_customer", "escalate_to_human"],
    });
    assert.deepEqual(restricted.allowedToolKeys, []);
  });

  it("2. tool guard denies knowledge_search, create_customer, escalate_to_human", async () => {
    const routed: string[] = [];
    const guarded = createGuideToolGuard(recordingPort(routed), {
      async isGuideConversation() {
        return true;
      },
    });
    for (const toolKey of ATTACK_TOOLS) {
      const result = await guarded.route(ctx, {
        conversationId: "guide-conv",
        toolKey,
        input: {},
        triggeredBy: "llm",
      } as RuntimeToolRouteInput);
      assert.equal(result.status, "failed", toolKey);
      assert.equal(result.errorCode, AI_GUIDE_TOOL_DENIED_CODE, toolKey);
    }
    assert.deepEqual(routed, [], "underlying router must never be reached");
  });

  it("2b. tool guard fails closed when the lock resolver throws", async () => {
    const routed: string[] = [];
    const guarded = createGuideToolGuard(recordingPort(routed), {
      async isGuideConversation() {
        throw new Error("lookup unavailable");
      },
    });
    for (const toolKey of ATTACK_TOOLS) {
      const result = await guarded.route(ctx, {
        conversationId: "unknown-conv",
        toolKey,
        input: {},
        triggeredBy: "llm",
      } as RuntimeToolRouteInput);
      assert.equal(result.status, "failed", toolKey);
      assert.equal(result.errorCode, AI_GUIDE_TOOL_DENIED_CODE, toolKey);
    }
    assert.deepEqual(routed, []);
  });

  it("3. forged assist metadata.source / pageContext cannot enable tools when resolver says locked", async () => {
    const routed: string[] = [];
    const guarded = createGuideToolGuard(recordingPort(routed), {
      async isGuideConversation() {
        return true; // authoritative ai_guide_locked
      },
    });

    // Client-side forged marker is not trusted as a Guide *unlock*.
    assert.equal(isGuideConversationMetadata({ source: ASSIST_FLOATING_CONVERSATION_SOURCE }), false);

    for (const toolKey of ATTACK_TOOLS) {
      const forged = {
        conversationId: "guide-conv",
        toolKey,
        input: {},
        triggeredBy: "llm",
        metadata: { source: ASSIST_FLOATING_CONVERSATION_SOURCE },
        pageContext: { assistantSurface: "assist", guideMode: false, allowedToolKeys: [toolKey] },
      } as unknown as RuntimeToolRouteInput;
      const result = await guarded.route(ctx, forged);
      assert.equal(result.status, "failed", toolKey);
      assert.equal(result.errorCode, AI_GUIDE_TOOL_DENIED_CODE, toolKey);
    }
    assert.deepEqual(routed, []);
  });

  it("4. navigation denied without permissions, without context, and for unauthorized/unknown routes", () => {
    // No permission codes loaded at all.
    const noPerms = authorizeGuideNavigation(auth({ permissionsAvailable: false }), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(noPerms.ok, false);

    // Permissions loaded but empty => unauthorized.
    const empty = authorizeGuideNavigation(auth(), { kind: "route", routeId: "customers" });
    assert.equal(empty.ok, false);

    // Missing user / tenant context.
    for (const partial of [{ userId: "" }, { companyId: "" }] as const) {
      const result = authorizeGuideNavigation(
        auth({ ...partial, permissionCodes: ["customers.view"] }),
        { kind: "route", routeId: "customers" },
      );
      assert.equal(result.ok, false);
    }

    // Invented route / path.
    const invented = authorizeGuideNavigation(auth({ permissionCodes: ["customers.view"] }), {
      kind: "route",
      routeId: "totally-invented-route",
    });
    assert.equal(invented.ok, false);
    const forgedPath = authorizeGuideNavigation(auth({ permissionCodes: ["customers.view"] }), {
      kind: "path",
      nestedPath: "/../../admin/secret",
    });
    assert.equal(forgedPath.ok, false);

    // Positive control: navigation works only with the right permission.
    const allowed = authorizeGuideNavigation(auth({ permissionCodes: ["customers.view"] }), {
      kind: "route",
      routeId: "customers",
    });
    assert.equal(allowed.ok, true);
  });

  it("5. Guide and Assist surfaces use distinct sources and storage keys", () => {
    assert.equal(conversationSourceForSurface("guide", "floating"), GUIDE_CONVERSATION_SOURCE);
    assert.equal(conversationSourceForSurface("guide", "workspace"), GUIDE_CONVERSATION_SOURCE);
    assert.notEqual(
      conversationSourceForSurface("guide", "floating"),
      conversationSourceForSurface("assist", "floating"),
    );
    assert.notEqual(
      conversationSourceForSurface("guide", "workspace"),
      conversationSourceForSurface("assist", "workspace"),
    );
    assert.notEqual(GUIDE_CONVERSATION_STORAGE_PREFIX, ASSIST_CONVERSATION_STORAGE_PREFIX);
    assert.notEqual(
      conversationStorageKeyForSurface("co", "guide"),
      conversationStorageKeyForSurface("co", "assist"),
    );
  });

  it("6. workflow runtime never sets a success/business-op flag; completion only after user confirm", () => {
    const allowedKeys = new Set([
      "workflowId",
      "stepIndex",
      "status",
      "navigationRequested",
      "navigationRouteId",
      "deniedReason",
    ]);
    const snapshots: GuideWorkflowState[] = [];
    const runtime = createGuideWorkflowRuntime({
      conversationId: null,
      storage: null,
      getAuth: () =>
        auth({ permissionCodes: ["customers.view", "customers.create"] }),
    });
    runtime.subscribe(() => {
      const state = runtime.getState();
      if (state) snapshots.push({ ...state });
    });

    const started = runtime.startWorkflow("add_customer");
    assert.ok(started);
    assert.notEqual(started.status, "completed", "never auto-completes on start");

    let guard = 0;
    while (runtime.getState()?.status !== "completed" && guard++ < 20) {
      if (runtime.getState()?.navigationRequested) runtime.acknowledgeNavigation();
      const before = runtime.getState();
      runtime.confirmStep();
      assert.notDeepEqual(runtime.getState(), before, "confirm must advance or complete");
    }
    assert.equal(runtime.getState()?.status, "completed");

    assert.ok(snapshots.length > 1);
    for (const snap of snapshots) {
      for (const key of Object.keys(snap)) {
        assert.ok(allowedKeys.has(key), `unexpected runtime state key: ${key}`);
      }
      assert.ok(
        ["active", "awaiting_confirm", "completed", "cancelled", "denied"].includes(snap.status),
      );
      assert.equal("success" in snap, false);
      assert.equal("created" in snap, false);
      assert.equal("businessOperation" in snap, false);
      if (snap.status === "completed") {
        assert.equal(snap.navigationRequested, undefined);
      }
    }

    // Without permissions the workflow is denied, never started.
    const denied = createGuideWorkflowRuntime({
      conversationId: null,
      storage: null,
      getAuth: () => auth({ permissionCodes: [] }),
    }).startWorkflow("add_customer");
    assert.equal(denied?.status, "denied");
  });

  it("7. ToolRouterService still enforces ai_guide_locked === true", () => {
    const router = readFileSync(
      join(repoRoot, "lib/ai-tool-router/src/services/tool-router-service.ts"),
      "utf8",
    );
    assert.match(router, /ai_guide_locked === true/);
    assert.match(router, /AiGuideToolBlockedError/);
  });

  it("8. capability catalogs do not contain HANDOFF_RUNTIME (Prod dual gate preserved)", () => {
    const catalogs = [
      join(here, "../../ai-employees/utilities/ai-employee-capability-catalog.ts"),
      join(here, "../../platform-ai/ai-capability-catalog.ts"),
      join(here, "../../platform-ai/ai-capability-catalog-schema.ts"),
    ];
    for (const path of catalogs) {
      const text = readFileSync(path, "utf8");
      assert.doesNotMatch(text, /HANDOFF_RUNTIME/, path);
    }
  });
});
