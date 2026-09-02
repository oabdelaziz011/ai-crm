import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = resolve(here, "../..");

describe("AI Employee wizard consolidation", () => {
  it("create wizard uses consolidated Control Center steps without new persistence", () => {
    const createPage = readFileSync(
      resolve(loginAppSrc, "pages/dashboard/agents/agent-create-wizard-page.tsx"),
      "utf8",
    );
    assert.match(createPage, /"general"/);
    assert.match(createPage, /"prompt"/);
    assert.match(createPage, /"intelligence"/);
    assert.match(createPage, /"knowledge"/);
    assert.match(createPage, /"tools"/);
    assert.match(createPage, /"channels"/);
    assert.match(createPage, /"review"/);
    assert.match(createPage, /useCreateAiEmployee/);
    assert.match(createPage, /useUpdateAiEmployee/);
    assert.match(createPage, /status:\s*"draft"/);
    assert.match(createPage, /agentContinueHref/);
    assert.match(createPage, /inferAiEmployeeWizardResumeStepIndex/);
    assert.doesNotMatch(createPage, /usePublishAiEmployee/);
  });

  it("edit page reuses the same step shell and updates by id only", () => {
    const editPage = readFileSync(
      resolve(loginAppSrc, "pages/dashboard/agents/agent-edit-page.tsx"),
      "utf8",
    );
    assert.match(editPage, /useUpdateAiEmployee/);
    assert.match(editPage, /"intelligence"/);
    assert.match(editPage, /"channels"/);
    assert.match(editPage, /never create/i);
    assert.doesNotMatch(editPage, /useCreateAiEmployee/);
    assert.doesNotMatch(editPage, /usePublishAiEmployee/);
  });

  it("form sections expose channels + intelligence without inventing RBAC", () => {
    const form = readFileSync(
      resolve(loginAppSrc, "lib/ai-employees/components/ai-employee-form-sections.tsx"),
      "utf8",
    );
    assert.match(form, /step === "channels"/);
    assert.match(form, /step === "intelligence"/);
    assert.match(form, /ChannelRoutingTagsField/);
    assert.match(form, /wizard\.review\.workflowsEmpty/);
    assert.match(form, /wizard\.review\.configureWorkflows/);
    assert.match(form, /wizard\.review\.lifecycle/);
  });

  it("view-details mode remains isolated from wizard mutations", () => {
    const detail = readFileSync(
      resolve(loginAppSrc, "pages/dashboard/agents/agent-detail-page.tsx"),
      "utf8",
    );
    assert.match(detail, /isAiEmployeeReadOnlyViewMode/);
    assert.match(detail, /canEditPermission && !isReadOnlyView/);
  });
});
