import type {
  AssignmentDepartmentRef,
  AssignmentEmployeeProfile,
  AssignmentGovernanceDataPort,
} from "./types.js";

export type MemoryAssignmentStore = {
  profiles: Map<string, AssignmentEmployeeProfile>;
  roleTemplates: Map<string, string[]>; // `${userId}:${companyId}` → keys
  managedDepartments: Map<string, string[]>; // `${userId}:${companyId}` → dept ids
  departments: Map<string, AssignmentDepartmentRef>;
  branchNames: Map<string, string>;
};

export function createMemoryAssignmentStore(): MemoryAssignmentStore {
  return {
    profiles: new Map(),
    roleTemplates: new Map(),
    managedDepartments: new Map(),
    departments: new Map(),
    branchNames: new Map(),
  };
}

export function createMemoryAssignmentGovernanceDataPort(
  store: MemoryAssignmentStore,
): AssignmentGovernanceDataPort {
  return {
    async getEmployeeProfile(userId) {
      return store.profiles.get(userId) ?? null;
    },
    async listRoleTemplateKeys(userId, companyId) {
      return store.roleTemplates.get(`${userId}:${companyId}`) ?? [];
    },
    async listManagedDepartmentIds(managerUserId, companyId) {
      return store.managedDepartments.get(`${managerUserId}:${companyId}`) ?? [];
    },
    async getDepartment(departmentId) {
      return store.departments.get(departmentId) ?? null;
    },
    async getBranchName(branchId) {
      return store.branchNames.get(branchId) ?? null;
    },
    async listCompanyActiveEmployeesWithDepartment(companyId) {
      const out: Array<{
        userId: string;
        departmentId: string;
        fullName: string | null;
        email: string | null;
        isActive: boolean;
      }> = [];
      for (const profile of store.profiles.values()) {
        if (profile.companyId !== companyId) continue;
        if (!profile.isActive) continue;
        if (!profile.departmentId) continue;
        out.push({
          userId: profile.id,
          departmentId: profile.departmentId,
          fullName: null,
          email: null,
          isActive: true,
        });
      }
      return out;
    },
  };
}
