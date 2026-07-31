import type {
  AiControlTowerAlert,
  AiControlTowerCapacityAdmin,
  AiControlTowerCollaborationAdmin,
  AiControlTowerCostAdmin,
  AiControlTowerEmployeeAdminEntry,
  AiControlTowerExecutionAdmin,
  AiControlTowerGlobalOverview,
  AiControlTowerGovernanceAdmin,
  AiControlTowerHealthDashboard,
  AiControlTowerLoadInput,
  AiControlTowerMemoryAdmin,
  AiControlTowerProviderAdmin,
  AiControlTowerRuntimeAdmin,
  AiControlTowerSkillsAdmin,
  AiControlTowerSnapshot,
  AiControlTowerTokenAdmin,
} from "@/lib/ai-employees/types/administration-types";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";

function estimateEmployeeHealth(employee: AiEmployeeRecord): number {
  switch (employee.status) {
    case "published":
      return 85;
    case "draft":
      return 55;
    case "disabled":
      return 30;
    case "archived":
      return 0;
    default:
      return 40;
  }
}

export function buildEmployeeAdminEntries(employees: AiEmployeeRecord[]): AiControlTowerEmployeeAdminEntry[] {
  return employees.map((employee) => ({
    employee,
    status: employee.status,
    owner: employee.owner,
    department: employee.department,
    healthScore: estimateEmployeeHealth(employee),
  }));
}

export function filterEmployees(
  entries: AiControlTowerEmployeeAdminEntry[],
  filter: { search?: string; status?: string; department?: string },
): AiControlTowerEmployeeAdminEntry[] {
  const searchTerm = filter.search?.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter.status && filter.status !== "all" && entry.status !== filter.status) return false;
    if (filter.department && filter.department !== "all" && entry.department !== filter.department) return false;
    if (searchTerm) {
      const haystack = [
        entry.employee.name,
        entry.employee.displayName,
        entry.employee.description,
        entry.department ?? "",
        entry.owner ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
}

export function buildGlobalOverview(input: AiControlTowerLoadInput): AiControlTowerGlobalOverview {
  const ops = input.operations;
  const gov = input.governance;
  const publishedCount = input.employees.filter((employee) => employee.status === "published").length;

  return {
    employeeCount: input.employees.length,
    skillCount: input.skills?.marketplace.length ?? 0,
    activeRuntimeCount: publishedCount,
    executionsToday: ops?.metrics.executionsToday ?? 0,
    successRate: ops?.metrics.successRate ?? 0,
    healthScore: gov?.dashboard.complianceScore ?? Math.round((publishedCount / Math.max(input.employees.length, 1)) * 100),
  };
}

export function buildSkillsAdmin(input: AiControlTowerLoadInput): AiControlTowerSkillsAdmin {
  const marketplace = input.skills?.marketplace ?? [];
  const assigned = input.skills?.assignedSkills ?? [];
  const usageCount = marketplace.reduce((sum, entry) => sum + entry.analytics.usageCount, 0);
  const assignments = marketplace.reduce((sum, entry) => sum + entry.analytics.assignmentCount, 0);

  return {
    totalSkills: marketplace.length,
    publishedSkills: marketplace.filter((entry) => entry.status === "published").length,
    assignedSkills: assigned.length,
    totalAssignments: assignments,
    usageCount,
  };
}

export function buildRuntimeAdmin(input: AiControlTowerLoadInput): AiControlTowerRuntimeAdmin {
  const ops = input.operations;
  const presence = ops?.runtimeStatus.presence ?? "offline";
  const published = input.employees.filter((employee) => employee.status === "published").length;
  const disabled = input.employees.filter((employee) => employee.status === "disabled" || employee.status === "archived").length;

  let online = 0;
  let offline = disabled;
  let busy = 0;

  if (presence === "busy" || presence === "waiting") {
    busy = 1;
    online = published > 0 ? published - 1 : 0;
  } else if (presence === "online" || presence === "idle") {
    online = published;
  } else {
    offline = input.employees.length - published;
    online = published > 0 && presence !== "offline" ? 1 : 0;
  }

  return {
    online,
    offline,
    busy,
    queueLength: ops?.runtimeStatus.queueLength ?? ops?.queue.pending ?? 0,
    workers: ops?.queue.running ?? 0,
  };
}

export function buildProviderAdmin(input: AiControlTowerLoadInput): AiControlTowerProviderAdmin {
  const providerPolicy = input.governance?.providerPolicy;
  const modelPolicy = input.governance?.modelPolicy;
  const usageByProvider = new Map<string, number>();

  for (const employee of input.employees) {
    if (!employee.provider) continue;
    usageByProvider.set(employee.provider, (usageByProvider.get(employee.provider) ?? 0) + 1);
  }

  const providers = (providerPolicy?.allowedProviders ?? []).map((key) => ({
    key,
    health: providerPolicy?.blockedProviders.includes(key) ? "blocked" : "healthy",
    usageCount: usageByProvider.get(key) ?? 0,
  }));

  return {
    providers,
    models: modelPolicy?.allowedModels ?? [],
    defaultProvider: providerPolicy?.defaultProvider ?? null,
  };
}

export function buildCostAdmin(input: AiControlTowerLoadInput): AiControlTowerCostAdmin {
  const costs = input.operations?.costs;
  return {
    dailyCost: costs?.estimatedDailyCost ?? 0,
    monthlyCost: costs?.estimatedMonthlyCost ?? 0,
    promptTokens: costs?.promptTokens ?? 0,
    completionTokens: costs?.completionTokens ?? 0,
    requests: costs?.requests ?? 0,
    currency: costs?.currency ?? "USD",
  };
}

export function buildMemoryAdmin(input: AiControlTowerLoadInput): AiControlTowerMemoryAdmin {
  const memory = input.memory;
  return {
    memoryUsagePercent: memory?.overview.memoryUsagePercent ?? 0,
    contextSizeTokens: memory?.overview.contextSizeTokens ?? memory?.contextWindow.estimatedTokens ?? 0,
    retrievalCount: (memory?.analytics.memoryHits ?? 0) + (memory?.analytics.memoryMisses ?? 0),
    storedMemories: memory?.overview.storedMemories ?? memory?.longTerm.length ?? 0,
  };
}

export function buildCollaborationAdmin(input: AiControlTowerLoadInput): AiControlTowerCollaborationAdmin {
  const collab = input.collaboration;
  return {
    groupCount: collab?.groups.length ?? 0,
    handoverCount: collab?.analytics.collaborationCount ?? 0,
    handoverSuccessRate: collab?.analytics.handoverSuccessRate ?? 0,
    failureCount: collab?.analytics.failedTransfers ?? 0,
  };
}

export function buildGovernanceAdmin(input: AiControlTowerLoadInput): AiControlTowerGovernanceAdmin {
  const gov = input.governance;
  return {
    policyCount: gov?.dashboard.policyCount ?? 0,
    violationCount: gov?.dashboard.violationCount ?? 0,
    complianceScore: gov?.dashboard.complianceScore ?? 0,
    riskScore: gov?.dashboard.riskScore ?? 0,
    riskLevel: gov?.riskAssessment.level ?? "low",
  };
}

export function buildExecutionAdmin(input: AiControlTowerLoadInput): AiControlTowerExecutionAdmin {
  const queue = input.operations?.queue;
  return {
    totalExecutions: (queue?.pending ?? 0) + (queue?.running ?? 0) + (queue?.completed ?? 0) + (queue?.failed ?? 0),
    running: queue?.running ?? 0,
    completed: queue?.completed ?? 0,
    failed: queue?.failed ?? 0,
  };
}

export function buildTokenAdmin(input: AiControlTowerLoadInput): AiControlTowerTokenAdmin {
  const costs = input.operations?.costs;
  const promptTokens = costs?.promptTokens ?? 0;
  const completionTokens = costs?.completionTokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export function buildCapacityAdmin(input: AiControlTowerLoadInput): AiControlTowerCapacityAdmin {
  const maxConcurrency = input.focusEmployee.runtimeConfiguration.maxConcurrency;
  const running = input.operations?.queue.running ?? 0;
  const utilization = maxConcurrency > 0 ? Math.round((running / maxConcurrency) * 100) : 0;

  return {
    utilizationPercent: Math.min(utilization, 100),
    maxConcurrency,
    activeWorkers: running,
    licenseSeats: input.employees.length,
    usedSeats: input.employees.filter((employee) => employee.status === "published").length,
  };
}

export function buildAlerts(input: AiControlTowerLoadInput): AiControlTowerAlert[] {
  const alerts: AiControlTowerAlert[] = [];
  const now = new Date().toISOString();

  if ((input.governance?.dashboard.violationCount ?? 0) > 0) {
    alerts.push({
      id: "gov-violations",
      severity: "critical",
      label: `${input.governance!.dashboard.violationCount} open governance violations`,
      source: "governance",
      timestamp: now,
    });
  }

  if ((input.operations?.metrics.successRate ?? 100) < 80) {
    alerts.push({
      id: "ops-success-rate",
      severity: "warning",
      label: `Success rate below threshold (${input.operations?.metrics.successRate ?? 0}%)`,
      source: "operations",
      timestamp: now,
    });
  }

  if (input.governance?.riskAssessment.level === "critical" || input.governance?.riskAssessment.level === "high") {
    alerts.push({
      id: "gov-risk",
      severity: "warning",
      label: `Elevated risk level: ${input.governance?.riskAssessment.level}`,
      source: "governance",
      timestamp: now,
    });
  }

  if ((input.collaboration?.analytics.failedTransfers ?? 0) > 0) {
    alerts.push({
      id: "collab-failures",
      severity: "info",
      label: `${input.collaboration!.analytics.failedTransfers} failed handovers`,
      source: "collaboration",
      timestamp: now,
    });
  }

  return alerts;
}

export function buildHealthDashboard(input: AiControlTowerLoadInput): AiControlTowerHealthDashboard {
  const alerts = buildAlerts(input);
  const govScore = input.governance?.dashboard.complianceScore ?? 70;
  const opsScore = input.operations?.metrics.successRate ?? 70;
  const healthScore = Math.round((govScore + opsScore) / 2);

  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (input.focusEmployee.status !== "published") {
    warnings.push(`Focus employee is ${input.focusEmployee.status}`);
    recommendations.push("Publish the employee to activate runtime binding");
  }

  if ((input.governance?.dashboard.pendingApprovals ?? 0) > 0) {
    warnings.push(`${input.governance!.dashboard.pendingApprovals} pending approvals`);
    recommendations.push("Review pending governance approvals");
  }

  if ((input.memory?.overview.memoryHealth ?? "healthy") === "degraded") {
    warnings.push("Memory health is degraded");
    recommendations.push("Inspect memory policies and context window usage");
  }

  const overallHealth: AiControlTowerHealthDashboard["overallHealth"] =
    healthScore >= 80 && alerts.every((alert) => alert.severity !== "critical")
      ? "healthy"
      : healthScore >= 50
        ? "degraded"
        : "critical";

  return {
    overallHealth,
    healthScore,
    alerts,
    warnings,
    recommendations,
  };
}

export function buildControlTowerSnapshot(input: AiControlTowerLoadInput): AiControlTowerSnapshot {
  return {
    globalOverview: buildGlobalOverview(input),
    employees: buildEmployeeAdminEntries(input.employees),
    skillsAdmin: buildSkillsAdmin(input),
    runtimeAdmin: buildRuntimeAdmin(input),
    providerAdmin: buildProviderAdmin(input),
    costAdmin: buildCostAdmin(input),
    memoryAdmin: buildMemoryAdmin(input),
    collaborationAdmin: buildCollaborationAdmin(input),
    governanceAdmin: buildGovernanceAdmin(input),
    executionAdmin: buildExecutionAdmin(input),
    tokenAdmin: buildTokenAdmin(input),
    capacityAdmin: buildCapacityAdmin(input),
    healthDashboard: buildHealthDashboard(input),
  };
}
