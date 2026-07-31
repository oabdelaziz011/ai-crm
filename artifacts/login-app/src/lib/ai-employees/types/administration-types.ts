import type { AiEmployeeRecord } from "./ai-employee-types";
import type { AiEmployeeCollaborationSnapshot } from "./collaboration-types";
import type { AiGovernancePlatformSnapshot } from "./governance-types";
import type { AiEmployeeMemorySnapshot } from "./memory-types";
import type { AiEmployeeOperationsSnapshot } from "./operations-types";
import type { AiSkillPlatformSnapshot } from "./skill-types";

export type AiControlTowerAlertSeverity = "info" | "warning" | "critical";

export type AiControlTowerAlert = {
  id: string;
  severity: AiControlTowerAlertSeverity;
  label: string;
  source: string;
  timestamp: string;
};

export type AiControlTowerGlobalOverview = {
  employeeCount: number;
  skillCount: number;
  activeRuntimeCount: number;
  executionsToday: number;
  successRate: number;
  healthScore: number;
};

export type AiControlTowerEmployeeAdminEntry = {
  employee: AiEmployeeRecord;
  status: AiEmployeeRecord["status"];
  owner: string | null;
  department: string | null;
  healthScore: number;
};

export type AiControlTowerSkillsAdmin = {
  totalSkills: number;
  publishedSkills: number;
  assignedSkills: number;
  totalAssignments: number;
  usageCount: number;
};

export type AiControlTowerRuntimeAdmin = {
  online: number;
  offline: number;
  busy: number;
  queueLength: number;
  workers: number;
};

export type AiControlTowerProviderAdmin = {
  providers: Array<{ key: string; health: string; usageCount: number }>;
  models: string[];
  defaultProvider: string | null;
};

export type AiControlTowerCostAdmin = {
  dailyCost: number;
  monthlyCost: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  currency: string;
};

export type AiControlTowerMemoryAdmin = {
  memoryUsagePercent: number;
  contextSizeTokens: number;
  retrievalCount: number;
  storedMemories: number;
};

export type AiControlTowerCollaborationAdmin = {
  groupCount: number;
  handoverCount: number;
  handoverSuccessRate: number;
  failureCount: number;
};

export type AiControlTowerGovernanceAdmin = {
  policyCount: number;
  violationCount: number;
  complianceScore: number;
  riskScore: number;
  riskLevel: string;
};

export type AiControlTowerExecutionAdmin = {
  totalExecutions: number;
  running: number;
  completed: number;
  failed: number;
};

export type AiControlTowerTokenAdmin = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiControlTowerCapacityAdmin = {
  utilizationPercent: number;
  maxConcurrency: number;
  activeWorkers: number;
  licenseSeats: number;
  usedSeats: number;
};

export type AiControlTowerHealthDashboard = {
  overallHealth: "healthy" | "degraded" | "critical";
  healthScore: number;
  alerts: AiControlTowerAlert[];
  warnings: string[];
  recommendations: string[];
};

export type AiControlTowerSnapshot = {
  globalOverview: AiControlTowerGlobalOverview;
  employees: AiControlTowerEmployeeAdminEntry[];
  skillsAdmin: AiControlTowerSkillsAdmin;
  runtimeAdmin: AiControlTowerRuntimeAdmin;
  providerAdmin: AiControlTowerProviderAdmin;
  costAdmin: AiControlTowerCostAdmin;
  memoryAdmin: AiControlTowerMemoryAdmin;
  collaborationAdmin: AiControlTowerCollaborationAdmin;
  governanceAdmin: AiControlTowerGovernanceAdmin;
  executionAdmin: AiControlTowerExecutionAdmin;
  tokenAdmin: AiControlTowerTokenAdmin;
  capacityAdmin: AiControlTowerCapacityAdmin;
  healthDashboard: AiControlTowerHealthDashboard;
};

export type AiControlTowerLoadInput = {
  companyId: string;
  focusEmployee: AiEmployeeRecord;
  employees: AiEmployeeRecord[];
  operations: AiEmployeeOperationsSnapshot | null;
  memory: AiEmployeeMemorySnapshot | null;
  skills: AiSkillPlatformSnapshot | null;
  collaboration: AiEmployeeCollaborationSnapshot | null;
  governance: AiGovernancePlatformSnapshot | null;
};
