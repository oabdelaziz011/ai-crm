/**
 * Pure validation mirror of validate_email_routing_target / upsert security rules.
 * Live SQL RPC isolation is covered by migration + RLS; these tests lock the intended contract.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type TargetType = "department" | "employee" | "queue";

type Entity = { id: string; companyId: string };

function validateTarget(input: {
  companyId: string;
  targetType: TargetType;
  targetId: string | null;
  departments: Entity[];
  employees: Entity[];
  queues: Entity[];
}): { ok: true } | { ok: false; reason: string } {
  if (input.targetId == null) return { ok: true };
  const pool =
    input.targetType === "department"
      ? input.departments
      : input.targetType === "employee"
        ? input.employees
        : input.queues;
  const hit = pool.find((row) => row.id === input.targetId);
  if (!hit) return { ok: false, reason: "missing" };
  if (hit.companyId !== input.companyId) return { ok: false, reason: "cross_company" };
  return { ok: true };
}

describe("email routing target validation contract (Sprint 7)", () => {
  const companyA = "co-a";
  const companyB = "co-b";
  const departments = [
    { id: "dept-a", companyId: companyA },
    { id: "dept-b", companyId: companyB },
  ];
  const employees = [
    { id: "emp-a", companyId: companyA },
    { id: "emp-b", companyId: companyB },
  ];
  const queues = [
    { id: "queue-a", companyId: companyA },
    { id: "queue-b", companyId: companyB },
  ];

  it("allows NULL target_id", () => {
    assert.equal(
      validateTarget({
        companyId: companyA,
        targetType: "department",
        targetId: null,
        departments,
        employees,
        queues,
      }).ok,
      true,
    );
  });

  it("accepts same-company department/employee/queue targets", () => {
    assert.equal(
      validateTarget({
        companyId: companyA,
        targetType: "department",
        targetId: "dept-a",
        departments,
        employees,
        queues,
      }).ok,
      true,
    );
    assert.equal(
      validateTarget({
        companyId: companyA,
        targetType: "employee",
        targetId: "emp-a",
        departments,
        employees,
        queues,
      }).ok,
      true,
    );
    assert.equal(
      validateTarget({
        companyId: companyA,
        targetType: "queue",
        targetId: "queue-a",
        departments,
        employees,
        queues,
      }).ok,
      true,
    );
  });

  it("rejects cross-company department target", () => {
    const result = validateTarget({
      companyId: companyA,
      targetType: "department",
      targetId: "dept-b",
      departments,
      employees,
      queues,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "cross_company");
  });

  it("rejects cross-company employee target", () => {
    const result = validateTarget({
      companyId: companyA,
      targetType: "employee",
      targetId: "emp-b",
      departments,
      employees,
      queues,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "cross_company");
  });

  it("rejects cross-company queue target", () => {
    const result = validateTarget({
      companyId: companyA,
      targetType: "queue",
      targetId: "queue-b",
      departments,
      employees,
      queues,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "cross_company");
  });
});
