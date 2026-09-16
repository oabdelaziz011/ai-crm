import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveEmailConversationDepartmentOwnership,
  type EmailConversationDepartmentOwnershipPorts,
} from "./resolve-email-conversation-department-ownership.ts";

const COMPANY = "company-1";
const OTHER = "company-2";
const DEPT_A = "dept-a";
const DEPT_B = "dept-b";
const EMP = "user-emp";
const QUEUE = "queue-1";

function ports(overrides?: {
  departments?: Record<string, { id: string; companyId: string; isActive: boolean }>;
  employees?: Record<string, { userId: string; companyId: string | null; departmentId: string | null }>;
  queues?: Record<
    string,
    { id: string; companyId: string; departmentId: string | null; isActive: boolean }
  >;
}): EmailConversationDepartmentOwnershipPorts {
  const departments = {
    [DEPT_A]: { id: DEPT_A, companyId: COMPANY, isActive: true },
    [DEPT_B]: { id: DEPT_B, companyId: COMPANY, isActive: true },
    "dept-inactive": { id: "dept-inactive", companyId: COMPANY, isActive: false },
    "dept-other": { id: "dept-other", companyId: OTHER, isActive: true },
    ...(overrides?.departments ?? {}),
  };
  const employees = {
    [EMP]: { userId: EMP, companyId: COMPANY, departmentId: DEPT_A },
    "emp-no-dept": { userId: "emp-no-dept", companyId: COMPANY, departmentId: null },
    "emp-other": { userId: "emp-other", companyId: OTHER, departmentId: DEPT_A },
    "emp-cross-dept": { userId: "emp-cross-dept", companyId: COMPANY, departmentId: "dept-other" },
    ...(overrides?.employees ?? {}),
  };
  const queues = {
    [QUEUE]: { id: QUEUE, companyId: COMPANY, departmentId: DEPT_B, isActive: true },
    "queue-no-dept": { id: "queue-no-dept", companyId: COMPANY, departmentId: null, isActive: true },
    "queue-other": { id: "queue-other", companyId: OTHER, departmentId: DEPT_A, isActive: true },
    "queue-inactive": {
      id: "queue-inactive",
      companyId: COMPANY,
      departmentId: DEPT_A,
      isActive: false,
    },
    ...(overrides?.queues ?? {}),
  };

  return {
    async getDepartment({ companyId, departmentId }) {
      const row = departments[departmentId];
      if (!row) return null;
      // Caller still validates company; port may return row for id lookup.
      void companyId;
      return row;
    },
    async getEmployee({ userId }) {
      return employees[userId] ?? null;
    },
    async getQueue({ queueId }) {
      return queues[queueId] ?? null;
    },
  };
}

describe("resolveEmailConversationDepartmentOwnership", () => {
  it("1. department target -> department_id set", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "department", targetId: DEPT_A },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: DEPT_A, source: "department_target" });
  });

  it("2. employee target with department -> employee department snapshot", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "employee", targetId: EMP },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: DEPT_A, source: "employee_snapshot" });
  });

  it("3. employee target without department -> NULL", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "employee", targetId: "emp-no-dept" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("4. queue target with department -> department_id set", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "queue", targetId: QUEUE },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: DEPT_B, source: "queue_department" });
  });

  it("5. queue target without department -> NULL", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "queue", targetId: "queue-no-dept" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("6. no routing decision -> NULL", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: null,
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("10. cross-company department rejected", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "department", targetId: "dept-other" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("11. inactive department rejected/fails closed", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "department", targetId: "dept-inactive" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("12. cross-company employee department rejected", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "employee", targetId: "emp-other" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("12b. employee pointing at cross-company dept fails closed", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "employee", targetId: "emp-cross-dept" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("13. cross-company queue department rejected", async () => {
    const result = await resolveEmailConversationDepartmentOwnership({
      companyId: COMPANY,
      decision: { targetType: "queue", targetId: "queue-other" },
      ports: ports(),
    });
    assert.deepEqual(result, { departmentId: null, source: "unresolved" });
  });

  it("14. resolver is deterministic", async () => {
    const input = {
      companyId: COMPANY,
      decision: { targetType: "department" as const, targetId: DEPT_A },
      ports: ports(),
    };
    const a = await resolveEmailConversationDepartmentOwnership(input);
    const b = await resolveEmailConversationDepartmentOwnership(input);
    assert.deepEqual(a, b);
  });

  it("unresolved / team / missing targetId -> NULL", async () => {
    for (const decision of [
      { targetType: "unresolved", targetId: null },
      { targetType: "team", targetId: DEPT_A },
      { targetType: "department", targetId: null },
      { targetType: "department", targetId: "   " },
    ]) {
      const result = await resolveEmailConversationDepartmentOwnership({
        companyId: COMPANY,
        decision,
        ports: ports(),
      });
      assert.equal(result.departmentId, null);
      assert.equal(result.source, "unresolved");
    }
  });
});
