import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssignmentGovernanceService } from "./assignment-governance-service.ts";
import {
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "./memory-assignment-governance-data-port.ts";

const COMPANY = "company-1";
const DEPT_A = "dept-a";
const DEPT_B = "dept-b";

function buildService() {
  const store = createMemoryAssignmentStore();
  store.departments.set(DEPT_A, {
    id: DEPT_A,
    companyId: COMPANY,
    name: "Support",
    branchId: "branch-a",
  });
  store.departments.set(DEPT_B, {
    id: DEPT_B,
    companyId: COMPANY,
    name: "Support",
    branchId: "branch-b",
  });
  store.branchNames.set("branch-a", "Branch A");
  store.branchNames.set("branch-b", "Branch B");
  store.profiles.set("agent", {
    id: "agent",
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: DEPT_A,
  });
  store.profiles.set("same", {
    id: "same",
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: DEPT_A,
  });
  store.profiles.set("other", {
    id: "other",
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: DEPT_B,
  });
  store.profiles.set("nodept", {
    id: "nodept",
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: null,
  });
  store.profiles.set("inactive", {
    id: "inactive",
    companyId: COMPANY,
    isActive: false,
    isSuperAdmin: false,
    departmentId: DEPT_A,
  });
  store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
  store.roleTemplates.set(`admin:${COMPANY}`, ["admin"]);
  store.profiles.set("admin", {
    id: "admin",
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: null,
  });
  store.profiles.set("mgr", {
    id: "mgr",
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: null,
  });
  store.managedDepartments.set(`mgr:${COMPANY}`, [DEPT_B]);
  return new AssignmentGovernanceService({
    port: createMemoryAssignmentGovernanceDataPort(store),
  });
}

describe("Phase 4 getAssignableEmployees (canonical list)", () => {
  it("1-2. agent sees only same department", async () => {
    const service = buildService();
    const list = await service.getAssignableEmployees({ actorUserId: "agent" });
    assert.deepEqual(
      list.map((r) => r.userId).sort(),
      ["agent", "same"],
    );
  });

  it("3-4. manager sees managed departments only", async () => {
    const service = buildService();
    const list = await service.getAssignableEmployees({ actorUserId: "mgr" });
    assert.deepEqual(
      list.map((r) => r.userId),
      ["other"],
    );
  });

  it("5-8. admin excludes inactive and no-department", async () => {
    const service = buildService();
    const list = await service.getAssignableEmployees({ actorUserId: "admin" });
    const ids = new Set(list.map((r) => r.userId));
    assert.ok(ids.has("same"));
    assert.ok(ids.has("other"));
    assert.ok(!ids.has("inactive"));
    assert.ok(!ids.has("nodept"));
  });

  it("9. returns branch names for branch-aware UI labels", async () => {
    const service = buildService();
    const list = await service.getAssignableEmployees({ actorUserId: "admin" });
    const a = list.find((r) => r.userId === "same");
    const b = list.find((r) => r.userId === "other");
    assert.equal(a?.departmentName, "Support");
    assert.equal(a?.branchName, "Branch A");
    assert.equal(b?.branchName, "Branch B");
  });

  it("10. searchQuery filters only within authorized set", async () => {
    const service = buildService();
    const hit = await service.getAssignableEmployees({
      actorUserId: "agent",
      searchQuery: "same",
    });
    assert.equal(hit.length, 1);
    assert.equal(hit[0]?.userId, "same");

    const miss = await service.getAssignableEmployees({
      actorUserId: "agent",
      searchQuery: "other",
    });
    assert.equal(miss.length, 0);
  });
});
