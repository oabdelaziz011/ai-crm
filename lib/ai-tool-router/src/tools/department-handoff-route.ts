const PRESENCE_FRESH_MS = 120_000;

export type DepartmentCandidate = {
  id: string;
  name: string;
  code?: string | null;
  departmentType?: string | null;
};

export type DepartmentQueueCandidate = {
  id: string;
  departmentId: string | null;
};

export type HandoffRoleTier = "staff" | "manager" | "admin";

export type DepartmentAgentCandidate = {
  userId: string;
  departmentId: string | null;
  roleTier?: HandoffRoleTier;
  activeConversationCount: number;
  state: string;
  lastHeartbeatAt: string | null;
  viewingConversationId: string | null;
};

export type HandoffFallbackPolicy = "leadership" | "department_then_leadership";

export type DepartmentHandoffDecision = {
  departmentId: string | null;
  departmentName: string | null;
  departmentMissing: boolean;
  queueId: string | null;
  assigneeUserId: string | null;
  fallbackPolicy: HandoffFallbackPolicy | null;
};

export function classifyHandoffRoleTier(input: {
  name?: string | null;
  templateKey?: string | null;
}): HandoffRoleTier {
  const template = (input.templateKey ?? "").trim().toLowerCase();
  const name = (input.name ?? "").trim().toLowerCase();
  if (template === "manager" || name === "manager" || /مدير/.test(name)) return "manager";
  if (
    template === "admin" ||
    template === "super_admin" ||
    /super\s*admin|admin|ادمن|أدمن|سوبر/.test(name)
  ) {
    return "admin";
  }
  return "staff";
}

export function foldHandoffRoleTiers(tiers: HandoffRoleTier[]): HandoffRoleTier {
  if (tiers.includes("manager")) return "manager";
  if (tiers.includes("admin")) return "admin";
  return "staff";
}

export function normalizeDepartmentLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/^قسم\s+/u, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Customer asked for the manager, not a department desk. */
export function customerWantsManager(text: string): boolean {
  return /(?:^|\s)ل?(?:[اأإآ])?ل?مدير(?:\s|$)|(?:^|\s)manager(?:\s|$)/iu.test(text.trim());
}

/** A named desk other than generic customer service. Null means the employee's own desk. */
export function requestedDepartmentHint(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const genericCustomerService = /خدم[ةه]\s*العملا/u.test(trimmed);
  const named = /(?:قسم|ديبارتمنت|department)\s+(.{2,40})/iu.exec(trimmed)?.[1]?.trim() ?? "";
  if (/دعم/u.test(trimmed) && !genericCustomerService) return named || "دعم";
  if (/مبيعات/u.test(trimmed)) return named || "مبيعات";
  if (/حسابات|محاسب/u.test(trimmed)) return named || "حسابات";
  if (/شكاو/u.test(trimmed)) return named || "شكاوى";
  if (named && !genericCustomerService) return named;
  return null;
}

export function matchDepartmentByLabel(
  label: string,
  departments: DepartmentCandidate[],
): DepartmentCandidate | null {
  const needle = normalizeDepartmentLabel(label);
  if (needle.length < 2) return null;
  const hits = departments
    .map((department) => {
      const labels = [department.name, department.code ?? "", department.departmentType ?? ""]
        .map((value) => normalizeDepartmentLabel(value))
        .filter((value) => value.length >= 2);
      const matched = labels.find((value) => needle.includes(value) || value.includes(needle));
      return matched ? { department, length: matched.length } : null;
    })
    .filter((entry): entry is { department: DepartmentCandidate; length: number } => entry != null)
    .sort((left, right) => right.length - left.length);
  return hits[0]?.department ?? null;
}

function customerDepartmentLabel(department: DepartmentCandidate): string {
  return department.name.replace(/^قسم\s+/u, "").trim() || department.name;
}

function isFreshOnline(agent: DepartmentAgentCandidate, nowMs: number): boolean {
  if (agent.state !== "online" || !agent.lastHeartbeatAt) return false;
  const seen = Date.parse(agent.lastHeartbeatAt);
  return Number.isFinite(seen) && nowMs - seen <= PRESENCE_FRESH_MS;
}

export function pickLeastLoadedOnlineAgent(
  agents: DepartmentAgentCandidate[],
  departmentId: string | null,
  nowMs: number,
): string | null {
  const pool = agents.filter((agent) => {
    if (!isFreshOnline(agent, nowMs)) return false;
    if (departmentId && agent.departmentId !== departmentId) return false;
    return true;
  });
  pool.sort((left, right) => {
    const load = left.activeConversationCount - right.activeConversationCount;
    if (load !== 0) return load;
    const leftBusy = left.viewingConversationId ? 1 : 0;
    const rightBusy = right.viewingConversationId ? 1 : 0;
    if (leftBusy !== rightBusy) return leftBusy - rightBusy;
    return left.userId.localeCompare(right.userId);
  });
  return pool[0]?.userId ?? null;
}

function pickOnlineRole(
  agents: DepartmentAgentCandidate[],
  roleTier: HandoffRoleTier,
  nowMs: number,
): string | null {
  return pickLeastLoadedOnlineAgent(
    agents.filter((agent) => (agent.roleTier ?? "staff") === roleTier),
    null,
    nowMs,
  );
}

export function decideDepartmentHandoff(input: {
  customerText: string;
  departments: DepartmentCandidate[];
  defaultDepartmentLabel?: string | null;
  queues: DepartmentQueueCandidate[];
  agents: DepartmentAgentCandidate[];
  nowMs?: number;
}): DepartmentHandoffDecision {
  const nowMs = input.nowMs ?? Date.now();
  if (customerWantsManager(input.customerText)) {
    const assigneeUserId = pickOnlineRole(input.agents, "manager", nowMs) ?? pickOnlineRole(input.agents, "admin", nowMs);
    return {
      departmentId: null,
      departmentName: "المدير",
      departmentMissing: false,
      queueId: null,
      assigneeUserId,
      fallbackPolicy: assigneeUserId ? null : "leadership",
    };
  }
  const hint = requestedDepartmentHint(input.customerText);
  const requested = hint ? matchDepartmentByLabel(hint, input.departments) : null;
  if (hint && !requested) {
    return {
      departmentId: null,
      departmentName: hint,
      departmentMissing: true,
      queueId: null,
      assigneeUserId: null,
      fallbackPolicy: null,
    };
  }
  const fallback = !hint && input.defaultDepartmentLabel
    ? matchDepartmentByLabel(input.defaultDepartmentLabel, input.departments)
    : null;
  const department = requested ?? fallback;
  const departmentId = department?.id ?? null;
  const departmentName = department ? customerDepartmentLabel(department) : null;
  const queue = departmentId
    ? input.queues.find((entry) => entry.departmentId === departmentId) ?? null
    : null;
  if (queue) {
    return {
      departmentId,
      departmentName,
      departmentMissing: false,
      queueId: queue.id,
      assigneeUserId: null,
      fallbackPolicy: null,
    };
  }
  const staff = departmentId
    ? pickLeastLoadedOnlineAgent(
        input.agents.filter((agent) => (agent.roleTier ?? "staff") === "staff"),
        departmentId,
        nowMs,
      )
    : null;
  const manager = pickOnlineRole(input.agents, "manager", nowMs);
  const admin = pickOnlineRole(input.agents, "admin", nowMs);
  const assigneeUserId = staff ?? manager ?? admin;
  return {
    departmentId,
    departmentName,
    departmentMissing: false,
    queueId: null,
    assigneeUserId,
    fallbackPolicy: assigneeUserId ? null : "department_then_leadership",
  };
}
