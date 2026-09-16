export class AssignmentGovernanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AssignmentGovernanceError";
    this.code = code;
  }
}

export const ASSIGNMENT_GOVERNANCE_CODES = {
  ACTOR_NOT_FOUND: "assignment_actor_not_found",
  ACTOR_INACTIVE: "assignment_actor_inactive",
  ACTOR_NO_COMPANY: "assignment_actor_no_company",
  TARGET_NOT_FOUND: "assignment_target_not_found",
  TARGET_INACTIVE: "assignment_target_inactive",
  TARGET_NO_COMPANY: "assignment_target_no_company",
  TARGET_CROSS_COMPANY: "assignment_target_cross_company",
  TARGET_NO_DEPARTMENT: "assignment_target_no_department",
  TARGET_DEPARTMENT_INVALID: "assignment_target_department_invalid",
  AGENT_NO_DEPARTMENT: "assignment_agent_no_department",
  AGENT_DEPARTMENT_MISMATCH: "assignment_agent_department_mismatch",
  MANAGER_NO_MANAGED_DEPARTMENTS: "assignment_manager_no_managed_departments",
  MANAGER_DEPARTMENT_OUT_OF_SCOPE: "assignment_manager_department_out_of_scope",
  DENIED: "assignment_denied",
} as const;
