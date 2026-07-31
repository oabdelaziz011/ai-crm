import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareEmployeeVersionSnapshots, employeeToVersionSnapshot } from "./selectors/lifecycle-selectors.js";
import {
  buildReadinessScore,
  buildValidationResult,
  hasBlockingPublishIssues,
} from "./services/ai-employee-validation-service.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";

const sampleRow: AiEmployeeDbRow = {
  id: "agent-1",
  company_id: "company-1",
  name: "support-agent",
  display_name: "Support Agent",
  description: "Handles tier-1 support",
  avatar: null,
  department: "Support",
  owner_id: "user-1",
  status: "published",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "You are a helpful support agent.",
  system_prompt_summary: "You are a helpful support agent.",
  knowledge_source_ids: ["kb-1"],
  knowledge_summary: "1 knowledge source",
  allowed_tool_keys: ["knowledge_lookup"],
  tool_summary: "knowledge_lookup",
  allowed_skill_ids: [],
  skills_summary: "No skills assigned",
  tags: ["support"],
  created_at: "2026-07-31T10:00:00.000Z",
  updated_at: "2026-07-31T12:00:00.000Z",
  deleted_at: null,
  created_by: "user-1",
  updated_by: "user-1",
  prompt_version_label: "v1",
  runtime_configuration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  published_version_id: "version-1",
  current_version_number: 1,
  has_unpublished_draft: false,
};

describe("AiEmployee lifecycle selectors", () => {
  it("creates version snapshots from employee records", () => {
    const employee = mapAiEmployeeRow(sampleRow, "Jane Admin");
    const snapshot = employeeToVersionSnapshot(employee);
    assert.equal(snapshot.displayName, "Support Agent");
    assert.deepEqual(snapshot.knowledgeSourceIds, ["kb-1"]);
  });

  it("compares version snapshots by section", () => {
    const left = employeeToVersionSnapshot(mapAiEmployeeRow(sampleRow));
    const right = employeeToVersionSnapshot(
      mapAiEmployeeRow({
        ...sampleRow,
        system_prompt: "Updated prompt",
      }),
    );
    const comparison = compareEmployeeVersionSnapshots(left, right, 1, 2);
    const promptSection = comparison.sections.find((section) => section.section === "prompt");
    assert.equal(promptSection?.changed, true);
  });
});

describe("AiEmployee validation service", () => {
  it("builds structured validation and readiness results", () => {
    const preview = {
      ready: false,
      validationIssues: [
        {
          field: "provider",
          code: "missing_provider",
          message: "Provider connection required",
          severity: "error" as const,
        },
      ],
      prompt: { systemPrompt: "", systemPromptSummary: "", promptVersionLabel: "v1", estimatedTokens: 0, variables: [] },
      provider: { provider: "openai", providerConnectionId: null, providerConnectionName: null, apiStatus: "missing" as const },
      model: { model: null, temperature: 0.7, maxTokens: 4096, availableModels: [], capabilities: { reasoning: false, vision: false, functionCalling: false, streaming: false, contextWindow: 0, maxOutputTokens: 0 } },
      knowledge: { enabled: false, sourceIds: [], sourceLabels: [], collectionLabel: null, documentsSummary: "", retrievalPolicy: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION.retrievalPolicy },
      tools: { enabledKeys: [], disabledKeys: [], allowedKeys: [], catalog: [] },
      limits: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
      runtimeFlags: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION.runtimeFlags,
      runtimeInfo: { currentRuntime: "Agent Runtime", executionStatus: "inactive" as const, coordinator: "Runtime Coordinator", memoryMode: "session" as const, checkpointStatus: "disabled" as const, confirmationPolicy: "destructive" as const, recoveryEnabled: true },
      channelRuntime: null,
    };

    const validation = buildValidationResult(preview);
    const readiness = buildReadinessScore(preview);

    assert.equal(hasBlockingPublishIssues(validation), true);
    assert.equal(readiness.ready, false);
    assert.ok(readiness.score < 100);
    assert.equal(validation.issues[0]?.category, "provider");
  });
});
