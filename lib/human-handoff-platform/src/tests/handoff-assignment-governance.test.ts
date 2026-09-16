import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "@workspace/assignment-governance";
import { HandoffPermissionDeniedError } from "../errors.ts";
import { HandoffCommandService } from "../services/handoff-command-service.ts";
import type { HandoffConversationPort } from "../ports/handoff-platform-ports.ts";

function buildGovernancePort() {
  const store = createMemoryAssignmentStore();
  store.departments.set("dept-a", {
    id: "dept-a",
    companyId: "company-1",
    name: "Support",
    branchId: null,
  });
  store.departments.set("dept-b", {
    id: "dept-b",
    companyId: "company-1",
    name: "Billing",
    branchId: null,
  });
  store.profiles.set("agent", {
    id: "agent",
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
  return createAssignmentGovernancePort(
    new AssignmentGovernanceService({
      port: createMemoryAssignmentGovernanceDataPort(store),
    }),
  );
}

describe("HandoffCommandService assignment governance", () => {
  it("23. handoff bypass cannot circumvent governance on human assign", async () => {
    const conversations: HandoffConversationPort = {
      async assignConversation() {
        throw new Error("conversation assign must not run");
      },
      async releaseConversation() {},
      async closeConversation() {},
      async updateMetadata() {},
      async getConversation() {
        return {
          id: "conv-1",
          companyId: "company-1",
          aiAssistantId: "ai-1",
          assignedUserId: null,
          customerId: null,
          state: "open",
          metadata: {},
          channelType: "web",
          priority: "normal",
        };
      },
    };

    const service = new HandoffCommandService({
      handoff: {
        async getOwnership() {
          return {
            id: "own-1",
            companyId: "company-1",
            conversationId: "conv-1",
            ownerType: "ai_assistant",
            ownerId: "ai-1",
            ownerLabel: "AI",
            assignedUserId: null,
            queueId: null,
            lifecycleState: "AI_OWNED",
            aiAssistantId: "ai-1",
            isPaused: false,
            pausedReason: null,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as never;
        },
        async transitionOwnership() {
          throw new Error("must not transition");
        },
      } as never,
      conversations,
      context: { async buildContext() {
        return {
          summary: "",
          suggestedResolution: "",
          suggestedReply: "",
          payload: {},
          openTickets: [],
          appointments: [],
        };
      } },
      agents: {
        async resolveAgentLabel(id) {
          return id;
        },
        async loadAgentLabels(ids) {
          return new Map(ids.map((id) => [id, id]));
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
    });

    await assert.rejects(
      () =>
        service.assignConversation(
          {
            companyId: "company-1",
            userId: "agent",
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          {
            companyId: "company-1",
            conversationId: "conv-1",
            assigneeUserId: "other",
          },
        ),
      HandoffPermissionDeniedError,
    );
  });

  it("queue skip flag still allows auto-routing assignment", async () => {
    let assigned: string | null = null;
    const service = new HandoffCommandService({
      handoff: {
        async getOwnership() {
          return {
            id: "own-1",
            companyId: "company-1",
            conversationId: "conv-1",
            ownerType: "ai_assistant",
            ownerId: "ai-1",
            ownerLabel: "AI",
            assignedUserId: null,
            queueId: null,
            lifecycleState: "AI_OWNED",
            aiAssistantId: "ai-1",
            isPaused: false,
            pausedReason: null,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as never;
        },
        async upsertOwnership(input: { assignedUserId: string | null; ownerId: string | null }) {
          return {
            id: "own-2",
            companyId: "company-1",
            conversationId: "conv-1",
            ownerType: "human_agent",
            ownerId: input.ownerId,
            ownerLabel: input.ownerId,
            assignedUserId: input.assignedUserId,
            queueId: null,
            lifecycleState: "ASSIGNED",
            aiAssistantId: "ai-1",
            isPaused: false,
            pausedReason: null,
            version: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as never;
        },
        async appendOwnershipHistory() {
          return { id: "hist-1" } as never;
        },
      } as never,
      conversations: {
        async assignConversation(input) {
          assigned = input.assignedUserId;
          assert.equal(input.skipAssignmentGovernance, true);
        },
        async releaseConversation() {},
        async closeConversation() {},
        async updateMetadata() {},
        async getConversation() {
          return {
            id: "conv-1",
            companyId: "company-1",
            aiAssistantId: "ai-1",
            assignedUserId: null,
            customerId: null,
            state: "open",
            metadata: {},
            channelType: "web",
            priority: "normal",
          };
        },
      },
      context: {
        async buildContext() {
          return {
            summary: "",
            suggestedResolution: "",
            suggestedReply: "",
            payload: {},
            openTickets: [],
            appointments: [],
          };
        },
      },
      agents: {
        async resolveAgentLabel(id) {
          return id;
        },
        async loadAgentLabels(ids) {
          return new Map(ids.map((id) => [id, id]));
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
    });

    await service.assignConversation(
      {
        companyId: "company-1",
        userId: "agent",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      {
        companyId: "company-1",
        conversationId: "conv-1",
        assigneeUserId: "other",
        skipAssignmentGovernance: true,
        trustedSystemExecution: true,
      },
    );
    assert.equal(assigned, "other");
  });

  it("client spoof skip/AI id without trustedSystemExecution still runs governance", async () => {
    const service = new HandoffCommandService({
      handoff: {
        async getOwnership() {
          return {
            id: "own-1",
            companyId: "company-1",
            conversationId: "conv-1",
            ownerType: "ai_assistant",
            ownerId: "ai-1",
            ownerLabel: "AI",
            assignedUserId: null,
            queueId: null,
            lifecycleState: "AI_OWNED",
            aiAssistantId: "ai-1",
            isPaused: false,
            pausedReason: null,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as never;
        },
        async upsertOwnership() {
          throw new Error("must not mutate when governance rejects");
        },
        async appendOwnershipHistory() {
          return { id: "hist-1" } as never;
        },
      } as never,
      conversations: {
        async assignConversation() {
          throw new Error("must not assign when governance rejects");
        },
        async releaseConversation() {},
        async closeConversation() {},
        async updateMetadata() {},
        async getConversation() {
          return {
            id: "conv-1",
            companyId: "company-1",
            aiAssistantId: "ai-1",
            assignedUserId: null,
            customerId: null,
            state: "open",
            metadata: {},
            channelType: "web",
            priority: "normal",
          };
        },
      },
      context: {
        async buildContext() {
          return {
            summary: "",
            suggestedResolution: "",
            suggestedReply: "",
            payload: {},
            openTickets: [],
            appointments: [],
          };
        },
      },
      agents: {
        async resolveAgentLabel(id) {
          return id;
        },
        async loadAgentLabels(ids) {
          return new Map(ids.map((id) => [id, id]));
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
    });

    await assert.rejects(
      () =>
        service.assignConversation(
          {
            companyId: "company-1",
            userId: "agent",
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          {
            companyId: "company-1",
            conversationId: "conv-1",
            assigneeUserId: "other",
            skipAssignmentGovernance: true,
            requestedByAiAssistantId: "00000000-0000-4000-8000-000000000001",
          },
        ),
      HandoffPermissionDeniedError,
    );
  });
});
