import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConversationBuilder,
  mergeBuilderSections,
  PolicyBuilder,
  ResponseContractBuilder,
  SystemPromptBuilder,
  ToolResultBuilder,
} from "../builders/prompt-builders.js";
import { PromptContextService } from "../services/prompt-context-service.js";
import { PromptOrchestratorService } from "../services/prompt-orchestrator-service.js";
import { PromptTemplateService } from "../services/prompt-template-service.js";
import type {
  PromptBuildRepository,
  PromptTemplateRepository,
  PromptTemplateVersionRepository,
} from "../repositories/prompt-repositories.js";
import type {
  PromptContextInput,
  PromptTemplateRecord,
  PromptTemplateVersionRecord,
  ServiceContext,
} from "../types.js";
import { composeFinalPrompt, orderPromptSections } from "../utils/compose-prompt.js";
import { PermissionDeniedError, PromptTemplateDisabledError } from "../errors.js";

const systemVersion: PromptTemplateVersionRecord = {
  id: "version-1",
  template_id: "template-1",
  version_number: 1,
  version_label: "1.0.0",
  sections: {
    output_contract: { enabled: true, title: "Output Contract", content: "Return structured JSON." },
  },
  output_contract: {
    format: "json",
    instructions: "Return JSON with reply, confidence, requires_human.",
    schema: {
      type: "object",
      properties: {
        reply: { type: "string" },
        confidence: { type: "number" },
        requires_human: { type: "boolean" },
      },
      required: ["reply"],
    },
  },
  change_notes: "Initial version",
  is_active: true,
  created_at: new Date().toISOString(),
  created_by: null,
};

const conversationTemplate: PromptTemplateRecord = {
  id: "template-1",
  company_id: null,
  key: "conversation_default",
  display_name: "Conversation Default",
  description: "System conversation template",
  template_type: "conversation",
  section_order: [
    "system_instructions",
    "assistant_profile",
    "recent_messages",
    "conversation_state",
    "intent_decision",
    "tool_results",
    "language",
    "tone",
    "output_contract",
  ],
  is_enabled: true,
  active_version_id: "version-1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "prompts.view" || code === "prompts.manage",
    ...overrides,
  };
}

function createSampleContext(): PromptContextInput {
  return {
    companyId: "company-1",
    conversationId: "conv-1",
    language: "English",
    tone: "professional",
    assistantProfile: { name: "Vault Assistant", personality: "helpful" },
    conversationState: "waiting_user",
    recentMessages: [{ role: "customer", content: "What are your hours?" }],
    intentDecision: {
      intent_key: "faq",
      confidence: 0.91,
      matched_tool: "faq",
      reason: "Matched FAQ intent",
    },
    toolResults: [{ tool_key: "faq", status: "succeeded", output: { answer: "9am-5pm" } }],
    companyPolicies: ["Always be accurate."],
    formattingRules: ["Keep responses concise."],
  };
}

function createEnvironment(options?: { template?: PromptTemplateRecord; version?: PromptTemplateVersionRecord }) {
  const template = options?.template ?? conversationTemplate;
  const version = options?.version ?? systemVersion;
  const builds: Array<Record<string, unknown>> = [];

  const templateRepository: PromptTemplateRepository = {
    list: async () => [template],
    findById: async (id) => (id === template.id ? template : null),
    findByKey: async (_companyId, key) => (key === template.key ? template : null),
    findByType: async (_companyId, type) => (type === template.template_type ? template : null),
    create: async (input) => ({
      id: "template-new",
      company_id: input.companyId,
      key: input.key,
      display_name: input.displayName,
      description: input.description ?? "",
      template_type: input.templateType,
      section_order: input.sectionOrder,
      is_enabled: true,
      active_version_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    updateEnabled: async (templateId, isEnabled) => ({ ...template, id: templateId, is_enabled: isEnabled }),
    setActiveVersion: async (templateId, versionId) => ({
      ...template,
      id: templateId,
      active_version_id: versionId,
    }),
    setLifecycleState: async (templateId, patch) => ({
      ...template,
      id: templateId,
      has_unpublished_draft: patch.hasUnpublishedDraft ?? template.has_unpublished_draft,
    }),
  };

  const versionRepository: PromptTemplateVersionRepository = {
    findById: async (id) => (id === version.id ? version : null),
    findActiveByTemplateId: async (templateId) => (templateId === template.id ? version : null),
    listByTemplateId: async (templateId) => (templateId === template.id ? [version] : []),
    create: async (input) => ({
      id: "version-new",
      template_id: input.templateId,
      version_number: 2,
      version_label: input.versionLabel,
      sections: input.sections,
      output_contract: input.outputContract,
      change_notes: input.changeNotes ?? "",
      is_active: Boolean(input.activate),
      created_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
    }),
    activate: async (templateId, versionId) => ({
      ...version,
      template_id: templateId,
      id: versionId,
      is_active: true,
    }),
  };

  const buildRepository: PromptBuildRepository = {
    create: async (input) => {
      const record = {
        id: `build-${builds.length + 1}`,
        company_id: input.companyId,
        conversation_id: input.conversationId ?? null,
        template_id: input.templateId,
        template_version_id: input.templateVersionId,
        template_key: input.templateKey,
        template_type: input.templateType,
        sections: input.sections,
        final_prompt: input.finalPrompt,
        output_contract: input.outputContract,
        created_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      };
      builds.push(record);
      return record as never;
    },
  };

  const contextService = new PromptContextService();
  const orchestrator = new PromptOrchestratorService(
    templateRepository,
    versionRepository,
    buildRepository,
    contextService,
  );
  const templates = new PromptTemplateService(templateRepository, versionRepository);

  return { orchestrator, templates, builds, templateRepository, versionRepository };
}

describe("Prompt builders", () => {
  it("merges modular builder sections from context", () => {
    const context = createSampleContext();
    const sections = mergeBuilderSections(
      [
        new SystemPromptBuilder(),
        new ConversationBuilder(),
        new ToolResultBuilder(),
        new PolicyBuilder(),
      ],
      context,
    );

    assert.ok(sections.system_instructions?.content.includes("VaultOS"));
    assert.ok(sections.recent_messages?.content.includes("What are your hours?"));
    assert.ok(sections.intent_decision?.content.includes("faq"));
    assert.ok(sections.tool_results?.content.includes("9am-5pm"));
    assert.ok(sections.language?.content.includes("CRITICAL LANGUAGE RULE"));
    assert.ok(sections.language?.content.includes("English"));
  });
});

describe("Prompt composition utilities", () => {
  it("orders conversation sections without recent messages or JSON output contract", () => {
    const context = createSampleContext();
    const merged = mergeBuilderSections(
      [new SystemPromptBuilder(), new ConversationBuilder(), new ToolResultBuilder(), new PolicyBuilder()],
      context,
    );
    const responseContractBuilder = new ResponseContractBuilder();
    const ordered = orderPromptSections(
      conversationTemplate.section_order,
      merged,
      responseContractBuilder,
      systemVersion,
      context.formattingRules,
      "conversation",
    );

    assert.deepEqual(
      ordered.map((section) => section.key),
      [
        "system_instructions",
        "assistant_profile",
        "conversation_state",
        "intent_decision",
        "tool_results",
        "language",
        "tone",
        "formatting_rules",
      ],
    );
  });

  it("orders execution sections with JSON output contract", () => {
    const context = createSampleContext();
    const merged = mergeBuilderSections(
      [new SystemPromptBuilder(), new ConversationBuilder(), new ToolResultBuilder(), new PolicyBuilder()],
      context,
    );
    const responseContractBuilder = new ResponseContractBuilder();
    const ordered = orderPromptSections(
      conversationTemplate.section_order,
      merged,
      responseContractBuilder,
      systemVersion,
      context.formattingRules,
      "execution",
    );

    assert.ok(ordered.some((section) => section.key === "output_contract"));
  });

  it("composes provider-independent final prompt text", () => {
    const prompt = composeFinalPrompt([
      { key: "system_instructions", title: "System Instructions", content: "Be helpful." },
      { key: "output_contract", title: "Output Contract", content: "Return JSON." },
    ]);

    assert.match(prompt, /## System Instructions/);
    assert.match(prompt, /## Output Contract/);
    assert.doesNotMatch(prompt, /openai|claude|gpt-/i);
  });
});

describe("PromptOrchestratorService", () => {
  it("builds a versioned prompt with output contract", async () => {
    const { orchestrator, builds } = createEnvironment();
    const result = await orchestrator.build(createContext(), {
      companyId: "company-1",
      templateKey: "conversation_default",
      conversationId: "conv-1",
      currentUserMessage: "What are your hours?",
      context: createSampleContext(),
    });

    assert.equal(result.template_key, "conversation_default");
    assert.equal(result.template_version_id, "version-1");
    assert.equal(result.output_contract.format, "text");
    assert.ok(result.gateway_messages.length > 0);
    assert.equal(result.message_plan.userMessage.length > 0 || result.message_plan.history.length > 0, true);
    assert.ok(result.final_prompt.length > 0);
    assert.ok(result.sections.length > 0);
    assert.equal(builds.length, 1);
  });

  it("rejects disabled templates", async () => {
    const { orchestrator } = createEnvironment({
      template: { ...conversationTemplate, is_enabled: false },
    });

    await assert.rejects(
      () =>
        orchestrator.build(createContext(), {
          companyId: "company-1",
          templateKey: "conversation_default",
          context: createSampleContext(),
        }),
      PromptTemplateDisabledError,
    );
  });

  it("requires prompts.view permission", async () => {
    const { orchestrator } = createEnvironment();

    await assert.rejects(
      () =>
        orchestrator.build(createContext({ hasPermission: () => false }), {
          companyId: "company-1",
          templateKey: "conversation_default",
          context: createSampleContext(),
        }),
      PermissionDeniedError,
    );
  });
});

describe("PromptTemplateService", () => {
  it("creates a new template version with incremented version number", async () => {
    const { templates } = createEnvironment();
    const version = await templates.createTemplateVersion(createContext(), {
      templateId: "template-1",
      versionLabel: "1.1.0",
      sections: systemVersion.sections,
      outputContract: systemVersion.output_contract,
      changeNotes: "Refined instructions",
      activate: true,
    });

    assert.equal(version.version_number, 2);
    assert.equal(version.version_label, "1.1.0");
    assert.equal(version.is_active, true);
  });
});

describe("PromptContextService", () => {
  it("normalizes defaults without provider-specific fields", () => {
    const service = new PromptContextService();
    const normalized = service.normalize({ companyId: "company-1" });

    assert.equal(normalized.language, "English");
    assert.equal(normalized.tone, "professional");
    assert.deepEqual(normalized.recentMessages, []);
  });
});
