/**
 * Ticket / Lead / Handoff Assignment Governance integration (Phase 3).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "@workspace/assignment-governance";
import { TicketCommandService } from "../services/ticket-command-service.ts";
import { TicketPermissionDeniedError } from "../errors.ts";

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
  return createAssignmentGovernancePort(
    new AssignmentGovernanceService({
      port: createMemoryAssignmentGovernanceDataPort(store),
    }),
  );
}

describe("TicketCommandService assignment governance", () => {
  it("20. unauthorized ticket assignment -> denied", async () => {
    const service = new TicketCommandService({
      tickets: {
        async findById() {
          return {
            id: "t1",
            companyId: "company-1",
            ticketNumber: "TK-1",
            subject: "x",
            description: null,
            status: "open",
            priority: "normal",
            conversationId: null,
            customerId: null,
            assignedUserId: null,
            assignedUserName: null,
            createdBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            closedAt: null,
            slaDueAt: null,
            metadata: {},
          } as never;
        },
        async update() {
          throw new Error("update must not run");
        },
      } as never,
      comments: {} as never,
      assignees: {
        async resolveAssigneeUserId() {
          return "other";
        },
        async loadAssigneeNames() {
          return new Map();
        },
        async findAssigneeCandidates() {
          return [];
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
    });

    await assert.rejects(
      () =>
        service.assignTicket(
          {
            companyId: "company-1",
            userId: "agent",
            isSuperAdmin: false,
            hasPermission: (code) => code === "tickets.assign",
          },
          { companyId: "company-1", ticketId: "t1", assigneeUserId: "other" },
        ),
      TicketPermissionDeniedError,
    );
  });

  it("allowed same-department ticket assignment succeeds", async () => {
    let wrote: string | null = null;
    const service = new TicketCommandService({
      tickets: {
        async findById() {
          return {
            id: "t1",
            companyId: "company-1",
            ticketNumber: "TK-1",
            subject: "x",
            description: null,
            status: "open",
            priority: "normal",
            conversationId: null,
            customerId: null,
            assignedUserId: null,
            assignedUserName: null,
            createdBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            closedAt: null,
            slaDueAt: null,
            metadata: {},
          } as never;
        },
        async update(input: { assignedUserId?: string | null }) {
          wrote = input.assignedUserId ?? null;
          return {
            id: "t1",
            companyId: "company-1",
            ticketNumber: "TK-1",
            subject: "x",
            description: null,
            status: "in_progress",
            priority: "normal",
            conversationId: null,
            customerId: null,
            assignedUserId: wrote,
            assignedUserName: null,
            createdBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            closedAt: null,
            slaDueAt: null,
            metadata: {},
          } as never;
        },
      } as never,
      comments: {} as never,
      assignees: {
        async resolveAssigneeUserId() {
          return "same";
        },
        async loadAssigneeNames() {
          return new Map([["same", "Same"]]);
        },
        async findAssigneeCandidates() {
          return [];
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
    });

    const result = await service.assignTicket(
      {
        companyId: "company-1",
        userId: "agent",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tickets.assign",
      },
      { companyId: "company-1", ticketId: "t1", assigneeUserId: "same" },
    );
    assert.equal(result.ticket.assignedUserId, "same");
    assert.equal(wrote, "same");
  });
});

describe("TicketCommandService assignment audit (Phase 5)", () => {
  it("9+15. ticket assignment audited; AI source preserved", async () => {
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
    const service = new TicketCommandService({
      tickets: {
        async findById() {
          return {
            id: "t1",
            companyId: "company-1",
            ticketNumber: "T-1",
            subject: "Test",
            description: "",
            priority: "normal",
            status: "open",
            assignedUserId: null,
            customerId: null,
            conversationId: null,
            metadata: {},
          } as never;
        },
        async update(input) {
          return {
            id: "t1",
            companyId: "company-1",
            ticketNumber: "T-1",
            subject: "Test",
            description: "",
            priority: "normal",
            status: "in_progress",
            assignedUserId: input.assignedUserId ?? null,
            customerId: null,
            conversationId: null,
            metadata: {},
          } as never;
        },
      } as never,
      comments: {} as never,
      assignees: {
        async resolveAssigneeUserId() {
          return "same";
        },
        async loadAssigneeNames() {
          return new Map([["same", "Same"]]);
        },
        async findAssigneeCandidates() {
          return [];
        },
      },
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
      assignmentAudit,
    });

    await service.assignTicket(
      {
        companyId: "company-1",
        userId: "agent",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tickets.assign",
      },
      {
        companyId: "company-1",
        ticketId: "t1",
        assigneeUserId: "same",
        assignmentAuditSource: "ai",
      },
    );

    assert.equal(auditStore.events.length, 1);
    assert.equal(auditStore.events[0]?.resourceType, "ticket");
    assert.equal(auditStore.events[0]?.source, "ai");
  });
});
