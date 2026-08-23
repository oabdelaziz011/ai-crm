import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import {
  buildAlerts,
  buildControlTowerSnapshot,
  buildGlobalOverview,
  filterEmployees,
} from "./selectors/administration-selectors.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import type { AiControlTowerLoadInput } from "./types/administration-types.js";
import type { AiGovernancePlatformSnapshot } from "./types/governance-types.js";
import type { AiEmployeeOperationsSnapshot } from "./types/operations-types.js";

const baseRow: AiEmployeeDbRow = {
  id: "agent-admin-1",
  company_id: "company-1",
  name: "support-agent",
  display_name: "Support Agent",
  description: "Handles support tickets",
  avatar: null,
  department: "Support",
  owner_id: "user-1",
  status: "published",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "You are a support agent.",
  system_prompt_summary: "You are a support agent.",
  welcome_message: "",
  knowledge_source_ids: ["kb-1"],
  knowledge_summary: "1 source",
  allowed_tool_keys: ["knowledge_lookup"],
  tool_summary: "1 tool",
  allowed_skill_ids: ["skill-1"],
  skills_summary: "Support Skill",
  tags: [],
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
  deleted_at: null,
  created_by: null,
  updated_by: null,
  prompt_version_label: "v1",
  runtime_configuration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  published_version_id: "version-1",
  current_version_number: 1,
  has_unpublished_draft: false,
};

const draftRow: AiEmployeeDbRow = {
  ...baseRow,
  id: "agent-admin-2",
  name: "draft-agent",
  display_name: "Draft Agent",
  description: "Sales outreach assistant",
  department: "Sales",
  status: "draft",
};

function mockGovernance(partial: Partial<AiGovernancePlatformSnapshot> = {}): AiGovernancePlatformSnapshot {
  return {
    policies: [],
    modelPolicy: { allowedModels: [], blockedModels: [], defaultModel: null, departmentRestrictions: {} },
    providerPolicy: { allowedProviders: ["openai"], blockedProviders: [], defaultProvider: "openai" },
    promptPolicies: [],
    toolRestrictions: [],
    skillPolicies: [],
    riskAssessment: { level: "low", score: 10, factors: [] },
    compliance: {
      gdprEnabled: true,
      auditStatus: "compliant",
      retentionDays: 90,
      privacyRules: [],
      securityControls: [],
    },
    approvalRules: [],
    approvals: [],
    violations: [],
    auditTrail: [],
    dashboard: {
      policyCount: 0,
      violationCount: 0,
      pendingApprovals: 0,
      complianceScore: 70,
      riskScore: 10,
    },
    ...partial,
  };
}

function mockOperations(partial: Partial<AiEmployeeOperationsSnapshot> = {}): AiEmployeeOperationsSnapshot {
  return {
    metrics: {
      executionsToday: 0,
      successRate: 0,
      averageRuntimeMs: null,
      averageQueueTimeMs: null,
      retryCount: 0,
      timeoutCount: 0,
    },
    runtimeStatus: {
      presence: "offline",
      lastHeartbeat: null,
      currentExecutionId: null,
      currentExecutionLabel: null,
      queueLength: 0,
      isPaused: false,
    },
    queue: { pending: 0, running: 0, completed: 0, failed: 0 },
    runningExecutions: [],
    toolLogs: [],
    knowledgeUsage: {
      retrievalCount: 0,
      documentsUsed: 0,
      averageConfidence: null,
      averageDurationMs: null,
      successRate: 0,
    },
    errors: [],
    costs: {
      estimatedDailyCost: 0,
      estimatedMonthlyCost: 0,
      promptTokens: 0,
      completionTokens: 0,
      requests: 0,
      currency: "USD",
    },
    timeline: [],
    ...partial,
  };
}

function createLoadInput(partial: Partial<AiControlTowerLoadInput> = {}): AiControlTowerLoadInput {
  const focusEmployee = mapAiEmployeeRow(baseRow);
  const employees = [focusEmployee, mapAiEmployeeRow(draftRow)];

  return {
    companyId: "company-1",
    focusEmployee,
    employees,
    operations: null,
    memory: null,
    skills: null,
    collaboration: null,
    governance: null,
    ...partial,
  };
}

describe("AiEmployee administration selectors", () => {
  it("builds global overview from employee registry", () => {
    const overview = buildGlobalOverview(createLoadInput());
    assert.equal(overview.employeeCount, 2);
    assert.equal(overview.activeRuntimeCount, 1);
  });

  it("filters employees by search, status, and department", () => {
    const snapshot = buildControlTowerSnapshot(createLoadInput());
    assert.equal(filterEmployees(snapshot.employees, { search: "support" }).length, 1);
    assert.equal(filterEmployees(snapshot.employees, { status: "draft" }).length, 1);
    assert.equal(filterEmployees(snapshot.employees, { department: "Sales" }).length, 1);
    assert.equal(filterEmployees(snapshot.employees, { search: "missing" }).length, 0);
  });

  it("builds a complete control tower snapshot", () => {
    const snapshot = buildControlTowerSnapshot(createLoadInput());
    assert.ok(snapshot.globalOverview);
    assert.equal(snapshot.employees.length, 2);
    assert.ok(snapshot.skillsAdmin);
    assert.ok(snapshot.runtimeAdmin);
    assert.ok(snapshot.healthDashboard);
  });

  it("creates governance violation alerts", () => {
    const alerts = buildAlerts(
      createLoadInput({
        governance: mockGovernance({
          dashboard: {
            policyCount: 2,
            violationCount: 3,
            complianceScore: 60,
            riskScore: 40,
            pendingApprovals: 1,
          },
          riskAssessment: { level: "high", score: 72, factors: [] },
        }),
      }),
    );

    assert.ok(alerts.some((alert) => alert.id === "gov-violations"));
    assert.ok(alerts.some((alert) => alert.id === "gov-risk"));
  });

  it("derives health dashboard from operations and governance scores", () => {
    const snapshot = buildControlTowerSnapshot(
      createLoadInput({
        operations: mockOperations({
          metrics: {
            executionsToday: 12,
            successRate: 95,
            averageRuntimeMs: 1200,
            averageQueueTimeMs: null,
            retryCount: 0,
            timeoutCount: 0,
          },
          runtimeStatus: {
            presence: "online",
            lastHeartbeat: "2026-08-01T10:00:00.000Z",
            currentExecutionId: null,
            currentExecutionLabel: null,
            queueLength: 0,
            isPaused: false,
          },
          queue: { pending: 0, running: 1, completed: 10, failed: 1 },
          costs: {
            estimatedDailyCost: 4.5,
            estimatedMonthlyCost: 135,
            promptTokens: 1000,
            completionTokens: 500,
            requests: 12,
            currency: "USD",
          },
        }),
        governance: mockGovernance({
          dashboard: {
            policyCount: 1,
            violationCount: 0,
            complianceScore: 90,
            riskScore: 10,
            pendingApprovals: 0,
          },
        }),
      }),
    );

    assert.equal(snapshot.globalOverview.executionsToday, 12);
    assert.equal(snapshot.healthDashboard.overallHealth, "healthy");
    assert.ok(snapshot.healthDashboard.healthScore >= 80);
  });
});
