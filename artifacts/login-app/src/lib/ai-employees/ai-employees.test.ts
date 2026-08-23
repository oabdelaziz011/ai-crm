import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAiEmployees,
  mapAiEmployeeRow,
  summarizeKnowledge,
  summarizeSystemPrompt,
  summarizeTools,
} from "./selectors/ai-employee-selectors.js";
import {
  hasAiEmployeesCreatePermission,
  hasAiEmployeesDeletePermission,
  hasAiEmployeesEditPermission,
  hasAiEmployeesViewPermission,
  isAiEmployeesWorkspaceAccessible,
} from "./permissions/ai-employees-access.js";
import {
  normalizeAiEmployeeName,
  resolveAiEmployeeInternalName,
} from "./validators/ai-employee-validators.js";
import { computeAiEmployeeListWindow } from "./virtualization/ai-employee-list-window.js";
import {
  agentContinueHref,
  agentDetailHref,
  agentEditHref,
  agentNewHref,
} from "../../config/agents-route-registry.js";
import type { AiEmployeeDbRow, AiEmployeeRecord } from "./types/ai-employee-types.js";

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
  welcome_message: "",
  knowledge_source_ids: ["kb-1", "kb-2"],
  knowledge_summary: "2 knowledge sources",
  allowed_tool_keys: ["knowledge_lookup"],
  tool_summary: "knowledge_lookup",
  allowed_skill_ids: [],
  skills_summary: "No skills assigned",
  tags: ["support", "tier-1"],
  created_at: "2026-07-31T10:00:00.000Z",
  updated_at: "2026-07-31T12:00:00.000Z",
  deleted_at: null,
  created_by: "user-1",
  updated_by: "user-1",
  prompt_version_label: "v1",
  runtime_configuration: {
    executionTimeoutMs: 120_000,
    retryCount: 2,
    rateLimitPerMinute: 60,
    maxConcurrency: 1,
    disabledToolKeys: [],
    runtimeFlags: {
      streaming: true,
      memoryMode: "session",
      confirmationPolicy: "destructive",
      recoveryEnabled: true,
      checkpointEnabled: true,
    },
    retrievalPolicy: {
      topK: 5,
      minScore: 0.7,
      priority: "balanced",
    },
  },
  published_version_id: null,
  current_version_number: 0,
  has_unpublished_draft: true,
};

function sampleRecord(overrides: Partial<AiEmployeeRecord> = {}): AiEmployeeRecord {
  return {
    ...mapAiEmployeeRow(sampleRow, "Jane Admin"),
    ...overrides,
  };
}

describe("AiEmployee selectors", () => {
  it("maps database rows to registry records", () => {
    const record = mapAiEmployeeRow(sampleRow, "Jane Admin");
    assert.equal(record.displayName, "Support Agent");
    assert.equal(record.owner, "Jane Admin");
    assert.deepEqual(record.knowledgeSourceIds, ["kb-1", "kb-2"]);
  });

  it("summarizes prompt, knowledge, and tools", () => {
    assert.match(summarizeSystemPrompt("Hello world"), /Hello world/);
    assert.equal(summarizeKnowledge(["Docs"]), "Docs");
    assert.equal(summarizeTools(["a", "b", "c", "d"]), "4 tools assigned");
  });

  it("filters employees by status, owner, tags, and search", () => {
    const employees = [
      sampleRecord(),
      sampleRecord({
        id: "agent-2",
        displayName: "Sales Bot",
        status: "draft",
        department: "Sales",
        ownerId: "user-2",
        owner: "Bob",
        tags: ["sales"],
        provider: "anthropic",
      }),
    ];

    assert.equal(filterAiEmployees(employees, { status: "published" }).length, 1);
    assert.equal(filterAiEmployees(employees, { ownerId: "user-2" }).length, 1);
    assert.equal(filterAiEmployees(employees, { tags: ["sales"] }).length, 1);
    assert.equal(filterAiEmployees(employees, { search: "sales" }).length, 1);
  });
});

describe("AiEmployee RBAC", () => {
  const has = (codes: string[]) => (code: string) => codes.includes(code);

  it("requires agents.view for workspace access", () => {
    assert.equal(
      isAiEmployeesWorkspaceAccessible({
        isSuperAdmin: false,
        hasPermission: has([]),
        agentsFeatureEnabled: true,
      }),
      false,
    );
    assert.equal(
      isAiEmployeesWorkspaceAccessible({
        isSuperAdmin: false,
        hasPermission: has(["agents.view"]),
        agentsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("maps create/edit/delete to dedicated permissions with manage fallback", () => {
    assert.equal(hasAiEmployeesViewPermission(has(["agents.view"]), false), true);
    assert.equal(hasAiEmployeesCreatePermission(has(["agents.create"]), false), true);
    assert.equal(hasAiEmployeesEditPermission(has(["agents.manage"]), false), true);
    assert.equal(hasAiEmployeesDeletePermission(has(["agents.delete"]), false), true);
  });
});

describe("AiEmployee registry helpers", () => {
  it("normalizes internal names", () => {
    assert.equal(normalizeAiEmployeeName("Support Agent 1"), "support-agent-1");
    assert.equal(normalizeAiEmployeeName("وكيل-الدعم"), "وكيل-الدعم");
    assert.equal(
      resolveAiEmployeeInternalName("", "موظف دعم"),
      normalizeAiEmployeeName("موظف دعم"),
    );
  });

  it("virtualizes large employee lists", () => {
    const window = computeAiEmployeeListWindow(500, 720, 480);
    assert.ok(window.endIndex > window.startIndex);
    assert.equal(window.totalHeight, 500 * 72);
  });

  it("exposes stable agent routes", () => {
    assert.equal(agentNewHref(), "/new");
    assert.equal(agentDetailHref("abc"), "/abc");
    assert.equal(agentEditHref("abc"), "/abc/edit");
    assert.equal(
      agentContinueHref("75d6c2ab-7a01-4dfa-91bb-580f9c8b8c0b"),
      "/new?draft=75d6c2ab-7a01-4dfa-91bb-580f9c8b8c0b",
    );
  });
});
