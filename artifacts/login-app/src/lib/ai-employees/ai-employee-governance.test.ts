import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessGovernanceRisk,
  buildComplianceSnapshot,
  buildGovernanceDashboard,
  buildGovernanceSnapshot,
  buildPromptPolicies,
  buildSkillPolicies,
  buildToolRestrictions,
  detectGovernanceViolations,
  extractModelPolicy,
  extractProviderPolicy,
  mapGovernancePolicy,
} from "./selectors/governance-selectors.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import type { AiGovernancePolicyDbRow } from "./types/governance-types.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";
import type { AiSkillDbRow } from "./types/skill-types.js";

const employeeRow: AiEmployeeDbRow = {
  id: "agent-gov-1",
  company_id: "company-1",
  name: "support-agent",
  display_name: "Support Agent",
  description: "Handles support",
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
  knowledge_source_ids: ["kb-1"],
  knowledge_summary: "1 source",
  allowed_tool_keys: ["knowledge_lookup", "refund_payment"],
  tool_summary: "2 tools",
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

const modelPolicyRow: AiGovernancePolicyDbRow = {
  id: "policy-model",
  company_id: "company-1",
  key: "default-model-policy",
  name: "default-model-policy",
  display_name: "Default Model Policy",
  description: "",
  category: "model",
  config: {
    allowedModels: ["gpt-4.1", "gpt-4o"],
    blockedModels: ["gpt-3.5-turbo"],
    defaultModel: "gpt-4.1",
    departmentRestrictions: { Support: ["gpt-4o"] },
  },
  status: "published",
  owner_id: null,
  department: null,
  version_number: 1,
  deleted_at: null,
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
  created_by: null,
  updated_by: null,
};

describe("AiEmployee governance selectors", () => {
  it("maps governance policies and extracts model/provider config", () => {
    const policy = mapGovernancePolicy(modelPolicyRow);
    assert.equal(policy.category, "model");

    const policies = [policy];
    const modelPolicy = extractModelPolicy(policies);
    assert.ok(modelPolicy.allowedModels.includes("gpt-4.1"));

    const providerPolicy = extractProviderPolicy([
      mapGovernancePolicy({
        ...modelPolicyRow,
        id: "policy-provider",
        category: "provider",
        config: { allowedProviders: ["openai", "anthropic"], blockedProviders: [], defaultProvider: "openai" },
      }),
    ]);
    assert.ok(providerPolicy.allowedProviders.includes("openai"));
  });

  it("builds tool restrictions and skill policies", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const toolCatalog = [
      {
        key: "knowledge_lookup",
        displayName: "Knowledge Lookup",
        category: "knowledge",
        classification: "read_only" as const,
        requiredPermissions: [],
        riskLevel: "low" as const,
      },
      {
        key: "refund_payment",
        displayName: "Refund Payment",
        category: "billing",
        classification: "requires_confirmation" as const,
        requiredPermissions: ["billing.refund"],
        riskLevel: "critical" as const,
      },
    ];

    const restrictions = buildToolRestrictions(toolCatalog, employee, [
      mapGovernancePolicy({
        ...modelPolicyRow,
        id: "policy-tool",
        category: "tool",
        config: { blockedTools: [], confirmationRequired: ["refund_payment"] },
      }),
    ]);

    assert.ok(restrictions.some((tool) => tool.key === "refund_payment" && tool.status === "confirmation_required"));

    const skillRow: AiSkillDbRow = {
      id: "skill-1",
      company_id: "company-1",
      key: "support-skill",
      name: "support-skill",
      display_name: "Support Skill",
      description: "",
      category: "support",
      tags: [],
      tool_keys: ["knowledge_lookup"],
      required_permissions: [],
      required_knowledge_ids: [],
      runtime_recommendations: {},
      documentation: {},
      status: "published",
      published_version_id: null,
      current_version_number: 1,
      has_unpublished_draft: false,
      deleted_at: null,
      created_at: "2026-08-01T08:00:00.000Z",
      updated_at: "2026-08-01T09:00:00.000Z",
      created_by: null,
      updated_by: null,
    };

    const skillPolicies = buildSkillPolicies([
      {
        id: skillRow.id,
        key: skillRow.key,
        name: skillRow.name,
        displayName: skillRow.display_name,
        description: "",
        category: "support",
        tags: [],
        toolKeys: ["knowledge_lookup"],
        requiredPermissions: [],
        requiredKnowledgeIds: [],
        runtimeRecommendations: {},
        documentation: {},
        status: "published",
        publishedVersionId: null,
        currentVersionNumber: 1,
        hasUnpublishedDraft: false,
        createdAt: skillRow.created_at,
        updatedAt: skillRow.updated_at,
      },
    ]);
    assert.equal(skillPolicies[0]?.status, "approved");
  });

  it("assesses governance risk and detects violations", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const modelPolicy = extractModelPolicy([mapGovernancePolicy(modelPolicyRow)]);
    const providerPolicy = extractProviderPolicy([
      mapGovernancePolicy({
        ...modelPolicyRow,
        id: "policy-provider",
        category: "provider",
        config: { allowedProviders: ["openai"], blockedProviders: ["azure"], defaultProvider: "openai" },
      }),
    ]);

    const toolRestrictions = [
      { key: "refund_payment", displayName: "Refund", status: "allowed" as const, riskLevel: "critical" as const },
    ];

    const risk = assessGovernanceRisk({ employee, toolRestrictions, modelPolicy, providerPolicy });
    assert.equal(risk.level, "critical");

    const violations = detectGovernanceViolations({ employee, modelPolicy, providerPolicy, toolRestrictions });
    assert.ok(violations.some((entry) => entry.violationType === "critical_tool_allowed"));
  });

  it("builds prompt policies and compliance snapshot", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const draftEmployee = mapAiEmployeeRow({ ...employeeRow, has_unpublished_draft: true });
    const prompts = buildPromptPolicies([employee, draftEmployee]);
    assert.ok(prompts.some((entry) => entry.approvalState === "pending"));

    const compliance = buildComplianceSnapshot([
      mapGovernancePolicy({
        ...modelPolicyRow,
        id: "policy-data",
        category: "data",
        config: { gdprEnabled: true, retentionDays: 90, privacyRules: ["PII masking"] },
      }),
      mapGovernancePolicy({
        ...modelPolicyRow,
        id: "policy-compliance",
        category: "compliance",
        config: { gdprEnabled: true, auditStatus: "compliant", securityControls: ["RBAC"] },
      }),
    ]);

    assert.equal(compliance.gdprEnabled, true);
    assert.equal(compliance.auditStatus, "compliant");
  });

  it("builds full governance snapshot and dashboard", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const snapshot = buildGovernanceSnapshot({
      employee,
      policyRows: [modelPolicyRow],
      employees: [employee],
      skills: [],
      toolCatalog: [],
      approvalRows: [],
      violationRows: [],
      auditRows: [],
    });

    assert.ok(snapshot.policies.length > 0);
    assert.ok(snapshot.dashboard.policyCount >= 1);

    const dashboard = buildGovernanceDashboard({
      policies: snapshot.policies,
      violations: snapshot.violations,
      approvals: snapshot.approvals,
      riskAssessment: snapshot.riskAssessment,
      compliance: snapshot.compliance,
    });
    assert.ok(dashboard.complianceScore > 0);
  });
});
