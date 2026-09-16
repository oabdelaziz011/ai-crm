/**
 * Phase 6D Step 3.2 — Client cannot bypass AG / visibility via spoofed flags.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "@workspace/assignment-governance";
import { CONVERSATION_PERMISSIONS } from "../constants.ts";
import {
  AssignmentTargetCannotReadConversationError,
  PermissionDeniedError,
} from "../errors.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ASSIGNMENT_INTERNAL_TRUST } from "../types.ts";
import { ConversationService } from "./conversation-service.ts";
import {
  buildTargetVisibilitySnapshot,
  type AssignmentTargetVisibilityPort,
} from "./assignment-visibility-compatibility.ts";

const COMPANY = "company-1";
const SALES = "dept-sales";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "actor-a",
    companyId: partial.companyId ?? COMPANY,
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? COMPANY,
    conversation_number: "C-1",
    company_channel_id: null,
    ai_assistant_id: "asst-1",
    channel_type: overrides.channel_type ?? "email",
    channel_instance_id: null,
    state: "waiting_user",
    external_thread_id: null,
    customer_id: null,
    assigned_user_id: overrides.assigned_user_id ?? null,
    department_id: overrides.department_id ?? SALES,
    metadata: {},
    priority: "normal",
    locked_by: null,
    locked_at: null,
    unread_count_employee: 0,
    unread_count_customer: 0,
    last_message_at: null,
    last_message_preview: null,
    last_participant_type: null,
    search_text: "",
    started_at: new Date().toISOString(),
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
  };
}

function actorCanAssign(): ServiceContext {
  return ctx({
    hasPermission: (p) =>
      p === CONVERSATION_PERMISSIONS.takeover || p === CONVERSATION_PERMISSIONS.view,
  });
}

describe("Phase 6D Step 3.2 assignment bypass hardening", () => {
  it("1/5/6. public assignConversation ignores skipAssignmentGovernance spoof", async () => {
    let visibilityLoaded = false;
    const port: AssignmentTargetVisibilityPort = {
      async loadTargetVisibilitySnapshot() {
        visibilityLoaded = true;
        return buildTargetVisibilitySnapshot({
          userId: "bare",
          companyId: COMPANY,
          permissions: [],
        });
      },
    };
    const store = createMemoryAssignmentStore();
    store.departments.set(SALES, { id: SALES, companyId: COMPANY, name: "Sales", branchId: "b1" });
    store.profiles.set("actor-a", {
      id: "actor-a",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.profiles.set("bare", {
      id: "bare",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.roleTemplates.set(`actor-a:${COMPANY}`, ["admin"]);
    const governance = createAssignmentGovernancePort(
      new AssignmentGovernanceService({ port: createMemoryAssignmentGovernanceDataPort(store) }),
    );

    let assignCalled = false;
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => {
          assignCalled = true;
          return conversation({ assigned_user_id: "bare" });
        },
      } as never,
      { assignmentGovernance: governance, assignmentTargetVisibility: port },
    );

    await assert.rejects(
      () =>
        service.assignConversation(actorCanAssign(), {
          conversationId: "conv-1",
          assignedUserId: "bare",
          skipAssignmentGovernance: true,
        }),
      AssignmentTargetCannotReadConversationError,
    );
    assert.equal(visibilityLoaded, true);
    assert.equal(assignCalled, false);
  });

  it("10/11. assignConversationInternal with trust token may skip guards", async () => {
    let visibilityLoaded = false;
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async (input) => conversation({ assigned_user_id: input.assignedUserId }),
      } as never,
      {
        assignmentTargetVisibility: {
          async loadTargetVisibilitySnapshot() {
            visibilityLoaded = true;
            return null;
          },
        },
      },
    );

    const row = await service.assignConversationInternal(actorCanAssign(), {
      conversationId: "conv-1",
      assignedUserId: "ai-target",
      skipAssignmentGovernance: true,
      internalTrust: ASSIGNMENT_INTERNAL_TRUST,
      assignmentAuditSource: "ai",
    });
    assert.equal(row.assigned_user_id, "ai-target");
    assert.equal(visibilityLoaded, false);
  });

  it("forged internalTrust (wrong symbol) cannot skip guards", async () => {
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => {
          throw new Error("assign must not run");
        },
      } as never,
      {
        assignmentTargetVisibility: {
          async loadTargetVisibilitySnapshot() {
            return buildTargetVisibilitySnapshot({
              userId: "bare",
              companyId: COMPANY,
              permissions: [],
            });
          },
        },
      },
    );

    await assert.rejects(
      () =>
        service.assignConversationInternal(actorCanAssign(), {
          conversationId: "conv-1",
          assignedUserId: "bare",
          skipAssignmentGovernance: true,
          // @ts-expect-error intentional forge attempt
          internalTrust: Symbol("fake"),
        }),
      PermissionDeniedError,
    );
  });

  it("integration API constructively whitelists assign/transfer fields", () => {
    const gatewayPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../artifacts/login-app/src/lib/integration/api/integration-api-gateway-service.ts",
    );
    const src = readFileSync(gatewayPath, "utf8");
    const assignIdx = src.indexOf("async assignConversation(");
    const transferIdx = src.indexOf("async transferConversation(");
    assert.ok(assignIdx > 0);
    assert.ok(transferIdx > 0);
    const assignBlock = src.slice(assignIdx, assignIdx + 700);
    const transferBlock = src.slice(transferIdx, transferIdx + 700);
    assert.doesNotMatch(assignBlock, /\.\.\.body/);
    assert.doesNotMatch(transferBlock, /\.\.\.body/);
    assert.match(assignBlock, /assigneeUserId:/);
    assert.match(transferBlock, /toUserId:/);
    // Must not forward sensitive fields into the command object (comments OK).
    assert.doesNotMatch(assignBlock, /^\s*skipAssignmentGovernance\s*:/m);
    assert.doesNotMatch(transferBlock, /^\s*requestedByAiAssistantId\s*:/m);
    assert.doesNotMatch(assignBlock, /^\s*trustedSystemExecution\s*:/m);
    assert.doesNotMatch(transferBlock, /^\s*trustedSystemExecution\s*:/m);
  });

  it("handoff skip requires trustedSystemExecution", () => {
    const handoffPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../lib/human-handoff-platform/src/services/handoff-command-service.ts",
    );
    const src = readFileSync(handoffPath, "utf8");
    assert.match(src, /trustedSystemExecution/);
    assert.match(
      src,
      /Boolean\(input\.trustedSystemExecution\) &&\s*\n\s*\(Boolean\(input\.requestedByAiAssistantId\) \|\| Boolean\(input\.skipAssignmentGovernance\)\)/,
    );
  });

  it("2/4/13. spoofed requestedByAiAssistantId alone does not skip visibility", async () => {
    let visibilityLoaded = false;
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => {
          throw new Error("assign must not run");
        },
      } as never,
      {
        assignmentTargetVisibility: {
          async loadTargetVisibilitySnapshot() {
            visibilityLoaded = true;
            return buildTargetVisibilitySnapshot({
              userId: "bare",
              companyId: COMPANY,
              permissions: [],
            });
          },
        },
      },
    );

    await assert.rejects(
      () =>
        service.assignConversation(actorCanAssign(), {
          conversationId: "conv-1",
          assignedUserId: "bare",
          // Client cannot pass AI identity as auth — field is not on public API path
          skipAssignmentGovernance: true,
        }),
      AssignmentTargetCannotReadConversationError,
    );
    assert.equal(visibilityLoaded, true);
  });

  it("public assign never enters skipGuards even with both spoof flags", async () => {
    const serviceSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "./conversation-service.ts"),
      "utf8",
    );
    assert.match(
      serviceSrc,
      /async assignConversation\([\s\S]*?return this\.executeAssignConversation\(ctx, input, \{ skipGuards: false \}\)/,
    );
    assert.match(serviceSrc, /input\.internalTrust !== ASSIGNMENT_INTERNAL_TRUST/);
  });
});
