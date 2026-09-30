import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { agentEditHref } from "../../config/agents-route-registry.ts";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import {
  haveSameMembers,
  legacyDetailTabToWizardStep,
  readinessCategoryToWizardStep,
} from "./utilities/ai-employee-wizard-step-routing.ts";
import {
  DEFAULT_AI_EMPLOYEE_FORM,
  formValuesToInsert,
  formValuesToUpdate,
  recordToFormValues,
  resolveFormRuntimeConfiguration,
} from "./validators/ai-employee-validators.js";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = resolve(here, "../..");

const storedRuntime = {
  ...DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  executionTimeoutMs: 45_000,
  retryCount: 0,
  sessionTimeoutMinutes: 30,
  disabledToolKeys: ["create_ticket"],
  transferableFlowId: "flow-1",
};

const sampleRow: AiEmployeeDbRow = {
  id: "agent-1",
  company_id: "company-1",
  name: "support-agent",
  display_name: "Support Agent",
  description: "",
  avatar: null,
  department: null,
  owner_id: null,
  status: "draft",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "Be helpful.",
  system_prompt_summary: "Be helpful.",
  welcome_message: "",
  knowledge_source_ids: [],
  knowledge_summary: "",
  allowed_tool_keys: ["create_ticket", "transfer_to_workflow"],
  tool_summary: "",
  allowed_skill_ids: [],
  skills_summary: "",
  tags: [],
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  deleted_at: null,
  created_by: null,
  updated_by: null,
  prompt_version_label: "v3",
  runtime_configuration: storedRuntime,
  published_version_id: null,
  current_version_number: 0,
  has_unpublished_draft: true,
};

describe("AI Employee wizard owns every setup field", () => {
  it("round-trips prompt version and runtime configuration through the edit form", () => {
    const form = recordToFormValues(mapAiEmployeeRow(sampleRow));
    assert.equal(form.promptVersionLabel, "v3");
    assert.deepEqual(form.runtimeConfiguration?.disabledToolKeys, ["create_ticket"]);
    assert.equal(form.runtimeConfiguration?.transferableFlowId, "flow-1");

    const update = formValuesToUpdate(form, []);
    assert.equal(update.prompt_version_label, "v3");
    assert.deepEqual(update.runtime_configuration, resolveFormRuntimeConfiguration(storedRuntime));
  });

  it("leaves stored runtime untouched when the form does not carry it", () => {
    const { runtimeConfiguration: _runtime, promptVersionLabel: _version, ...legacy } =
      recordToFormValues(mapAiEmployeeRow(sampleRow));
    const update = formValuesToUpdate(legacy, []);
    assert.equal("runtime_configuration" in update, false);
    assert.equal("prompt_version_label" in update, false);
  });

  it("creates new employees with the limits chosen in the wizard", () => {
    const insert = formValuesToInsert(
      "company-1",
      {
        ...DEFAULT_AI_EMPLOYEE_FORM,
        displayName: "Sales",
        promptVersionLabel: " v2 ",
        runtimeConfiguration: { ...storedRuntime, rateLimitPerMinute: 10 },
      },
      [],
    );
    assert.equal(insert.prompt_version_label, "v2");
    assert.equal(
      (insert.runtime_configuration as typeof storedRuntime).rateLimitPerMinute,
      10,
    );
    assert.equal(
      (insert.runtime_configuration as typeof storedRuntime).transferableFlowId,
      "flow-1",
    );
  });

  it("falls back to defaults for invalid or empty limits", () => {
    const resolved = resolveFormRuntimeConfiguration({
      executionTimeoutMs: Number.NaN,
      retryCount: -1,
      rateLimitPerMinute: 0,
      maxConcurrency: 2.4,
      transferableFlowId: "  ",
    });
    const defaults = DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION;
    assert.equal(resolved.executionTimeoutMs, defaults.executionTimeoutMs);
    assert.equal(resolved.retryCount, defaults.retryCount);
    assert.equal(resolved.rateLimitPerMinute, defaults.rateLimitPerMinute);
    assert.equal(resolved.maxConcurrency, 2);
    assert.equal(resolved.transferableFlowId, null);
  });

  it("maps legacy detail deep links and readiness gaps to wizard steps", () => {
    assert.equal(legacyDetailTabToWizardStep("channels", null), "channels");
    assert.equal(legacyDetailTabToWizardStep("knowledge", null), "tools");
    assert.equal(legacyDetailTabToWizardStep("setup", "tools"), "tools");
    assert.equal(legacyDetailTabToWizardStep("setup", "limits"), "intelligence");
    assert.equal(legacyDetailTabToWizardStep("setup", null), "general");
    assert.equal(legacyDetailTabToWizardStep("lifecycle", null), null);
    assert.equal(readinessCategoryToWizardStep("provider"), "intelligence");
    assert.equal(readinessCategoryToWizardStep("permissions"), "tools");
    assert.equal(agentEditHref("abc", "channels"), "/abc/edit?step=channels");
    assert.equal(haveSameMembers(["a", "b"], ["b", "a"]), true);
    assert.equal(haveSameMembers(["a"], ["a", "b"]), false);
  });

  it("detail page no longer hosts configuration editors", () => {
    const detail = readFileSync(
      resolve(loginAppSrc, "pages/dashboard/agents/agent-detail-page.tsx"),
      "utf8",
    );
    assert.doesNotMatch(detail, /AgentConfigurationWorkspace/);
    assert.doesNotMatch(detail, /ChannelInboundBindingPanel/);
    assert.doesNotMatch(detail, /useUpdateAiEmployeeConfiguration/);
    assert.doesNotMatch(detail, /useAssignAiEmployeeSkills/);
    assert.match(detail, /agentEditHref\(employee\.id, step\)/);
  });
});
