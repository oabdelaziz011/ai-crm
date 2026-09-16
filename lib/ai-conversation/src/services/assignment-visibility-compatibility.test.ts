/**
 * Phase 6D Step 3 — Assignment visibility compatibility tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "@workspace/assignment-governance";
import { CONVERSATION_PERMISSIONS } from "../constants.ts";
import {
  AssignmentTargetCannotReadConversationError,
  ConversationNotFoundError,
  PermissionDeniedError,
} from "../errors.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ConversationService } from "./conversation-service.ts";
import {
  assertAssignmentVisibilityCompatibility,
  buildTargetVisibilitySnapshot,
  canTargetReadConversationAfterAssignment,
  type AssignmentTargetVisibilityPort,
  type AssignmentTargetVisibilitySnapshot,
} from "./assignment-visibility-compatibility.ts";

const SALES = "dept-sales";
const SUPPORT = "dept-support";
const COMPANY = "company-1";
const OTHER_COMPANY = "company-2";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "actor-a",
    companyId: partial.companyId ?? COMPANY,
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
    departmentId: partial.departmentId,
    managedDepartmentIds: partial.managedDepartmentIds,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? COMPANY,
    conversation_number: overrides.conversation_number ?? "C-1",
    company_channel_id: overrides.company_channel_id ?? null,
    ai_assistant_id: overrides.ai_assistant_id ?? "asst-1",
    channel_type: overrides.channel_type ?? "email",
    channel_instance_id: overrides.channel_instance_id ?? null,
    state: overrides.state ?? "waiting_user",
    external_thread_id: overrides.external_thread_id ?? null,
    customer_id: overrides.customer_id ?? null,
    assigned_user_id: overrides.assigned_user_id ?? null,
    department_id: overrides.department_id ?? SALES,
    metadata: overrides.metadata ?? {},
    priority: overrides.priority ?? "normal",
    locked_by: overrides.locked_by ?? null,
    locked_at: overrides.locked_at ?? null,
    unread_count_employee: overrides.unread_count_employee ?? 0,
    unread_count_customer: overrides.unread_count_customer ?? 0,
    last_message_at: overrides.last_message_at ?? null,
    last_message_preview: overrides.last_message_preview ?? null,
    last_participant_type: overrides.last_participant_type ?? null,
    search_text: overrides.search_text ?? "",
    started_at: overrides.started_at ?? new Date().toISOString(),
    ended_at: overrides.ended_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    created_by: overrides.created_by ?? null,
    updated_by: overrides.updated_by ?? null,
    deleted_at: overrides.deleted_at ?? null,
    deleted_by: overrides.deleted_by ?? null,
  };
}

function memoryVisibilityPort(
  snapshots: Record<string, AssignmentTargetVisibilitySnapshot | null>,
): AssignmentTargetVisibilityPort {
  return {
    async loadTargetVisibilitySnapshot({ targetUserId, companyId }) {
      const snap = snapshots[targetUserId] ?? null;
      if (!snap) return null;
      if (snap.companyId !== companyId) return null;
      return snap;
    },
  };
}

function actorCanAssign(): ServiceContext {
  return ctx({
    userId: "actor-a",
    hasPermission: (p) =>
      p === CONVERSATION_PERMISSIONS.takeover || p === CONVERSATION_PERMISSIONS.view,
  });
}

describe("canTargetReadConversationAfterAssignment (pure)", () => {
  it("2. target view_all -> PASS regardless of department", () => {
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conversation({ department_id: SALES }),
        targetUserId: "t1",
        target: buildTargetVisibilitySnapshot({
          userId: "t1",
          companyId: COMPANY,
          departmentId: SUPPORT,
          permissions: [CONVERSATION_PERMISSIONS.view],
        }),
      }),
      true,
    );
  });

  it("3. target Super Admin -> PASS", () => {
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conversation({ department_id: SALES }),
        targetUserId: "sa",
        target: buildTargetVisibilitySnapshot({
          userId: "sa",
          companyId: COMPANY,
          isSuperAdmin: true,
          permissions: [],
        }),
      }),
      true,
    );
  });

  it("4/5. target view_assigned same or different department -> PASS (assigned-to-self)", () => {
    for (const dept of [SALES, SUPPORT]) {
      assert.equal(
        canTargetReadConversationAfterAssignment({
          conversation: conversation({ department_id: SALES, assigned_user_id: null }),
          targetUserId: "agent-b",
          target: buildTargetVisibilitySnapshot({
            userId: "agent-b",
            companyId: COMPANY,
            departmentId: dept,
            permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
          }),
        }),
        true,
      );
    }
  });

  it("6. target view_assigned + no department -> PASS", () => {
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conversation({ department_id: SALES }),
        targetUserId: "agent-b",
        target: buildTargetVisibilitySnapshot({
          userId: "agent-b",
          companyId: COMPANY,
          departmentId: null,
          permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
        }),
      }),
      true,
    );
  });

  it("7. target with neither view nor view_assigned -> REJECT", () => {
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conversation({ department_id: SALES }),
        targetUserId: "agent-b",
        target: buildTargetVisibilitySnapshot({
          userId: "agent-b",
          companyId: COMPANY,
          departmentId: SALES,
          permissions: [CONVERSATION_PERMISSIONS.takeover],
        }),
      }),
      false,
    );
  });

  it("10. target other company -> REJECT", () => {
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conversation({ company_id: COMPANY }),
        targetUserId: "foreign",
        target: buildTargetVisibilitySnapshot({
          userId: "foreign",
          companyId: OTHER_COMPANY,
          permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
        }),
      }),
      false,
    );
  });

  it("11. inactive target -> REJECT", () => {
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conversation(),
        targetUserId: "inactive",
        target: buildTargetVisibilitySnapshot({
          userId: "inactive",
          companyId: COMPANY,
          isActive: false,
          permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
        }),
      }),
      false,
    );
  });

  it("18. simulation never requires mutating department_id", () => {
    const conv = conversation({ department_id: SALES, assigned_user_id: null });
    assert.equal(
      canTargetReadConversationAfterAssignment({
        conversation: conv,
        targetUserId: "support-agent",
        target: buildTargetVisibilitySnapshot({
          userId: "support-agent",
          companyId: COMPANY,
          departmentId: SUPPORT,
          permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
        }),
      }),
      true,
    );
    assert.equal(conv.department_id, SALES);
    assert.equal(conv.assigned_user_id, null);
  });
});

describe("ConversationService assign + visibility compatibility", () => {
  it("1. actor readable + Governance allows + target view_assigned -> PASS", async () => {
    const port = memoryVisibilityPort({
      same: buildTargetVisibilitySnapshot({
        userId: "same",
        companyId: COMPANY,
        departmentId: SALES,
        permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
      }),
    });
    const store = createMemoryAssignmentStore();
    store.departments.set(SALES, { id: SALES, companyId: COMPANY, name: "Sales", branchId: "b1" });
    store.profiles.set("actor-a", {
      id: "actor-a",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.profiles.set("same", {
      id: "same",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.roleTemplates.set(`actor-a:${COMPANY}`, ["admin"]);
    const governance = createAssignmentGovernancePort(
      new AssignmentGovernanceService({ port: createMemoryAssignmentGovernanceDataPort(store) }),
    );

    let assigned = false;
    const service = new ConversationService(
      {
        findById: async () => conversation({ assigned_user_id: null, department_id: SALES }),
        assign: async (input) => {
          assigned = true;
          return conversation({
            assigned_user_id: input.assignedUserId,
            department_id: SALES,
          });
        },
      } as never,
      { assignmentGovernance: governance, assignmentTargetVisibility: port },
    );

    const row = await service.assignConversation(actorCanAssign(), {
      conversationId: "conv-1",
      assignedUserId: "same",
    });
    assert.equal(assigned, true);
    assert.equal(row.assigned_user_id, "same");
    assert.equal(row.department_id, SALES);
  });

  it("5. target view_assigned + different department -> PASS when Governance allows", async () => {
    const port = memoryVisibilityPort({
      "support-agent": buildTargetVisibilitySnapshot({
        userId: "support-agent",
        companyId: COMPANY,
        departmentId: SUPPORT,
        permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
      }),
    });
    const store = createMemoryAssignmentStore();
    store.departments.set(SALES, { id: SALES, companyId: COMPANY, name: "Sales", branchId: "b1" });
    store.departments.set(SUPPORT, {
      id: SUPPORT,
      companyId: COMPANY,
      name: "Support",
      branchId: "b1",
    });
    store.profiles.set("actor-a", {
      id: "actor-a",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.profiles.set("support-agent", {
      id: "support-agent",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SUPPORT,
    });
    store.roleTemplates.set(`actor-a:${COMPANY}`, ["admin"]);
    const governance = createAssignmentGovernancePort(
      new AssignmentGovernanceService({ port: createMemoryAssignmentGovernanceDataPort(store) }),
    );

    const service = new ConversationService(
      {
        findById: async () => conversation({ department_id: SALES }),
        assign: async (input) =>
          conversation({ assigned_user_id: input.assignedUserId, department_id: SALES }),
      } as never,
      { assignmentGovernance: governance, assignmentTargetVisibility: port },
    );

    const row = await service.assignConversation(actorCanAssign(), {
      conversationId: "conv-1",
      assignedUserId: "support-agent",
    });
    assert.equal(row.assigned_user_id, "support-agent");
    assert.equal(row.department_id, SALES);
  });

  it("7. target neither view nor view_assigned -> REJECT; no mutation; no audit; no ticket sync", async () => {
    const port = memoryVisibilityPort({
      bare: buildTargetVisibilitySnapshot({
        userId: "bare",
        companyId: COMPANY,
        departmentId: SALES,
        permissions: [],
      }),
    });
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
    let syncCalled = false;
    let auditCalled = false;
    const service = new ConversationService(
      {
        findById: async () => conversation({ channel_type: "email", department_id: SALES }),
        assign: async () => {
          assignCalled = true;
          return conversation({ assigned_user_id: "bare" });
        },
      } as never,
      {
        assignmentGovernance: governance,
        assignmentTargetVisibility: port,
        linkedTicketAssignmentSync: {
          async syncAssignee() {
            syncCalled = true;
          },
        },
        assignmentAudit: {
          async recordAssignmentChange() {
            auditCalled = true;
          },
          async listHistory() {
            return [];
          },
        },
      },
    );

    await assert.rejects(
      () =>
        service.assignConversation(actorCanAssign(), {
          conversationId: "conv-1",
          assignedUserId: "bare",
        }),
      AssignmentTargetCannotReadConversationError,
    );
    assert.equal(assignCalled, false);
    assert.equal(syncCalled, false);
    assert.equal(auditCalled, false);
  });

  it("8. actor cannot read conversation -> REJECT", async () => {
    const service = new ConversationService(
      {
        findById: async () => conversation({ assigned_user_id: "other-agent", department_id: SALES }),
        assign: async () => {
          throw new Error("assign must not run");
        },
      } as never,
      {
        assignmentTargetVisibility: memoryVisibilityPort({
          same: buildTargetVisibilitySnapshot({
            userId: "same",
            companyId: COMPANY,
            permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
          }),
        }),
      },
    );

    await assert.rejects(
      () =>
        service.assignConversation(
          ctx({
            userId: "actor-a",
            departmentId: SALES,
            hasPermission: (p) =>
              p === CONVERSATION_PERMISSIONS.takeover || p === CONVERSATION_PERMISSIONS.viewAssigned,
          }),
          { conversationId: "conv-1", assignedUserId: "same" },
        ),
      ConversationNotFoundError,
    );
  });

  it("9. Governance rejects -> REJECT before visibility / mutation", async () => {
    const store = createMemoryAssignmentStore();
    store.departments.set(SALES, { id: SALES, companyId: COMPANY, name: "Sales", branchId: "b1" });
    store.departments.set(SUPPORT, {
      id: SUPPORT,
      companyId: COMPANY,
      name: "Support",
      branchId: "b1",
    });
    store.profiles.set("actor-a", {
      id: "actor-a",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.profiles.set("other-dept", {
      id: "other-dept",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SUPPORT,
    });
    store.roleTemplates.set(`actor-a:${COMPANY}`, ["human_handoff_agent"]);
    const governance = createAssignmentGovernancePort(
      new AssignmentGovernanceService({ port: createMemoryAssignmentGovernanceDataPort(store) }),
    );

    let visibilityLoaded = false;
    const service = new ConversationService(
      {
        findById: async () => conversation({ department_id: SALES }),
        assign: async () => {
          throw new Error("assign must not run");
        },
      } as never,
      {
        assignmentGovernance: governance,
        assignmentTargetVisibility: {
          async loadTargetVisibilitySnapshot() {
            visibilityLoaded = true;
            return buildTargetVisibilitySnapshot({
              userId: "other-dept",
              companyId: COMPANY,
              permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
            });
          },
        },
      },
    );

    await assert.rejects(
      () =>
        service.assignConversation(actorCanAssign(), {
          conversationId: "conv-1",
          assignedUserId: "other-dept",
        }),
      PermissionDeniedError,
    );
    assert.equal(visibilityLoaded, false);
  });

  it("12. cross-company conversation -> REJECT for actor", async () => {
    const service = new ConversationService(
      {
        findById: async () => conversation({ company_id: OTHER_COMPANY }),
        assign: async () => {
          throw new Error("assign must not run");
        },
      } as never,
      {
        assignmentTargetVisibility: memoryVisibilityPort({}),
      },
    );

    await assert.rejects(
      () =>
        service.assignConversation(actorCanAssign(), {
          conversationId: "conv-1",
          assignedUserId: "same",
        }),
      PermissionDeniedError,
    );
  });

  it("15/16. successful assignment records audit and syncs ticket; department unchanged", async () => {
    const port = memoryVisibilityPort({
      same: buildTargetVisibilitySnapshot({
        userId: "same",
        companyId: COMPANY,
        permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
      }),
    });
    const store = createMemoryAssignmentStore();
    store.departments.set(SALES, { id: SALES, companyId: COMPANY, name: "Sales", branchId: "b1" });
    store.profiles.set("actor-a", {
      id: "actor-a",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.profiles.set("same", {
      id: "same",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.roleTemplates.set(`actor-a:${COMPANY}`, ["admin"]);
    const governance = createAssignmentGovernancePort(
      new AssignmentGovernanceService({ port: createMemoryAssignmentGovernanceDataPort(store) }),
    );

    const audits: unknown[] = [];
    const syncs: unknown[] = [];
    const service = new ConversationService(
      {
        findById: async () =>
          conversation({ channel_type: "email", department_id: SALES, assigned_user_id: null }),
        assign: async (input) =>
          conversation({
            channel_type: "email",
            assigned_user_id: input.assignedUserId,
            department_id: SALES,
          }),
      } as never,
      {
        assignmentGovernance: governance,
        assignmentTargetVisibility: port,
        linkedTicketAssignmentSync: {
          async syncAssignee(input) {
            syncs.push(input);
          },
        },
        assignmentAudit: {
          async recordAssignmentChange(input) {
            audits.push(input);
          },
          async listHistory() {
            return [];
          },
        },
      },
    );

    const row = await service.assignConversation(actorCanAssign(), {
      conversationId: "conv-1",
      assignedUserId: "same",
    });
    assert.equal(row.department_id, SALES);
    assert.equal(audits.length, 1);
    assert.equal(syncs.length, 1);
  });

  it("19. reassignment to another valid view_assigned target -> PASS", async () => {
    const port = memoryVisibilityPort({
      "agent-c": buildTargetVisibilitySnapshot({
        userId: "agent-c",
        companyId: COMPANY,
        departmentId: SUPPORT,
        permissions: [CONVERSATION_PERMISSIONS.viewAssigned],
      }),
    });
    const store = createMemoryAssignmentStore();
    store.departments.set(SALES, { id: SALES, companyId: COMPANY, name: "Sales", branchId: "b1" });
    store.departments.set(SUPPORT, {
      id: SUPPORT,
      companyId: COMPANY,
      name: "Support",
      branchId: "b1",
    });
    store.profiles.set("actor-a", {
      id: "actor-a",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SALES,
    });
    store.profiles.set("agent-c", {
      id: "agent-c",
      companyId: COMPANY,
      isActive: true,
      isSuperAdmin: false,
      departmentId: SUPPORT,
    });
    store.roleTemplates.set(`actor-a:${COMPANY}`, ["admin"]);
    const governance = createAssignmentGovernancePort(
      new AssignmentGovernanceService({ port: createMemoryAssignmentGovernanceDataPort(store) }),
    );

    const service = new ConversationService(
      {
        findById: async () =>
          conversation({ assigned_user_id: "agent-b", department_id: SALES }),
        assign: async (input) =>
          conversation({ assigned_user_id: input.assignedUserId, department_id: SALES }),
      } as never,
      { assignmentGovernance: governance, assignmentTargetVisibility: port },
    );

    const row = await service.assignConversation(actorCanAssign(), {
      conversationId: "conv-1",
      assignedUserId: "agent-c",
    });
    assert.equal(row.assigned_user_id, "agent-c");
    assert.equal(row.department_id, SALES);
  });

  it("21. public skipAssignmentGovernance spoof no longer bypasses visibility", async () => {
    let visibilityLoaded = false;
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => {
          throw new Error("assign must not run when compatibility rejects");
        },
      } as never,
      {
        assignmentTargetVisibility: {
          async loadTargetVisibilitySnapshot() {
            visibilityLoaded = true;
            return buildTargetVisibilitySnapshot({
              userId: "ai-target",
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
          assignedUserId: "ai-target",
          skipAssignmentGovernance: true,
        }),
      AssignmentTargetCannotReadConversationError,
    );
    assert.equal(visibilityLoaded, true);
  });

  it("21b. trusted assignConversationInternal may skip visibility", async () => {
    const { ASSIGNMENT_INTERNAL_TRUST } = await import("../types.ts");
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
    });
    assert.equal(row.assigned_user_id, "ai-target");
    assert.equal(visibilityLoaded, false);
  });

  it("20. releaseConversation path unchanged (no visibility port required)", async () => {
    const service = new ConversationService({
      findById: async () => conversation({ assigned_user_id: "agent-b" }),
      release: async () => conversation({ assigned_user_id: null, department_id: SALES }),
    } as never);

    const row = await service.releaseConversation(
      ctx({
        hasPermission: (p) =>
          p === CONVERSATION_PERMISSIONS.release || p === CONVERSATION_PERMISSIONS.view,
      }),
      { conversationId: "conv-1" },
    );
    assert.equal(row.assigned_user_id, null);
    assert.equal(row.department_id, SALES);
  });
});

describe("assertAssignmentVisibilityCompatibility", () => {
  it("throws dedicated error without leaking permission details", async () => {
    await assert.rejects(
      () =>
        assertAssignmentVisibilityCompatibility({
          conversation: conversation(),
          targetUserId: "bare",
          companyId: COMPANY,
          port: memoryVisibilityPort({
            bare: buildTargetVisibilitySnapshot({
              userId: "bare",
              companyId: COMPANY,
              permissions: [],
            }),
          }),
        }),
      (err: unknown) =>
        err instanceof AssignmentTargetCannotReadConversationError &&
        err.code === "ASSIGNMENT_TARGET_CANNOT_READ_CONVERSATION" &&
        !/view_assigned/i.test(err.message) &&
        !/permission/i.test(err.message),
    );
  });
});
