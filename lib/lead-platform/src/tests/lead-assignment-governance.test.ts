import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssignmentGovernanceService,
  createAssignmentGovernancePort,
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "@workspace/assignment-governance";
import { LeadCommandService } from "../services/lead-command-service.ts";
import { LeadPermissionDeniedError } from "../errors.ts";

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
  store.profiles.set("same", {
    id: "same",
    companyId: "company-1",
    isActive: true,
    isSuperAdmin: false,
    departmentId: "dept-a",
  });
  store.roleTemplates.set("agent:company-1", ["human_handoff_agent"]);
  return createAssignmentGovernancePort(
    new AssignmentGovernanceService({
      port: createMemoryAssignmentGovernanceDataPort(store),
    }),
  );
}

describe("LeadCommandService assignment governance", () => {
  it("21. unauthorized lead assignment -> denied", async () => {
    const service = new LeadCommandService({
      leads: {
        async getLead() {
          return {
            id: "lead-1",
            companyId: "company-1",
            assignedUserId: null,
            isVip: false,
            territory: null,
            department: null,
            language: null,
          } as never;
        },
        async createAssignment() {
          throw new Error("must not assign");
        },
        async updateLead() {
          throw new Error("must not update");
        },
      } as never,
      assignees: {
        async listAssigneeCandidates() {
          return [];
        },
      } as never,
      conversion: {} as never,
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
    });

    await assert.rejects(
      () =>
        service.assignLead(
          {
            companyId: "company-1",
            userId: "agent",
            isSuperAdmin: false,
            hasPermission: (code) => code === "leads.assign",
          },
          { companyId: "company-1", leadId: "lead-1", assigneeUserId: "other" },
        ),
      LeadPermissionDeniedError,
    );
  });
});

describe("LeadCommandService assignment audit (Phase 5)", () => {
  it("11. lead assignment audited", async () => {
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
    const service = new LeadCommandService({
      leads: {
        async getLead() {
          return {
            id: "lead-1",
            companyId: "company-1",
            assignedUserId: null,
            territory: null,
            department: null,
            language: null,
            isVip: false,
          } as never;
        },
        async createAssignment() {},
        async updateLead() {
          return {
            id: "lead-1",
            companyId: "company-1",
            assignedUserId: "same",
          } as never;
        },
        async appendHistory() {},
      } as never,
      assignees: {
        async listAssigneeCandidates() {
          return [];
        },
      } as never,
      conversion: {} as never,
      events: { async publish() {} },
      notifications: { async notify() {} },
      audit: { async write() {} },
      assignmentGovernance: buildGovernancePort(),
      assignmentAudit,
    });

    await service.assignLead(
      {
        companyId: "company-1",
        userId: "agent",
        isSuperAdmin: false,
        hasPermission: (code) => code === "leads.assign",
      },
      { companyId: "company-1", leadId: "lead-1", assigneeUserId: "same" },
    );

    assert.equal(auditStore.events.length, 1);
    assert.equal(auditStore.events[0]?.resourceType, "lead");
    assert.equal(auditStore.events[0]?.source, "human");
  });
});
