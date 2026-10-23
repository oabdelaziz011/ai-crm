import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideDepartmentHandoff } from "./department-handoff-route.js";

const now = Date.parse("2026-10-13T11:17:00Z");
const fresh = new Date(now).toISOString();

const departments = [
  { id: "dept-support", name: "قسم الدعم" },
  { id: "dept-sales", name: "المبيعات" },
  { id: "dept-cs", name: "خدمة العملاء" },
];

describe("decideDepartmentHandoff", () => {
  it("keeps a customer-service request on the least loaded online agent", () => {
    const decision = decideDepartmentHandoff({
      customerText: "عايز اكلم خدمه العملاء",
      departments,
      defaultDepartmentLabel: "خدمه العملاء",
      queues: [],
      agents: [
        {
          userId: "busy",
          departmentId: "dept-cs",
          activeConversationCount: 2,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
        {
          userId: "free",
          departmentId: "dept-cs",
          activeConversationCount: 0,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
      ],
      nowMs: now,
    });
    assert.equal(decision.departmentMissing, false);
    assert.equal(decision.assigneeUserId, "free");
    assert.equal(decision.departmentName, "خدمة العملاء");
  });

  it("sends a support request to the support queue", () => {
    const decision = decideDepartmentHandoff({
      customerText: "حولني للدعم",
      departments,
      queues: [{ id: "queue-support", departmentId: "dept-support" }],
      agents: [],
      nowMs: now,
    });
    assert.equal(decision.queueId, "queue-support");
    assert.equal(decision.departmentName, "الدعم");
    assert.equal(decision.assigneeUserId, null);
  });

  it("keeps a customer-service request off other departments and falls back to the manager", () => {
    const decision = decideDepartmentHandoff({
      customerText: "حولني لخدمه العملاء",
      departments,
      defaultDepartmentLabel: "خدمه العملاء",
      queues: [],
      agents: [
        {
          userId: "sales",
          departmentId: "dept-sales",
          roleTier: "staff",
          activeConversationCount: 0,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
        {
          userId: "manager-1",
          departmentId: null,
          roleTier: "manager",
          activeConversationCount: 1,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
      ],
      nowMs: now,
    });
    assert.equal(decision.assigneeUserId, "manager-1");
    assert.equal(decision.departmentName, "خدمة العملاء");
  });

  it("uses the admin when the manager is offline", () => {
    const decision = decideDepartmentHandoff({
      customerText: "عايز خدمه العملاء",
      departments,
      defaultDepartmentLabel: "خدمه العملاء",
      queues: [],
      agents: [
        {
          userId: "admin-1",
          departmentId: null,
          roleTier: "admin",
          activeConversationCount: 0,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
      ],
      nowMs: now,
    });
    assert.equal(decision.assigneeUserId, "admin-1");
  });

  it("sends a manager request to the manager, then the admin", () => {
    const toManager = decideDepartmentHandoff({
      customerText: "حولني للمدير",
      departments,
      queues: [],
      agents: [
        {
          userId: "staff-cs",
          departmentId: "dept-cs",
          roleTier: "staff",
          activeConversationCount: 0,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
        {
          userId: "manager-1",
          departmentId: null,
          roleTier: "manager",
          activeConversationCount: 0,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
      ],
      nowMs: now,
    });
    assert.equal(toManager.assigneeUserId, "manager-1");
    assert.equal(toManager.departmentName, "المدير");
    const toAdmin = decideDepartmentHandoff({
      customerText: "عايز المدير",
      departments,
      queues: [],
      agents: [
        {
          userId: "admin-1",
          departmentId: null,
          roleTier: "admin",
          activeConversationCount: 0,
          state: "online",
          lastHeartbeatAt: fresh,
          viewingConversationId: null,
        },
      ],
      nowMs: now,
    });
    assert.equal(toAdmin.assigneeUserId, "admin-1");
  });

  it("does not invent a department that is not registered", () => {
    const decision = decideDepartmentHandoff({
      customerText: "عايز المحاسبه",
      departments,
      queues: [],
      agents: [],
      nowMs: now,
    });
    assert.equal(decision.departmentMissing, true);
    assert.equal(decision.departmentName, "حسابات");
  });
});
