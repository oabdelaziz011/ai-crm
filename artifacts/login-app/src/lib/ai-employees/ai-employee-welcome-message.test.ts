import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentRuntimeConfiguration } from "./adapters/ai-employee-runtime-adapter.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import {
  DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE,
  resolveAiEmployeeWelcomeMessage,
} from "./utilities/resolve-ai-employee-welcome-message.js";
import {
  formValuesToInsert,
  formValuesToUpdate,
  recordToFormValues,
} from "./validators/ai-employee-validators.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";

const sampleRow: AiEmployeeDbRow = {
  id: "agent-welcome-1",
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
  welcome_message: "",
  knowledge_source_ids: [],
  knowledge_summary: "0 knowledge sources",
  allowed_tool_keys: [],
  tool_summary: "0 tools assigned",
  allowed_skill_ids: [],
  skills_summary: "No skills assigned",
  tags: [],
  created_at: "2026-07-31T10:00:00.000Z",
  updated_at: "2026-07-31T12:00:00.000Z",
  deleted_at: null,
  created_by: "user-1",
  updated_by: "user-1",
  prompt_version_label: "v1",
  runtime_configuration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  published_version_id: null,
  current_version_number: 0,
  has_unpublished_draft: true,
};

function buildRuntimePreview(welcomeMessage: string) {
  return buildAgentRuntimeConfiguration({
    employee: {
      id: "agent-welcome-1",
      name: "support-agent",
      displayName: "Support Agent",
      status: "published",
      provider: "openai",
      model: "gpt-4.1",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: "You are a helpful support agent.",
      systemPromptSummary: "You are a helpful support agent.",
      welcomeMessage,
      knowledgeSourceIds: [],
      allowedToolKeys: [],
      promptVersionLabel: "v1",
      runtimeConfiguration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
    },
    tenantRuntime: {
      providerConnectionId: "provider-conn-1",
      providerConnectionName: "OpenAI Default",
      providerRegistryKey: "openai",
      knowledgeRetrieval: null,
      missing: [],
    },
    knowledgeSources: [],
    toolCatalog: [],
    availableModels: ["gpt-4.1"],
  });
}

describe("AI Employee welcome message persistence", () => {
  it("maps welcome_message from database rows", () => {
    const custom = "أهلاً يا عميل ValueOR 👋";
    const record = mapAiEmployeeRow({ ...sampleRow, welcome_message: custom });
    assert.equal(record.welcomeMessage, custom);
  });

  it("round-trips welcome message through form validators", () => {
    const custom = "أهلاً يا عميل ValueOR 👋\nكيف يمكنني مساعدتك اليوم؟";
    const form = recordToFormValues(mapAiEmployeeRow({ ...sampleRow, welcome_message: custom }));
    assert.equal(form.welcomeMessage, custom);
    assert.equal(formValuesToUpdate(form, []).welcome_message, custom);
    assert.equal(formValuesToInsert("company-1", form, []).welcome_message, custom);
  });

  it("uses the platform default when storage is empty", () => {
    const record = mapAiEmployeeRow(sampleRow);
    assert.equal(resolveAiEmployeeWelcomeMessage(record.welcomeMessage), DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
  });
});

describe("AI Employee welcome message runtime wiring", () => {
  it("puts resolved welcome message on channel pageContext", () => {
    const custom = "أهلاً يا عميل ValueOR 👋\nكيف يمكنني مساعدتك اليوم؟";
    const preview = buildRuntimePreview(custom);
    assert.equal(preview.channelRuntime?.pageContext.welcomeMessage, custom);
    assert.match(preview.channelRuntime?.pageContext.systemPrompt ?? "", /CRITICAL FIRST-CONTACT WELCOME RULES/);
    assert.match(preview.channelRuntime?.pageContext.systemPrompt ?? "", /أهلاً يا عميل ValueOR/);
  });

  it("falls back to the platform default in runtime when storage is empty", () => {
    const preview = buildRuntimePreview("");
    assert.equal(preview.channelRuntime?.pageContext.welcomeMessage, DEFAULT_AI_EMPLOYEE_WELCOME_MESSAGE);
  });
});
