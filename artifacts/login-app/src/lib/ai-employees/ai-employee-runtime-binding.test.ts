import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentRuntimeConfiguration } from "./adapters/ai-employee-runtime-adapter.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";
import { evaluateEmployeeChannelRuntimeBinding } from "./services/evaluate-employee-channel-runtime-binding.js";
import {
  mergeEmployeePageContext,
  readAiEmployeeIdFromPageContext,
} from "./utilities/merge-employee-page-context.js";
import {
  attachAgentEmployeeExecutionContext,
  buildChannelRuntimeConfigFromExecutionContext,
  createAgentEmployeeExecutionContext,
  readAgentEmployeeExecutionContext,
} from "./utilities/agent-employee-execution-context.js";
import type { AiEmployeeRecord } from "./types/ai-employee-types.js";

function sampleEmployee(overrides: Partial<AiEmployeeRecord> = {}): AiEmployeeRecord {
  return {
    id: "agent-bind-1",
    companyId: "company-1",
    name: "support-agent",
    displayName: "Support Agent",
    description: "Handles tier-1 support",
    avatar: null,
    department: "Support",
    ownerId: "user-1",
    owner: "Jane Admin",
    status: "published",
    provider: "openai",
    model: "gpt-4.1",
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: "You are a helpful support agent.",
    systemPromptSummary: "You are a helpful support agent.",
    knowledgeSourceIds: ["kb-1"],
    knowledgeSummary: "1 knowledge source",
    allowedToolKeys: ["knowledge_lookup"],
    toolSummary: "knowledge_lookup",
    allowedSkillIds: [],
    skillsSummary: "No skills assigned",
    tags: ["support"],
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
    promptVersionLabel: "v1",
    runtimeConfiguration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
    publishedVersionId: "version-1",
    currentVersionNumber: 1,
    hasUnpublishedDraft: false,
    ...overrides,
  };
}

function buildPreview(employeeStatus: "published" | "draft" = "published") {
  return buildAgentRuntimeConfiguration({
    employee: {
      id: "agent-bind-1",
      name: "support-agent",
      displayName: "Support Agent",
      status: employeeStatus,
      provider: "openai",
      model: "gpt-4.1",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: "You are a helpful support agent.",
      systemPromptSummary: "You are a helpful support agent.",
      knowledgeSourceIds: ["kb-1"],
      allowedToolKeys: ["knowledge_lookup"],
      promptVersionLabel: "v1",
      runtimeConfiguration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
    },
    tenantRuntime: {
      providerConnectionId: "provider-conn-1",
      providerConnectionName: "OpenAI Default",
      providerRegistryKey: "openai",
      knowledgeRetrieval: {
        embeddingConnectionId: "embed-1",
        vectorStoreConnectionId: "vector-1",
        collectionId: "collection-1",
        collectionName: "Default",
      },
      missing: [],
    },
    knowledgeSources: [
      {
        id: "kb-1",
        name: "Support KB",
        sourceType: "document",
        documentCount: 3,
      },
    ],
    toolCatalog: [
      {
        key: "knowledge_lookup",
        displayName: "Knowledge Lookup",
        category: "knowledge",
        classification: "read",
        requiredPermissions: [],
        riskLevel: "low",
      },
    ],
    availableModels: ["gpt-4.1"],
  });
}

describe("evaluateEmployeeChannelRuntimeBinding", () => {
  it("returns channelRuntime for published ready employees", () => {
    const employee = sampleEmployee();
    const preview = buildPreview();
    const binding = evaluateEmployeeChannelRuntimeBinding(employee, preview);
    assert.ok(binding);
    assert.equal(binding.providerConnectionId, "provider-conn-1");
    assert.equal(binding.pageContext.aiEmployeeId, "agent-bind-1");
  });

  it("returns null when employee is missing", () => {
    assert.equal(evaluateEmployeeChannelRuntimeBinding(null, buildPreview()), null);
  });

  it("returns null when employee is not published", () => {
    const employee = sampleEmployee({ status: "draft" });
    assert.equal(evaluateEmployeeChannelRuntimeBinding(employee, buildPreview("published")), null);
  });

  it("returns null when preview is not ready", () => {
    const employee = sampleEmployee();
    const preview = buildPreview();
    preview.ready = false;
    assert.equal(evaluateEmployeeChannelRuntimeBinding(employee, preview), null);
  });

  it("returns null when channelRuntime is missing", () => {
    const employee = sampleEmployee();
    const preview = buildPreview();
    preview.channelRuntime = null;
    assert.equal(evaluateEmployeeChannelRuntimeBinding(employee, preview), null);
  });
});

describe("mergeEmployeePageContext", () => {
  it("merges employee page context over the base context", () => {
    const channelRuntime = buildPreview().channelRuntime;
    assert.ok(channelRuntime);
    const merged = mergeEmployeePageContext(
      { module: "customers", route: "/dashboard/customers" },
      channelRuntime,
    );
    assert.equal(merged.module, "customers");
    assert.equal(merged.aiEmployeeId, "agent-bind-1");
    assert.equal(merged.systemPrompt, "You are a helpful support agent.");
  });

  it("returns base context when no channel runtime is available", () => {
    const base = { module: "customers" };
    assert.deepEqual(mergeEmployeePageContext(base, null), base);
  });
});

describe("readAiEmployeeIdFromPageContext", () => {
  it("reads aiEmployeeId when present", () => {
    assert.equal(readAiEmployeeIdFromPageContext({ aiEmployeeId: "agent-1" }), "agent-1");
  });

  it("returns null when aiEmployeeId is absent", () => {
    assert.equal(readAiEmployeeIdFromPageContext({ module: "customers" }), null);
  });
});

describe("AgentEmployeeExecutionContext", () => {
  it("creates an immutable execution context once at start", () => {
    const channelRuntime = buildPreview().channelRuntime;
    assert.ok(channelRuntime);
    const mergedPageContext = mergeEmployeePageContext({ module: "customers" }, channelRuntime);
    const executionContext = createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext);
    const attached = attachAgentEmployeeExecutionContext(mergedPageContext, executionContext);

    assert.equal(executionContext.aiEmployeeId, "agent-bind-1");
    assert.equal(executionContext.providerConnectionId, "provider-conn-1");
    assert.deepEqual(executionContext.allowedToolKeys, ["knowledge_lookup"]);
    assert.equal(Object.isFrozen(executionContext), true);
    assert.equal(Object.isFrozen(executionContext.executionPolicy), true);
    assert.equal(Object.isFrozen(executionContext.pageContext), true);

    const roundTrip = readAgentEmployeeExecutionContext(attached);
    assert.ok(roundTrip);
    assert.equal(roundTrip.aiEmployeeId, "agent-bind-1");
    assert.equal(roundTrip.providerConnectionId, "provider-conn-1");
  });

  it("builds channel runtime config from execution context without re-resolving", () => {
    const channelRuntime = buildPreview().channelRuntime;
    assert.ok(channelRuntime);
    const mergedPageContext = mergeEmployeePageContext({ module: "customers" }, channelRuntime);
    const executionContext = createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext);
    const attached = attachAgentEmployeeExecutionContext(mergedPageContext, executionContext);
    const config = buildChannelRuntimeConfigFromExecutionContext(
      executionContext,
      attached,
    );

    assert.equal(config.providerConnectionId, "provider-conn-1");
    assert.equal(config.knowledgeRetrieval?.collectionId, "collection-1");
    assert.equal(config.executionPolicy?.maxDurationMs, 120_000);
    assert.equal((config.pageContext as Record<string, unknown>).module, "customers");
  });

  it("returns null when execution context is missing from page context", () => {
    assert.equal(readAgentEmployeeExecutionContext({ module: "customers" }), null);
  });
});
