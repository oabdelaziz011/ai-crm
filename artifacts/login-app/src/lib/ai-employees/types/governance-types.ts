export type AiGovernancePolicyCategory =
  | "ai_policy"
  | "model"
  | "provider"
  | "prompt"
  | "skill"
  | "tool"
  | "data"
  | "compliance"
  | "approval";

export type AiGovernancePolicyStatus = "draft" | "published" | "archived";

export type AiGovernanceRiskLevel = "low" | "medium" | "high" | "critical";

export type AiGovernanceApprovalType = "publish" | "prompt" | "skill" | "policy";

export type AiGovernanceApprovalStatus = "pending" | "approved" | "rejected";

export type AiGovernanceAuditEventType =
  | "policy_created"
  | "policy_updated"
  | "policy_published"
  | "policy_archived"
  | "policy_restored"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "violation_detected"
  | "violation_resolved"
  | "risk_assessed"
  | "compliance_checked";

export type AiGovernancePolicyDbRow = {
  id: string;
  company_id: string;
  key: string;
  name: string;
  display_name: string;
  description: string;
  category: AiGovernancePolicyCategory;
  config: Record<string, unknown>;
  status: AiGovernancePolicyStatus;
  owner_id: string | null;
  department: string | null;
  version_number: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type AiGovernancePolicyRecord = {
  id: string;
  key: string;
  name: string;
  displayName: string;
  description: string;
  category: AiGovernancePolicyCategory;
  config: Record<string, unknown>;
  status: AiGovernancePolicyStatus;
  ownerId: string | null;
  department: string | null;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
};

export type AiGovernanceModelPolicy = {
  allowedModels: string[];
  blockedModels: string[];
  defaultModel: string | null;
  departmentRestrictions: Record<string, string[]>;
};

export type AiGovernanceProviderPolicy = {
  allowedProviders: string[];
  blockedProviders: string[];
  defaultProvider: string | null;
};

export type AiGovernancePromptPolicyEntry = {
  employeeId: string;
  displayName: string;
  promptVersionLabel: string;
  approvalState: "draft" | "published" | "pending";
  ownerId: string | null;
  department: string | null;
};

export type AiGovernanceToolRestriction = {
  key: string;
  displayName: string;
  status: "allowed" | "blocked" | "confirmation_required";
  riskLevel: AiGovernanceRiskLevel;
};

export type AiGovernanceSkillPolicyEntry = {
  skillId: string;
  displayName: string;
  status: "approved" | "blocked" | "deprecated";
  category: string;
};

export type AiGovernanceRiskAssessment = {
  level: AiGovernanceRiskLevel;
  score: number;
  factors: Array<{ id: string; label: string; level: AiGovernanceRiskLevel; detail: string }>;
};

export type AiGovernanceComplianceSnapshot = {
  gdprEnabled: boolean;
  auditStatus: "compliant" | "review_required" | "non_compliant";
  retentionDays: number;
  privacyRules: string[];
  securityControls: string[];
};

export type AiGovernanceApprovalRecord = {
  id: string;
  entityType: "employee" | "prompt" | "skill" | "policy";
  entityId: string;
  entityLabel: string;
  approvalType: AiGovernanceApprovalType;
  status: AiGovernanceApprovalStatus;
  createdAt: string;
  reviewedAt: string | null;
};

export type AiGovernanceViolationRecord = {
  id: string;
  employeeId: string | null;
  policyId: string | null;
  violationType: string;
  severity: AiGovernanceRiskLevel;
  message: string;
  resolved: boolean;
  createdAt: string;
};

export type AiGovernanceAuditRecord = {
  id: string;
  eventType: AiGovernanceAuditEventType;
  employeeId: string | null;
  policyId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
};

export type AiGovernanceDashboardSnapshot = {
  policyCount: number;
  violationCount: number;
  pendingApprovals: number;
  complianceScore: number;
  riskScore: number;
};

export type AiGovernancePlatformSnapshot = {
  policies: AiGovernancePolicyRecord[];
  modelPolicy: AiGovernanceModelPolicy;
  providerPolicy: AiGovernanceProviderPolicy;
  promptPolicies: AiGovernancePromptPolicyEntry[];
  toolRestrictions: AiGovernanceToolRestriction[];
  skillPolicies: AiGovernanceSkillPolicyEntry[];
  riskAssessment: AiGovernanceRiskAssessment;
  compliance: AiGovernanceComplianceSnapshot;
  approvalRules: AiGovernancePolicyRecord[];
  approvals: AiGovernanceApprovalRecord[];
  violations: AiGovernanceViolationRecord[];
  auditTrail: AiGovernanceAuditRecord[];
  dashboard: AiGovernanceDashboardSnapshot;
};

export type AiGovernancePolicyFormValues = {
  key: string;
  name: string;
  displayName: string;
  description: string;
  category: AiGovernancePolicyCategory;
  config: Record<string, unknown>;
  department?: string | null;
};

export type CreateAiGovernancePolicyInput = {
  companyId: string;
  values: AiGovernancePolicyFormValues;
  actorId?: string | null;
};

export type UpdateAiGovernancePolicyInput = {
  policyId: string;
  companyId: string;
  values: Partial<AiGovernancePolicyFormValues>;
  actorId?: string | null;
};
