/**
 * Assignment Governance — Phase 3
 * Human employee assignment eligibility based on canonical profiles.department_id.
 */

export type AssignmentResource =
  | "conversation"
  | "email_conversation"
  | "ticket"
  | "lead"
  | "task"
  | "handoff";

/** Existing role template keys — do not invent new identifiers. */
export type AssignmentRoleTemplateKey = "admin" | "manager" | "human_handoff_agent" | "employee" | string;

export type AssignmentScopeKind = "super_admin" | "admin" | "manager" | "agent";

export type AssignmentEmployeeProfile = {
  id: string;
  companyId: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  /** Canonical membership — never use department text for auth. */
  departmentId: string | null;
};

export type AssignmentDepartmentRef = {
  id: string;
  companyId: string;
  name: string;
  branchId: string | null;
};

export type AssignmentActorSnapshot = {
  userId: string;
  companyId: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  departmentId: string | null;
  roleTemplateKeys: string[];
  managedDepartmentIds: string[];
};

export type AssignmentScope =
  | { kind: "super_admin" }
  | { kind: "admin"; companyId: string }
  | { kind: "manager"; companyId: string; managedDepartmentIds: readonly string[] }
  | { kind: "agent"; companyId: string; departmentId: string | null };

export type AssignableEmployee = {
  userId: string;
  companyId: string;
  departmentId: string;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  fullName: string | null;
  email: string | null;
  isActive: boolean;
};

export type AssignmentGovernanceDataPort = {
  getEmployeeProfile(userId: string): Promise<AssignmentEmployeeProfile | null>;
  listRoleTemplateKeys(userId: string, companyId: string): Promise<string[]>;
  listManagedDepartmentIds(managerUserId: string, companyId: string): Promise<string[]>;
  getDepartment(departmentId: string): Promise<AssignmentDepartmentRef | null>;
  getBranchName(branchId: string): Promise<string | null>;
  listCompanyActiveEmployeesWithDepartment(companyId: string): Promise<
    Array<{
      userId: string;
      departmentId: string;
      fullName: string | null;
      email: string | null;
      isActive: boolean;
    }>
  >;
};

export type AssignmentDecision = {
  allowed: boolean;
  reason: string | null;
  scope: AssignmentScope;
  actor: AssignmentActorSnapshot;
  target: AssignmentEmployeeProfile | null;
};
