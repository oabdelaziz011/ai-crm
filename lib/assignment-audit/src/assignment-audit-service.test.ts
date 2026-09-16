/**
 * Phase 5 — AssignmentAuditService unit tests (no cross-package imports).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssignmentAuditCompanyScopeError } from "./errors.js";
import { AssignmentAuditService } from "./assignment-audit-service.js";
import {
  createMemoryAssignmentAuditDataPort,
  createMemoryAssignmentAuditStore,
} from "./memory-assignment-audit-data-port.js";
import { resolveAssignmentAction } from "./resolve-assignment-action.js";

describe("AssignmentAuditService core", () => {
  it("1. assign creates audit event", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "target",
      source: "human",
    });
    assert.ok(event);
    assert.equal(event?.action, "assigned");
  });

  it("2. reassign creates audit event", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: "a",
      newAssigneeUserId: "b",
      source: "human",
    });
    assert.equal(event?.action, "reassigned");
  });

  it("3. unassign creates audit event", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: "a",
      newAssigneeUserId: null,
      source: "human",
    });
    assert.equal(event?.action, "unassigned");
  });

  it("4. old/new assignee recorded correctly", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "lead",
      resourceId: "lead-1",
      previousAssigneeUserId: "old",
      newAssigneeUserId: "new",
      source: "human",
    });
    assert.equal(event?.previousAssigneeUserId, "old");
    assert.equal(event?.newAssigneeUserId, "new");
  });

  it("5. same assignee creates no event", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: "same",
      newAssigneeUserId: "same",
      source: "human",
    });
    assert.equal(event, null);
    assert.equal(store.events.length, 0);
  });

  it("resolveAssignmentAction handles whitespace assignees", () => {
    assert.equal(resolveAssignmentAction("  ", "target"), "assigned");
    assert.equal(resolveAssignmentAction("target", "  "), "unassigned");
  });

  it("21. history newest-first with pagination", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "a",
      source: "human",
    });
    store.events[0] = { ...store.events[0]!, createdAt: "2026-01-01T00:00:00.000Z" };
    await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: "a",
      newAssigneeUserId: "b",
      source: "human",
    });
    store.events[1] = { ...store.events[1]!, createdAt: "2026-01-02T00:00:00.000Z" };

    const page = await service.getAssignmentHistory({
      companyId: "company-1",
      resourceType: "ticket",
      resourceId: "ticket-1",
      limit: 1,
      offset: 0,
    });
    assert.equal(page.length, 1);
    assert.equal(page[0]?.action, "reassigned");
  });

  it("22. pagination offset works", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "a",
      source: "human",
    });
    store.events[0] = { ...store.events[0]!, createdAt: "2026-01-01T00:00:00.000Z" };
    await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: "a",
      newAssigneeUserId: "b",
      source: "human",
    });
    store.events[1] = { ...store.events[1]!, createdAt: "2026-01-02T00:00:00.000Z" };

    const page = await service.getAssignmentHistory({
      companyId: "company-1",
      resourceType: "ticket",
      resourceId: "ticket-1",
      limit: 1,
      offset: 1,
    });
    assert.equal(page.length, 1);
    assert.equal(page[0]?.action, "assigned");
  });

  it("20. audit records are append-only in memory port", () => {
    const port = createMemoryAssignmentAuditDataPort(createMemoryAssignmentAuditStore());
    assert.equal(typeof port.insertEvent, "function");
    assert.equal((port as { updateEvent?: unknown }).updateEvent, undefined);
    assert.equal((port as { deleteEvent?: unknown }).deleteEvent, undefined);
  });

  it("18. cross-company event insertion rejected", async () => {
    const store = createMemoryAssignmentAuditStore();
    store.profileCompanies.set("agent", "company-1");
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    await assert.rejects(
      () =>
        service.recordAssignmentChange({
          companyId: "company-2",
          actorUserId: "agent",
          resourceType: "ticket",
          resourceId: "ticket-1",
          previousAssigneeUserId: null,
          newAssigneeUserId: "target",
          source: "human",
        }),
      AssignmentAuditCompanyScopeError,
    );
  });

  it("19+23. cross-company history read is company scoped", async () => {
    const store = createMemoryAssignmentAuditStore();
    const port = createMemoryAssignmentAuditDataPort(store);
    const service = new AssignmentAuditService({ port });
    await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "a",
      source: "human",
    });
    const otherCompany = await service.getAssignmentHistory({
      companyId: "company-2",
      resourceType: "ticket",
      resourceId: "ticket-1",
    });
    assert.equal(otherCompany.length, 0);
  });

  it("12. task assignment action resolution", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "task",
      resourceId: "task-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "worker",
      source: "human",
    });
    assert.equal(event?.resourceType, "task");
    assert.equal(event?.action, "assigned");
  });

  it("15. AI source recorded when provided", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "system-actor",
      resourceType: "ticket",
      resourceId: "ticket-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "target",
      source: "ai",
    });
    assert.equal(event?.source, "ai");
  });

  it("13. handoff source recorded when provided", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: "agent",
      resourceType: "conversation",
      resourceId: "conv-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "target",
      source: "handoff",
    });
    assert.equal(event?.source, "handoff");
  });

  it("17. system source recorded when provided", async () => {
    const store = createMemoryAssignmentAuditStore();
    const service = new AssignmentAuditService({
      port: createMemoryAssignmentAuditDataPort(store),
    });
    const event = await service.recordAssignmentChange({
      companyId: "company-1",
      actorUserId: null,
      resourceType: "conversation",
      resourceId: "conv-1",
      previousAssigneeUserId: null,
      newAssigneeUserId: "target",
      source: "system",
    });
    assert.equal(event?.source, "system");
    assert.equal(event?.actorUserId, null);
  });
});
