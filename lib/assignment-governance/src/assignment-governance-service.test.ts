import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssignmentGovernanceService } from "./assignment-governance-service.ts";
import { AssignmentGovernanceError } from "./errors.ts";
import {
  createMemoryAssignmentGovernanceDataPort,
  createMemoryAssignmentStore,
} from "./memory-assignment-governance-data-port.ts";
import type { AssignmentEmployeeProfile } from "./types.ts";

const COMPANY = "company-1";
const OTHER = "company-2";
const DEPT_A = "dept-a";
const DEPT_B = "dept-b";
const DEPT_OTHER = "dept-other";

function profile(
  id: string,
  overrides: Partial<AssignmentEmployeeProfile> = {},
): AssignmentEmployeeProfile {
  return {
    id,
    companyId: COMPANY,
    isActive: true,
    isSuperAdmin: false,
    departmentId: DEPT_A,
    ...overrides,
  };
}

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
    name: "Billing",
    branchId: "branch-a",
  });
  store.departments.set(DEPT_OTHER, {
    id: DEPT_OTHER,
    companyId: OTHER,
    name: "Support",
    branchId: "branch-x",
  });

  const service = new AssignmentGovernanceService({
    port: createMemoryAssignmentGovernanceDataPort(store),
  });
  return { store, service };
}

describe("AssignmentGovernanceService — AGENT", () => {
  it("1. same department target -> allowed", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent"));
    store.profiles.set("target", profile("target"));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await service.assertCanAssignToEmployee({
      actorUserId: "agent",
      targetUserId: "target",
      resource: "conversation",
    });
  });

  it("2. different department target -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent"));
    store.profiles.set("target", profile("target", { departmentId: DEPT_B }));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "agent",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError &&
        err.code === "assignment_agent_department_mismatch",
    );
  });

  it("3. no department actor -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent", { departmentId: null }));
    store.profiles.set("target", profile("target"));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "agent",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError && err.code === "assignment_agent_no_department",
    );
  });

  it("4. target without department -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent"));
    store.profiles.set("target", profile("target", { departmentId: null }));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "agent",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError && err.code === "assignment_target_no_department",
    );
  });

  it("5. inactive target -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent"));
    store.profiles.set("target", profile("target", { isActive: false }));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "agent",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError && err.code === "assignment_target_inactive",
    );
  });

  it("6. cross-company target -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent"));
    store.profiles.set(
      "target",
      profile("target", { companyId: OTHER, departmentId: DEPT_OTHER }),
    );
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "agent",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError && err.code === "assignment_target_cross_company",
    );
  });
});

describe("AssignmentGovernanceService — MANAGER", () => {
  it("7. target in managed department -> allowed", async () => {
    const { store, service } = buildService();
    store.profiles.set("mgr", profile("mgr", { departmentId: null }));
    store.profiles.set("target", profile("target", { departmentId: DEPT_B }));
    store.roleTemplates.set(`mgr:${COMPANY}`, ["manager"]);
    store.managedDepartments.set(`mgr:${COMPANY}`, [DEPT_B]);
    await service.assertCanAssignToEmployee({
      actorUserId: "mgr",
      targetUserId: "target",
    });
  });

  it("8. target in unmanaged department -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("mgr", profile("mgr"));
    store.profiles.set("target", profile("target", { departmentId: DEPT_A }));
    store.managedDepartments.set(`mgr:${COMPANY}`, [DEPT_B]);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "mgr",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError &&
        err.code === "assignment_manager_department_out_of_scope",
    );
  });

  it("9. manager with zero managed departments -> denied", async () => {
    const { store, service } = buildService();
    store.profiles.set("mgr", profile("mgr"));
    store.profiles.set("target", profile("target"));
    store.roleTemplates.set(`mgr:${COMPANY}`, ["manager"]);
    store.managedDepartments.set(`mgr:${COMPANY}`, []);
    await assert.rejects(
      () =>
        service.assertCanAssignToEmployee({
          actorUserId: "mgr",
          targetUserId: "target",
        }),
      (err: unknown) =>
        err instanceof AssignmentGovernanceError &&
        err.code === "assignment_manager_no_managed_departments",
    );
  });

  it("10-12. inactive / no-department / cross-company denied for manager", async () => {
    const { store, service } = buildService();
    store.profiles.set("mgr", profile("mgr"));
    store.managedDepartments.set(`mgr:${COMPANY}`, [DEPT_A]);

    store.profiles.set("inactive", profile("inactive", { isActive: false }));
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({ actorUserId: "mgr", targetUserId: "inactive" }),
    );

    store.profiles.set("nodept", profile("nodept", { departmentId: null }));
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({ actorUserId: "mgr", targetUserId: "nodept" }),
    );

    store.profiles.set(
      "cross",
      profile("cross", { companyId: OTHER, departmentId: DEPT_OTHER }),
    );
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({ actorUserId: "mgr", targetUserId: "cross" }),
    );
  });
});

describe("AssignmentGovernanceService — ADMIN / SUPER ADMIN", () => {
  it("13-14. admin same-company any department -> allowed", async () => {
    const { store, service } = buildService();
    store.profiles.set("admin", profile("admin", { departmentId: null }));
    store.profiles.set("target", profile("target", { departmentId: DEPT_B }));
    store.roleTemplates.set(`admin:${COMPANY}`, ["admin"]);
    await service.assertCanAssignToEmployee({
      actorUserId: "admin",
      targetUserId: "target",
    });
  });

  it("15-17. admin denies inactive / cross-company / no-department", async () => {
    const { store, service } = buildService();
    store.profiles.set("admin", profile("admin"));
    store.roleTemplates.set(`admin:${COMPANY}`, ["admin"]);

    store.profiles.set("inactive", profile("inactive", { isActive: false }));
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({ actorUserId: "admin", targetUserId: "inactive" }),
    );

    store.profiles.set(
      "cross",
      profile("cross", { companyId: OTHER, departmentId: DEPT_OTHER }),
    );
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({ actorUserId: "admin", targetUserId: "cross" }),
    );

    store.profiles.set("nodept", profile("nodept", { departmentId: null }));
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({ actorUserId: "admin", targetUserId: "nodept" }),
    );
  });

  it("18. super admin preserves full access for valid company targets", async () => {
    const { store, service } = buildService();
    store.profiles.set(
      "sa",
      profile("sa", { isSuperAdmin: true, companyId: null, departmentId: null }),
    );
    store.profiles.set("target", profile("target"));
    await service.assertCanAssignToEmployee({
      actorUserId: "sa",
      targetUserId: "target",
    });
  });

  it("26-27. client-supplied role cannot bypass — scope loaded from store only", async () => {
    const { store, service } = buildService();
    // Actor is agent in DB even if a client claimed admin
    store.profiles.set("agent", profile("agent"));
    store.profiles.set("target", profile("target", { departmentId: DEPT_B }));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);
    await assert.rejects(() =>
      service.assertCanAssignToEmployee({
        actorUserId: "agent",
        targetUserId: "target",
      }),
    );
  });
});

describe("getAssignableEmployees", () => {
  it("agent only sees same department; excludes no-department", async () => {
    const { store, service } = buildService();
    store.profiles.set("agent", profile("agent"));
    store.profiles.set("same", profile("same"));
    store.profiles.set("other", profile("other", { departmentId: DEPT_B }));
    store.profiles.set("nodept", profile("nodept", { departmentId: null }));
    store.roleTemplates.set(`agent:${COMPANY}`, ["human_handoff_agent"]);

    const list = await service.getAssignableEmployees({ actorUserId: "agent" });
    const ids = list.map((row) => row.userId).sort();
    assert.deepEqual(ids, ["agent", "same"]);
  });

  it("manager sees only managed departments", async () => {
    const { store, service } = buildService();
    store.profiles.set("mgr", profile("mgr", { departmentId: null }));
    store.profiles.set("in", profile("in", { departmentId: DEPT_B }));
    store.profiles.set("out", profile("out", { departmentId: DEPT_A }));
    store.managedDepartments.set(`mgr:${COMPANY}`, [DEPT_B]);

    const list = await service.getAssignableEmployees({ actorUserId: "mgr" });
    assert.deepEqual(
      list.map((r) => r.userId),
      ["in"],
    );
  });
});
