import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure classification mirror of migration 367 backfill rules.
 * Used to lock matching semantics without touching production data.
 */
export type Candidate = {
  profileId: string;
  companyId: string;
  departmentText: string;
  branchIds: string[];
};

export type Department = {
  id: string;
  companyId: string;
  branchId: string;
  name: string;
  isActive: boolean;
};

export function classifyDepartmentBackfill(
  candidates: Candidate[],
  departments: Department[],
): Map<string, string | null> {
  const out = new Map<string, string | null>();

  for (const candidate of candidates) {
    const key = candidate.departmentText.trim().toLowerCase();
    if (!key) {
      out.set(candidate.profileId, null);
      continue;
    }

    if (candidate.branchIds.length > 0) {
      const matches = departments.filter(
        (d) =>
          d.isActive &&
          d.companyId === candidate.companyId &&
          candidate.branchIds.includes(d.branchId) &&
          d.name.trim().toLowerCase() === key,
      );
      out.set(candidate.profileId, matches.length === 1 ? matches[0].id : null);
      continue;
    }

    const matches = departments.filter(
      (d) =>
        d.isActive &&
        d.companyId === candidate.companyId &&
        d.name.trim().toLowerCase() === key,
    );
    out.set(candidate.profileId, matches.length === 1 ? matches[0].id : null);
  }

  return out;
}

describe("department_id backfill classification", () => {
  const departments: Department[] = [
    { id: "d1", companyId: "c1", branchId: "b1", name: "Support", isActive: true },
    { id: "d2", companyId: "c1", branchId: "b2", name: "Support", isActive: true },
    { id: "d3", companyId: "c1", branchId: "b1", name: "Billing", isActive: true },
    { id: "d4", companyId: "c2", branchId: "b9", name: "Support", isActive: true },
    { id: "d5", companyId: "c1", branchId: "b1", name: "Archive", isActive: false },
  ];

  it("branch-aware match resolves when exactly one assigned-branch dept matches", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p1", companyId: "c1", departmentText: "Support", branchIds: ["b1"] }],
      departments,
    );
    assert.equal(result.get("p1"), "d1");
  });

  it("ambiguous text across assigned branches stays null", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p2", companyId: "c1", departmentText: "Support", branchIds: ["b1", "b2"] }],
      departments,
    );
    assert.equal(result.get("p2"), null);
  });

  it("company-only match resolves only when exactly one active department exists", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p3", companyId: "c1", departmentText: "Billing", branchIds: [] }],
      departments,
    );
    assert.equal(result.get("p3"), "d3");
  });

  it("company-only ambiguous Support stays null", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p4", companyId: "c1", departmentText: "Support", branchIds: [] }],
      departments,
    );
    assert.equal(result.get("p4"), null);
  });

  it("unmatched department remains null", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p5", companyId: "c1", departmentText: "NoSuch", branchIds: [] }],
      departments,
    );
    assert.equal(result.get("p5"), null);
  });

  it("never matches another company", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p6", companyId: "c1", departmentText: "Support", branchIds: ["b9"] }],
      departments,
    );
    assert.equal(result.get("p6"), null);
  });

  it("ignores inactive departments", () => {
    const result = classifyDepartmentBackfill(
      [{ profileId: "p7", companyId: "c1", departmentText: "Archive", branchIds: [] }],
      departments,
    );
    assert.equal(result.get("p7"), null);
  });
});
