/**
 * Resolve durable email conversation department ownership at FIRST create.
 * Pure decision helper — does not mutate the database.
 *
 * Precedence:
 *  1) department routing target
 *  2) employee target → snapshot profiles.department_id
 *  3) queue target → snapshot handoff_queues.department_id
 *  4) otherwise null
 *
 * Same-company validation is mandatory. Fail closed to null.
 */

export type EmailConversationOwnershipTargetType =
  | "department"
  | "employee"
  | "queue"
  | "unresolved"
  | "team"
  | string;

export type EmailConversationOwnershipDecisionInput = {
  targetType?: EmailConversationOwnershipTargetType | null;
  targetId?: string | null;
} | null;

export type EmailConversationOwnershipDepartmentRef = {
  id: string;
  companyId: string;
  isActive: boolean;
};

export type EmailConversationOwnershipEmployeeRef = {
  userId: string;
  companyId: string | null;
  departmentId: string | null;
};

export type EmailConversationOwnershipQueueRef = {
  id: string;
  companyId: string;
  departmentId: string | null;
  isActive: boolean;
};

export type EmailConversationDepartmentOwnershipPorts = {
  getDepartment(input: {
    companyId: string;
    departmentId: string;
  }): Promise<EmailConversationOwnershipDepartmentRef | null>;
  getEmployee(input: {
    companyId: string;
    userId: string;
  }): Promise<EmailConversationOwnershipEmployeeRef | null>;
  getQueue(input: {
    companyId: string;
    queueId: string;
  }): Promise<EmailConversationOwnershipQueueRef | null>;
};

export type ResolveEmailConversationDepartmentOwnershipInput = {
  companyId: string;
  decision: EmailConversationOwnershipDecisionInput;
  ports: EmailConversationDepartmentOwnershipPorts;
};

export type ResolveEmailConversationDepartmentOwnershipResult = {
  departmentId: string | null;
  source: "department_target" | "employee_snapshot" | "queue_department" | "unresolved";
};

function trimId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function acceptDepartment(
  ports: EmailConversationDepartmentOwnershipPorts,
  companyId: string,
  departmentId: string,
): Promise<string | null> {
  const dept = await ports.getDepartment({ companyId, departmentId });
  if (!dept) return null;
  if (dept.companyId !== companyId) return null;
  if (!dept.isActive) return null;
  if (dept.id !== departmentId) return null;
  return dept.id;
}

/**
 * Deterministic ownership resolver for inbound email conversation create.
 */
export async function resolveEmailConversationDepartmentOwnership(
  input: ResolveEmailConversationDepartmentOwnershipInput,
): Promise<ResolveEmailConversationDepartmentOwnershipResult> {
  const companyId = trimId(input.companyId);
  if (!companyId) {
    return { departmentId: null, source: "unresolved" };
  }

  const decision = input.decision;
  const targetType =
    typeof decision?.targetType === "string" ? decision.targetType.trim().toLowerCase() : "";
  const targetId = trimId(decision?.targetId ?? null);

  if (targetType === "department" && targetId) {
    const departmentId = await acceptDepartment(input.ports, companyId, targetId);
    if (departmentId) {
      return { departmentId, source: "department_target" };
    }
    return { departmentId: null, source: "unresolved" };
  }

  if (targetType === "employee" && targetId) {
    const employee = await input.ports.getEmployee({ companyId, userId: targetId });
    if (!employee) {
      return { departmentId: null, source: "unresolved" };
    }
    if (!employee.companyId || employee.companyId !== companyId) {
      return { departmentId: null, source: "unresolved" };
    }
    const employeeDeptId = trimId(employee.departmentId);
    if (!employeeDeptId) {
      return { departmentId: null, source: "unresolved" };
    }
    const departmentId = await acceptDepartment(input.ports, companyId, employeeDeptId);
    if (departmentId) {
      return { departmentId, source: "employee_snapshot" };
    }
    return { departmentId: null, source: "unresolved" };
  }

  if (targetType === "queue" && targetId) {
    const queue = await input.ports.getQueue({ companyId, queueId: targetId });
    if (!queue) {
      return { departmentId: null, source: "unresolved" };
    }
    if (queue.companyId !== companyId) {
      return { departmentId: null, source: "unresolved" };
    }
    if (!queue.isActive) {
      return { departmentId: null, source: "unresolved" };
    }
    const queueDeptId = trimId(queue.departmentId);
    if (!queueDeptId) {
      return { departmentId: null, source: "unresolved" };
    }
    const departmentId = await acceptDepartment(input.ports, companyId, queueDeptId);
    if (departmentId) {
      return { departmentId, source: "queue_department" };
    }
    return { departmentId: null, source: "unresolved" };
  }

  return { departmentId: null, source: "unresolved" };
}
