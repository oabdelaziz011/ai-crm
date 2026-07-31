import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSkillAnalytics,
  buildSkillReadiness,
  buildSkillValidation,
  detectCircularDependencies,
  mapSkillRow,
  resolveEffectiveToolKeys,
  resolveToolsFromSkills,
  wouldCreateCircularDependency,
} from "./selectors/skill-selectors.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import type { AiSkillDbRow } from "./types/skill-types.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";

const employeeRow: AiEmployeeDbRow = {
  id: "agent-skills-1",
  company_id: "company-1",
  name: "sales-agent",
  display_name: "Sales Agent",
  description: "Sales automation",
  avatar: null,
  department: "Sales",
  owner_id: null,
  status: "published",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "You are a sales agent.",
  system_prompt_summary: "You are a sales agent.",
  knowledge_source_ids: ["kb-1"],
  knowledge_summary: "1 source",
  allowed_tool_keys: ["knowledge_lookup"],
  tool_summary: "knowledge_lookup",
  allowed_skill_ids: ["skill-crm", "skill-sales"],
  skills_summary: "CRM Skill, Sales Skill",
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

const skillRow: AiSkillDbRow = {
  id: "skill-crm",
  company_id: "company-1",
  key: "crm-skill",
  name: "crm-skill",
  display_name: "CRM Skill",
  description: "CRM workflows",
  category: "sales",
  tags: ["crm"],
  tool_keys: ["search_customers", "create_customer"],
  required_permissions: ["customers.view"],
  required_knowledge_ids: ["kb-1"],
  runtime_recommendations: { memoryMode: "session" },
  documentation: { overview: "CRM capability group", inputs: ["customerId"], outputs: ["customerRecord"] },
  status: "published",
  published_version_id: "version-skill-1",
  current_version_number: 1,
  has_unpublished_draft: false,
  deleted_at: null,
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
  created_by: null,
  updated_by: null,
};

describe("AiEmployee skills selectors", () => {
  it("maps skill rows and resolves tool keys from skills", () => {
    const skill = mapSkillRow(skillRow);
    const salesSkill = mapSkillRow({
      ...skillRow,
      id: "skill-sales",
      key: "sales-skill",
      display_name: "Sales Skill",
      tool_keys: ["knowledge_lookup"],
    });

    const toolKeys = resolveToolsFromSkills([skill, salesSkill]);
    assert.ok(toolKeys.includes("search_customers"));
    assert.ok(toolKeys.includes("knowledge_lookup"));
  });

  it("resolves effective tool keys including dependencies", () => {
    const crmSkill = mapSkillRow(skillRow);
    const knowledgeSkill = mapSkillRow({
      ...skillRow,
      id: "skill-knowledge",
      key: "knowledge-skill",
      display_name: "Knowledge Skill",
      tool_keys: ["knowledge_lookup"],
    });

    const allSkillsById = new Map([
      [crmSkill.id, crmSkill],
      [knowledgeSkill.id, knowledgeSkill],
    ]);

    const effective = resolveEffectiveToolKeys(
      ["knowledge_lookup"],
      [crmSkill],
      allSkillsById,
      [{ skillId: crmSkill.id, dependsOnSkillId: knowledgeSkill.id }],
    );

    assert.ok(effective.includes("search_customers"));
    assert.ok(effective.includes("knowledge_lookup"));
  });

  it("detects circular skill dependencies", () => {
    const edges = [
      { skillId: "a", dependsOnSkillId: "b" },
      { skillId: "b", dependsOnSkillId: "c" },
      { skillId: "c", dependsOnSkillId: "a" },
    ];

    assert.ok(detectCircularDependencies("a", edges).length > 0);
    assert.ok(wouldCreateCircularDependency("x", "y", [{ skillId: "y", dependsOnSkillId: "x" }]));
  });

  it("builds skill validation, readiness, and analytics", () => {
    const skill = mapSkillRow(skillRow);
    const validation = buildSkillValidation({
      skill,
      knownToolKeys: new Set(["search_customers", "create_customer"]),
      knownKnowledgeIds: new Set(["kb-1"]),
      dependencyEdges: [],
    });

    assert.equal(validation.ready, true);

    const readiness = buildSkillReadiness({
      skill,
      validation,
      dependencyCount: 0,
      toolCatalog: [
        {
          key: "search_customers",
          displayName: "Search Customers",
          category: "crm",
          classification: "read_only",
          requiredPermissions: ["customers.view"],
          riskLevel: "low",
        },
      ],
    });

    assert.ok(readiness.score >= 50);

    const analytics = buildSkillAnalytics({
      assignmentCount: 3,
      toolExecutions: [
        { tool_key: "search_customers", status: "success", duration_ms: 120 },
        { tool_key: "search_customers", status: "failed", duration_ms: 80 },
      ],
      skillToolKeys: skill.toolKeys,
    });

    assert.equal(analytics.assignmentCount, 3);
    assert.equal(analytics.usageCount, 2);
    assert.equal(analytics.failureCount, 1);
  });

  it("maps employee skill assignment fields", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    assert.deepEqual(employee.allowedSkillIds, ["skill-crm", "skill-sales"]);
    assert.equal(employee.skillsSummary, "CRM Skill, Sales Skill");
  });
});
