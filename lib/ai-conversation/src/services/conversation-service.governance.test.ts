/**
 * ConversationService + Assignment Governance integration (Phase 3).
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
import { PermissionDeniedError } from "../errors.ts";
import type { ConversationRecord, ServiceContext } from "../types.ts";
import { ConversationService } from "./conversation-service.ts";

function ctx(partial: Partial<ServiceContext> & Pick<ServiceContext, "hasPermission">): ServiceContext {
  return {
    userId: partial.userId ?? "agent",
    companyId: partial.companyId ?? "company-1",
    isSuperAdmin: partial.isSuperAdmin ?? false,
    hasPermission: partial.hasPermission,
  };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: overrides.id ?? "conv-1",
    company_id: overrides.company_id ?? "company-1",
    conversation_number: overrides.conversation_number ?? "C-1",
    company_channel_id: overrides.company_channel_id ?? null,
    ai_assistant_id: overrides.ai_assistant_id ?? "asst-1",
    channel_type: overrides.channel_type ?? "email",
    channel_instance_id: overrides.channel_instance_id ?? null,
    state: overrides.state ?? "waiting_user",
    external_thread_id: overrides.external_thread_id ?? null,
    customer_id: overrides.customer_id ?? null,
    assigned_user_id: overrides.assigned_user_id ?? null,
    department_id: overrides.department_id ?? null,
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

function buildGovernance() {
  const store = createMemoryAssignmentStore();
  store.departments.set("dept-a", {
    id: "dept-a",
    companyId: "company-1",
    name: "Support",
    branchId: "b1",
  });
  store.departments.set("dept-b", {
    id: "dept-b",
    companyId: "company-1",
    name: "Billing",
    branchId: "b1",
  });
  store.profiles.set("agent", {
    id: "agent",
    companyId: "company-1",
    isActive: true,
    isSuperAdmin: false,
    departmentId: "dept-a",
  });
  store.profiles.set("same", {
    id: "same",
    companyId: "company-1",
    isActive: true,
    isSuperAdmin: false,
    departmentId: "dept-a",
  });
  store.profiles.set("other", {
    id: "other",
    companyId: "company-1",
    isActive: true,
    isSuperAdmin: false,
    departmentId: "dept-b",
  });
  store.roleTemplates.set("agent:company-1", ["human_handoff_agent"]);
  const service = new AssignmentGovernanceService({
    port: createMemoryAssignmentGovernanceDataPort(store),
  });
  return createAssignmentGovernancePort(service);
}

describe("ConversationService assignment governance", () => {
  it("19. unauthorized conversation assignment -> denied", async () => {
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => conversation({ assigned_user_id: "other" }),
      } as never,
      { assignmentGovernance: buildGovernance() },
    );

    await assert.rejects(
      () =>
        service.assignConversation(
          ctx({
            hasPermission: (p) =>
              p === CONVERSATION_PERMISSIONS.takeover || p === CONVERSATION_PERMISSIONS.view,
          }),
          { conversationId: "conv-1", assignedUserId: "other", state: "waiting_user" },
        ),
      PermissionDeniedError,
    );
  });

  it("24-25. email assignment allowed + syncs linked ticket when present", async () => {
    const syncCalls: unknown[] = [];
    const service = new ConversationService(
      {
        findById: async () => conversation({ channel_type: "email" }),
        assign: async () => conversation({ assigned_user_id: "same", channel_type: "email" }),
      } as never,
      {
        assignmentGovernance: buildGovernance(),
        linkedTicketAssignmentSync: {
          async syncAssignee(input) {
            syncCalls.push(input);
          },
        },
      },
    );

    const row = await service.assignConversation(
      ctx({
        hasPermission: (p) =>
          p === CONVERSATION_PERMISSIONS.takeover || p === CONVERSATION_PERMISSIONS.view,
      }),
      { conversationId: "conv-1", assignedUserId: "same", state: "waiting_user" },
    );
    assert.equal(row.assigned_user_id, "same");
    assert.deepEqual(syncCalls, [
      {
        companyId: "company-1",
        conversationId: "conv-1",
        assignedUserId: "same",
        actorUserId: "agent",
      },
    ]);
  });

  it("26. manually submitting unauthorized target_user_id is rejected", async () => {
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => {
          throw new Error("assign must not be called");
        },
      } as never,
      { assignmentGovernance: buildGovernance() },
    );

    await assert.rejects(
      () =>
        service.assignConversation(
          ctx({
            hasPermission: () => true,
          }),
          { conversationId: "conv-1", assignedUserId: "other" },
        ),
      PermissionDeniedError,
    );
  });

  it("queue/AI skip flag bypasses governance only via trusted internal path", async () => {
    const { ASSIGNMENT_INTERNAL_TRUST } = await import("../types.ts");
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => conversation({ assigned_user_id: "other" }),
      } as never,
      { assignmentGovernance: buildGovernance() },
    );

    const row = await service.assignConversationInternal(
      ctx({ hasPermission: () => true }),
      {
        conversationId: "conv-1",
        assignedUserId: "other",
        skipAssignmentGovernance: true,
        internalTrust: ASSIGNMENT_INTERNAL_TRUST,
      },
    );
    assert.equal(row.assigned_user_id, "other");
  });
});

describe("ConversationService assignment audit (Phase 5)", () => {
  it("7-8. conversation/email assignment audited; linked ticket sync does not duplicate ticket audit", async () => {
    const {
      AssignmentAuditService,
      createAssignmentAuditPort,
      createMemoryAssignmentAuditDataPort,
      createMemoryAssignmentAuditStore,
    } = await import("@workspace/assignment-audit");
    const auditStore = createMemoryAssignmentAuditStore();
    const assignmentAudit = createAssignmentAuditPort(
      new AssignmentAuditService({ port: createMemoryAssignmentAuditDataPort(auditStore) }),
    );
    let syncCalls = 0;
    let current = conversation({ assigned_user_id: null, channel_type: "email" });
    const service = new ConversationService(
      {
        findById: async () => current,
        assign: async (input: { assignedUserId: string }) => {
          current = conversation({ ...current, assigned_user_id: input.assignedUserId });
          return current;
        },
      } as never,
      {
        assignmentAudit,
        linkedTicketAssignmentSync: {
          async syncAssignee() {
            syncCalls += 1;
          },
        },
      },
    );

    await service.assignConversation(ctx({ hasPermission: () => true }), {
      conversationId: "conv-1",
      assignedUserId: "same",
    });

    assert.equal(syncCalls, 1);
    assert.equal(auditStore.events.length, 1);
    assert.equal(auditStore.events[0]?.resourceType, "email_conversation");
    assert.equal(auditStore.events[0]?.source, "human");
  });

  it("6. failed assignment creates no audit event", async () => {
    const {
      AssignmentAuditService,
      createAssignmentAuditPort,
      createMemoryAssignmentAuditDataPort,
      createMemoryAssignmentAuditStore,
    } = await import("@workspace/assignment-audit");
    const auditStore = createMemoryAssignmentAuditStore();
    const assignmentAudit = createAssignmentAuditPort(
      new AssignmentAuditService({ port: createMemoryAssignmentAuditDataPort(auditStore) }),
    );
    const service = new ConversationService(
      {
        findById: async () => conversation(),
        assign: async () => {
          throw new Error("assign failed");
        },
      } as never,
      { assignmentAudit },
    );

    await assert.rejects(() =>
      service.assignConversation(ctx({ hasPermission: () => true }), {
        conversationId: "conv-1",
        assignedUserId: "same",
      }),
    );
    assert.equal(auditStore.events.length, 0);
  });

  it("13. handoff source is preserved", async () => {
    const {
      AssignmentAuditService,
      createAssignmentAuditPort,
      createMemoryAssignmentAuditDataPort,
      createMemoryAssignmentAuditStore,
    } = await import("@workspace/assignment-audit");
    const auditStore = createMemoryAssignmentAuditStore();
    const assignmentAudit = createAssignmentAuditPort(
      new AssignmentAuditService({ port: createMemoryAssignmentAuditDataPort(auditStore) }),
    );
    const service = new ConversationService(
      {
        findById: async () => conversation({ channel_type: "whatsapp" }),
        assign: async (input: { assignedUserId: string }) =>
          conversation({ assigned_user_id: input.assignedUserId, channel_type: "whatsapp" }),
      } as never,
      { assignmentAudit },
    );

    await service.assignConversation(ctx({ hasPermission: () => true }), {
      conversationId: "conv-1",
      assignedUserId: "same",
      assignmentAuditSource: "handoff",
    });
    assert.equal(auditStore.events[0]?.source, "handoff");
  });
});
