import type { ToolMetadataEntry } from "@/lib/ai-employees/adapters/tool-metadata-adapter";
import type {
  AiEmployeeRecord,
  AiGovernanceApprovalRecord,
  AiGovernanceAuditRecord,
  AiGovernanceComplianceSnapshot,
  AiGovernanceDashboardSnapshot,
  AiGovernanceModelPolicy,
  AiGovernancePlatformSnapshot,
  AiGovernancePolicyDbRow,
  AiGovernancePolicyRecord,
  AiGovernancePromptPolicyEntry,
  AiGovernanceProviderPolicy,
  AiGovernanceRiskAssessment,
  AiGovernanceRiskLevel,
  AiGovernanceSkillPolicyEntry,
  AiGovernanceToolRestriction,
  AiGovernanceViolationRecord,
} from "@/lib/ai-employees/types";
import type { AiSkillRecord } from "@/lib/ai-employees/types/skill-types";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readRecordOfStringArrays(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = readStringArray(entry);
  }
  return result;
}

export function mapGovernancePolicy(row: AiGovernancePolicyDbRow): AiGovernancePolicyRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    category: row.category,
    config: row.config ?? {},
    status: row.status,
    ownerId: row.owner_id ?? null,
    department: row.department ?? null,
    versionNumber: row.version_number ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGovernancePolicies(rows: AiGovernancePolicyDbRow[]): AiGovernancePolicyRecord[] {
  return rows.map(mapGovernancePolicy);
}

export function extractModelPolicy(policies: AiGovernancePolicyRecord[]): AiGovernanceModelPolicy {
  const policy = policies.find((entry) => entry.category === "model");
  const config = policy?.config ?? {};
  return {
    allowedModels: readStringArray(config.allowedModels),
    blockedModels: readStringArray(config.blockedModels),
    defaultModel: typeof config.defaultModel === "string" ? config.defaultModel : null,
    departmentRestrictions: readRecordOfStringArrays(config.departmentRestrictions),
  };
}

export function extractProviderPolicy(policies: AiGovernancePolicyRecord[]): AiGovernanceProviderPolicy {
  const policy = policies.find((entry) => entry.category === "provider");
  const config = policy?.config ?? {};
  return {
    allowedProviders: readStringArray(config.allowedProviders),
    blockedProviders: readStringArray(config.blockedProviders),
    defaultProvider: typeof config.defaultProvider === "string" ? config.defaultProvider : null,
  };
}

export function buildPromptPolicies(employees: AiEmployeeRecord[]): AiGovernancePromptPolicyEntry[] {
  return employees.map((employee) => ({
    employeeId: employee.id,
    displayName: employee.displayName,
    promptVersionLabel: employee.promptVersionLabel,
    approvalState: employee.hasUnpublishedDraft ? "pending" : employee.status === "published" ? "published" : "draft",
    ownerId: employee.ownerId,
    department: employee.department,
  }));
}

export function buildToolRestrictions(
  toolCatalog: ToolMetadataEntry[],
  employee: AiEmployeeRecord,
  policies: AiGovernancePolicyRecord[],
): AiGovernanceToolRestriction[] {
  const toolPolicy = policies.find((entry) => entry.category === "tool");
  const blocked = new Set(readStringArray(toolPolicy?.config.blockedTools));
  const confirmationRequired = new Set(readStringArray(toolPolicy?.config.confirmationRequired));
  const allowedSet = new Set(employee.allowedToolKeys);

  return toolCatalog.map((tool) => {
    let status: AiGovernanceToolRestriction["status"] = "allowed";
    if (blocked.has(tool.key) || !allowedSet.has(tool.key)) {
      status = "blocked";
    } else if (confirmationRequired.has(tool.key) || tool.classification === "requires_confirmation") {
      status = "confirmation_required";
    }

    return {
      key: tool.key,
      displayName: tool.displayName,
      status,
      riskLevel: tool.riskLevel,
    };
  });
}

export function buildSkillPolicies(skills: AiSkillRecord[]): AiGovernanceSkillPolicyEntry[] {
  return skills.map((skill) => ({
    skillId: skill.id,
    displayName: skill.displayName,
    status: skill.status === "archived" ? "deprecated" : skill.status === "published" ? "approved" : "blocked",
    category: skill.category,
  }));
}

const RISK_WEIGHT: Record<AiGovernanceRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function assessGovernanceRisk(input: {
  employee: AiEmployeeRecord;
  toolRestrictions: AiGovernanceToolRestriction[];
  modelPolicy: AiGovernanceModelPolicy;
  providerPolicy: AiGovernanceProviderPolicy;
}): AiGovernanceRiskAssessment {
  const factors: AiGovernanceRiskAssessment["factors"] = [];

  const criticalTools = input.toolRestrictions.filter((tool) => tool.riskLevel === "critical" && tool.status === "allowed");
  if (criticalTools.length > 0) {
    factors.push({
      id: "tools",
      label: "Critical tools enabled",
      level: "critical",
      detail: criticalTools.map((tool) => tool.key).join(", "),
    });
  }

  const highTools = input.toolRestrictions.filter((tool) => tool.riskLevel === "high" && tool.status === "allowed");
  if (highTools.length > 0) {
    factors.push({
      id: "tools-high",
      label: "High-risk tools enabled",
      level: "high",
      detail: highTools.map((tool) => tool.key).join(", "),
    });
  }

  if (input.employee.model && input.modelPolicy.blockedModels.includes(input.employee.model)) {
    factors.push({
      id: "model",
      label: "Blocked model in use",
      level: "high",
      detail: input.employee.model,
    });
  }

  if (input.employee.provider && input.providerPolicy.blockedProviders.includes(input.employee.provider)) {
    factors.push({
      id: "provider",
      label: "Blocked provider in use",
      level: "high",
      detail: input.employee.provider,
    });
  }

  if (input.employee.knowledgeSourceIds.length === 0) {
    factors.push({
      id: "knowledge",
      label: "No knowledge sources",
      level: "medium",
      detail: "Knowledge access not configured",
    });
  }

  if (input.employee.runtimeConfiguration.runtimeFlags.memoryMode === "none") {
    factors.push({
      id: "memory",
      label: "Memory disabled",
      level: "low",
      detail: "Session memory not active",
    });
  }

  if (input.employee.status !== "published") {
    factors.push({
      id: "lifecycle",
      label: "Unpublished employee",
      level: "medium",
      detail: `Status: ${input.employee.status}`,
    });
  }

  if (factors.length === 0) {
    return { level: "low", score: 95, factors: [{ id: "baseline", label: "Baseline compliance", level: "low", detail: "No elevated risks detected" }] };
  }

  const maxWeight = Math.max(...factors.map((factor) => RISK_WEIGHT[factor.level]));
  const score = Math.max(0, 100 - maxWeight * 20);
  const level: AiGovernanceRiskLevel =
    maxWeight >= 4 ? "critical" : maxWeight >= 3 ? "high" : maxWeight >= 2 ? "medium" : "low";

  return { level, score, factors };
}

export function buildComplianceSnapshot(policies: AiGovernancePolicyRecord[]): AiGovernanceComplianceSnapshot {
  const dataPolicy = policies.find((entry) => entry.category === "data");
  const compliancePolicy = policies.find((entry) => entry.category === "compliance");
  const dataConfig = dataPolicy?.config ?? {};
  const complianceConfig = compliancePolicy?.config ?? {};

  const gdprEnabled = Boolean(dataConfig.gdprEnabled ?? complianceConfig.gdprEnabled);
  const auditStatusRaw = complianceConfig.auditStatus;
  const auditStatus =
    auditStatusRaw === "non_compliant" || auditStatusRaw === "review_required"
      ? auditStatusRaw
      : "compliant";

  return {
    gdprEnabled,
    auditStatus,
    retentionDays: typeof dataConfig.retentionDays === "number" ? dataConfig.retentionDays : 90,
    privacyRules: readStringArray(dataConfig.privacyRules),
    securityControls: readStringArray(complianceConfig.securityControls),
  };
}

export function mapApprovals(
  rows: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    entity_label: string;
    approval_type: AiGovernanceApprovalRecord["approvalType"];
    status: AiGovernanceApprovalRecord["status"];
    created_at: string;
    reviewed_at: string | null;
  }>,
): AiGovernanceApprovalRecord[] {
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type as AiGovernanceApprovalRecord["entityType"],
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    approvalType: row.approval_type,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));
}

export function mapViolations(
  rows: Array<{
    id: string;
    employee_id: string | null;
    policy_id: string | null;
    violation_type: string;
    severity: AiGovernanceRiskLevel;
    message: string;
    resolved: boolean;
    created_at: string;
  }>,
): AiGovernanceViolationRecord[] {
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    policyId: row.policy_id,
    violationType: row.violation_type,
    severity: row.severity,
    message: row.message,
    resolved: row.resolved,
    createdAt: row.created_at,
  }));
}

export function mapAuditTrail(
  rows: Array<{
    id: string;
    employee_id: string | null;
    policy_id: string | null;
    event_type: AiGovernanceAuditRecord["eventType"];
    metadata: Record<string, unknown>;
    created_at: string;
    created_by: string | null;
  }>,
): AiGovernanceAuditRecord[] {
  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    employeeId: row.employee_id,
    policyId: row.policy_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

export function buildGovernanceDashboard(input: {
  policies: AiGovernancePolicyRecord[];
  violations: AiGovernanceViolationRecord[];
  approvals: AiGovernanceApprovalRecord[];
  riskAssessment: AiGovernanceRiskAssessment;
  compliance: AiGovernanceComplianceSnapshot;
}): AiGovernanceDashboardSnapshot {
  const pendingApprovals = input.approvals.filter((approval) => approval.status === "pending").length;
  const openViolations = input.violations.filter((violation) => !violation.resolved).length;
  const complianceScore =
    input.compliance.auditStatus === "compliant" ? 95 : input.compliance.auditStatus === "review_required" ? 70 : 40;

  return {
    policyCount: input.policies.filter((policy) => policy.status !== "archived").length,
    violationCount: openViolations,
    pendingApprovals,
    complianceScore,
    riskScore: input.riskAssessment.score,
  };
}

export function buildGovernanceSnapshot(input: {
  employee: AiEmployeeRecord;
  policyRows: AiGovernancePolicyDbRow[];
  employees: AiEmployeeRecord[];
  skills: AiSkillRecord[];
  toolCatalog: ToolMetadataEntry[];
  approvalRows: Parameters<typeof mapApprovals>[0];
  violationRows: Parameters<typeof mapViolations>[0];
  auditRows: Parameters<typeof mapAuditTrail>[0];
}): AiGovernancePlatformSnapshot {
  const policies = mapGovernancePolicies(input.policyRows);
  const modelPolicy = extractModelPolicy(policies);
  const providerPolicy = extractProviderPolicy(policies);
  const promptPolicies = buildPromptPolicies(input.employees);
  const toolRestrictions = buildToolRestrictions(input.toolCatalog, input.employee, policies);
  const skillPolicies = buildSkillPolicies(input.skills);
  const riskAssessment = assessGovernanceRisk({
    employee: input.employee,
    toolRestrictions,
    modelPolicy,
    providerPolicy,
  });
  const compliance = buildComplianceSnapshot(policies);
  const approvalRules = policies.filter((policy) => policy.category === "approval");
  const approvals = mapApprovals(input.approvalRows);
  const violations = mapViolations(input.violationRows);
  const auditTrail = mapAuditTrail(input.auditRows);
  const dashboard = buildGovernanceDashboard({ policies, violations, approvals, riskAssessment, compliance });

  return {
    policies,
    modelPolicy,
    providerPolicy,
    promptPolicies,
    toolRestrictions,
    skillPolicies,
    riskAssessment,
    compliance,
    approvalRules,
    approvals,
    violations,
    auditTrail,
    dashboard,
  };
}

export function detectGovernanceViolations(input: {
  employee: AiEmployeeRecord;
  modelPolicy: AiGovernanceModelPolicy;
  providerPolicy: AiGovernanceProviderPolicy;
  toolRestrictions: AiGovernanceToolRestriction[];
}): Array<{ violationType: string; severity: AiGovernanceRiskLevel; message: string }> {
  const violations: Array<{ violationType: string; severity: AiGovernanceRiskLevel; message: string }> = [];

  if (input.employee.model && input.modelPolicy.blockedModels.includes(input.employee.model)) {
    violations.push({
      violationType: "blocked_model",
      severity: "high",
      message: `Model ${input.employee.model} is blocked by governance policy`,
    });
  }

  if (input.employee.provider && input.providerPolicy.blockedProviders.includes(input.employee.provider)) {
    violations.push({
      violationType: "blocked_provider",
      severity: "high",
      message: `Provider ${input.employee.provider} is blocked by governance policy`,
    });
  }

  for (const tool of input.toolRestrictions.filter((entry) => entry.riskLevel === "critical" && entry.status === "allowed")) {
    violations.push({
      violationType: "critical_tool_allowed",
      severity: "critical",
      message: `Critical tool ${tool.key} is allowed`,
    });
  }

  return violations;
}
