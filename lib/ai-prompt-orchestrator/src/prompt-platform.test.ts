import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comparePromptVersions } from "./lifecycle/compare-service.js";
import { PromptPreviewService } from "./lifecycle/preview-service.js";
import { validatePromptVersionForPublish } from "./lifecycle/publish-validation.js";
import { createDefaultVariableProviders } from "./providers/variable-providers.js";
import { createDefaultVariableProviderRegistry } from "./providers/variable-provider-registry.js";
import { createDefaultPromptPolicyRegistry } from "./policies/prompt-policy.js";
import { PromptRenderer } from "./rendering/prompt-renderer.js";
import { extractUniqueVariablePaths } from "./rendering/variable-parser.js";
import { createPromptPlatformRegistries } from "./registries/prompt-registries.js";
import { PromptComposer } from "./composition/prompt-composer.js";
import { PromptValidator } from "./validation/prompt-validator.js";
import { getPromptLibraryTemplate, listPromptLibraryTemplates } from "./templates/template-library.js";
import type { PromptTemplateVersionRecord } from "./types.js";

const sampleVersion: PromptTemplateVersionRecord = {
  id: "version-1",
  template_id: "template-1",
  version_number: 1,
  version_label: "1.0.0",
  sections: {
    system_instructions: {
      enabled: true,
      content: "Hello {{customer.name}} from {{company.name}} at {{system.time}}.",
    },
  },
  output_contract: { format: "text", instructions: "Reply clearly." },
  change_notes: "Initial",
  is_active: true,
  lifecycle_status: "published",
  created_at: new Date().toISOString(),
  created_by: null,
};

describe("Prompt renderer", () => {
  it("resolves nested variables without manual concatenation", () => {
    const registry = createDefaultVariableProviderRegistry(createDefaultVariableProviders());
    const renderer = new PromptRenderer(registry);
    const rendered = renderer.renderTemplate(sampleVersion.sections.system_instructions!.content!, {
      companyId: "company-1",
      customer: { name: "Alex" },
      company: { name: "VaultOS" },
    });
    assert.match(rendered.text, /Hello Alex from VaultOS/);
    assert.equal(rendered.unresolvedVariables.length, 0);
  });

  it("escapes unsafe values by default", () => {
    const registry = createDefaultVariableProviderRegistry(createDefaultVariableProviders());
    const renderer = new PromptRenderer(registry);
    const rendered = renderer.renderTemplate("Value: {{customer.name}}", {
      customer: { name: "<script>" },
    });
    assert.match(rendered.text, /&lt;script&gt;/);
  });
});

describe("Prompt validator", () => {
  it("detects unknown variables, empty sections, and max length", () => {
    const validator = new PromptValidator();
    const issues = validator.validate({
      sections: {
        system_instructions: { enabled: true, content: "Hello {{unknown.path}}" },
      },
      knownVariables: ["customer.name"],
      strictVariables: true,
      maxLength: 20,
    });
    assert.ok(issues.some((issue) => issue.id.startsWith("unknown")));
    assert.ok(issues.some((issue) => issue.id === "max-length"));
  });

  it("flags invalid variable syntax", () => {
    const validator = new PromptValidator();
    const issues = validator.validate({
      sections: {
        system_instructions: { enabled: true, content: "Broken {{customer.name" },
      },
    });
    assert.ok(issues.some((issue) => issue.id.includes("invalid-syntax")));
  });
});

describe("Prompt preview and composition", () => {
  it("previews rendered prompt with validation issues", () => {
    const registries = createPromptPlatformRegistries();
    const preview = new PromptPreviewService(
      registries.renderer,
      registries.validator,
      new PromptComposer(),
    );
    const result = preview.preview({
      sections: sampleVersion.sections,
      sectionOrder: ["system_instructions"],
      context: {
        customer: { name: "Alex" },
        company: { name: "VaultOS" },
      },
      outputContractInstructions: "Return concise text.",
    });
    assert.match(result.renderedPrompt, /Alex/);
    assert.ok(result.estimatedTokens > 0);
  });
});

describe("Prompt lifecycle", () => {
  it("blocks publish when prompt content is empty", () => {
    const issues = validatePromptVersionForPublish({
      ...sampleVersion,
      sections: { system_instructions: { enabled: true, content: "" } },
    });
    assert.ok(issues.some((issue) => issue.severity === "error"));
  });

  it("compares versions and reports section changes", () => {
    const other = {
      ...sampleVersion,
      id: "version-2",
      sections: {
        system_instructions: { enabled: true, content: "Updated {{customer.name}}" },
      },
    };
    const compare = comparePromptVersions(sampleVersion, other);
    assert.ok(compare.changes.some((change) => change.field === "sections"));
  });
});

describe("Prompt policies and registries", () => {
  it("enforces allowed providers through policy registry", () => {
    const policies = createDefaultPromptPolicyRegistry();
    const strict = policies.resolve("strict_json");
    const issues = policies.validateExecution(strict, { providerKey: "claude", model: "gpt-4o-mini" });
    assert.ok(issues.length > 0);
  });

  it("exposes enterprise template library presets", () => {
    assert.equal(listPromptLibraryTemplates().length, 10);
    assert.ok(getPromptLibraryTemplate("workflow_extract")?.sections.system_instructions?.content?.includes("{{extract.input}}"));
    assert.ok(getPromptLibraryTemplate("workflow_decision")?.sections.system_instructions?.content?.includes("{{decision.input}}"));
  });
});

describe("Variable parser", () => {
  it("extracts unique variable paths from templates", () => {
    const paths = extractUniqueVariablePaths("Hi {{customer.name}}, booking on {{booking.date}}.");
    assert.deepEqual(paths.sort(), ["booking.date", "customer.name"]);
  });
});
